import { MeetingSummaryStatus } from "@calcom/prisma/enums";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@calcom/emails/meeting-summary-email-service", () => ({
  sendMeetingSummaryEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    booking: {
      findUnique: vi.fn().mockResolvedValue({
        title: "Sprint Planning",
        description: null,
        uid: "test-uid-123",
        startTime: new Date("2026-01-01T10:00:00Z"),
        endTime: new Date("2026-01-01T11:00:00Z"),
        attendees: [{ name: "Alice", email: "alice@example.com" }],
      }),
    },
  },
}));

import { MeetingSummaryService } from "./MeetingSummaryService";
import type { MeetingSummaryRepository } from "../repositories/MeetingSummaryRepository";
import type { IAISummarizer } from "./IAISummarizer";

const mockSummaryRecord = { id: 1, bookingId: 42, status: "PENDING" as const };

function makeRepo(overrides?: Partial<MeetingSummaryRepository>): MeetingSummaryRepository {
  return {
    create: vi.fn().mockResolvedValue(mockSummaryRecord),
    findByBookingId: vi.fn().mockResolvedValue(null),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MeetingSummaryRepository;
}

function makeSummarizer(text = "Great meeting."): IAISummarizer {
  return { summarize: vi.fn().mockResolvedValue(text) };
}

function mockFetch(status: number, body = "") {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset global.fetch so generateSummaryFromText tests can assert it was never called
  (global as { fetch?: unknown }).fetch = undefined;
});

describe("MeetingSummaryService.generateSummary", () => {
  it("happy path: creates → processing → completed", async () => {
    mockFetch(200, "WEBVTT\n\nAlice: Let us ship.");
    const repo = makeRepo();
    const summarizer = makeSummarizer("Summary text.");
    const service = new MeetingSummaryService(repo, summarizer);

    await service.generateSummary(42, "https://daily.co/transcript.vtt");

    expect(repo.create).toHaveBeenCalledWith(42);
    expect(repo.updateStatus).toHaveBeenCalledWith(1, MeetingSummaryStatus.PROCESSING);
    expect(repo.updateStatus).toHaveBeenCalledWith(1, MeetingSummaryStatus.COMPLETED, {
      summary: "Summary text.",
      provider: "google",
      model: "gemini-2.0-flash",
    });
  });

  it("reuses existing PENDING record instead of creating a duplicate", async () => {
    mockFetch(200, "transcript");
    const repo = makeRepo({ findByBookingId: vi.fn().mockResolvedValue(mockSummaryRecord) });
    const service = new MeetingSummaryService(repo, makeSummarizer());

    await service.generateSummary(42, "https://daily.co/transcript.vtt");

    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 410])(
    "marks FAILED (no rethrow) when transcript link returns HTTP %i",
    async (status) => {
      mockFetch(status);
      const repo = makeRepo();
      const service = new MeetingSummaryService(repo, makeSummarizer());

      // Should NOT throw
      await expect(service.generateSummary(42, "https://daily.co/transcript.vtt")).resolves.toBeUndefined();

      expect(repo.updateStatus).toHaveBeenCalledWith(
        1,
        MeetingSummaryStatus.FAILED,
        expect.objectContaining({ error: expect.stringContaining(`HTTP ${status}`) })
      );
    }
  );

  it("marks FAILED and rethrows on Gemini failure (enables tasker retry)", async () => {
    mockFetch(200, "transcript");
    const repo = makeRepo();
    const summarizer: IAISummarizer = {
      summarize: vi.fn().mockRejectedValue(new Error("Gemini API error")),
    };
    const service = new MeetingSummaryService(repo, summarizer);

    await expect(service.generateSummary(42, "https://daily.co/transcript.vtt")).rejects.toThrow(
      "Gemini API error"
    );

    expect(repo.updateStatus).toHaveBeenCalledWith(
      1,
      MeetingSummaryStatus.FAILED,
      expect.objectContaining({ error: "Gemini API error" })
    );
  });
});

describe("MeetingSummaryService.generateSummaryFromText", () => {
  it("calls summarizer with inline text, skipping fetch", async () => {
    const repo = makeRepo();
    const summarizer = makeSummarizer("Inline summary.");
    const service = new MeetingSummaryService(repo, summarizer);

    await service.generateSummaryFromText(42, "Alice: Hello.");

    expect(global.fetch).toBeUndefined();
    expect(repo.updateStatus).toHaveBeenCalledWith(1, MeetingSummaryStatus.COMPLETED, expect.any(Object));
  });
});
