import { MeetingSummaryStatus } from "@calcom/prisma/enums";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock prisma before importing the repository
vi.mock("@calcom/prisma", () => ({
  default: {
    meetingSummary: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import prisma from "@calcom/prisma";
import { MeetingSummaryRepository } from "./MeetingSummaryRepository";

const repo = new MeetingSummaryRepository();

const mockRecord = {
  id: 1,
  bookingId: 42,
  summary: null,
  status: MeetingSummaryStatus.PENDING,
  provider: null,
  model: null,
  error: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MeetingSummaryRepository.create", () => {
  it("creates a PENDING record and returns a DTO", async () => {
    vi.mocked(prisma.meetingSummary.create).mockResolvedValue(mockRecord);

    const result = await repo.create(42);

    expect(prisma.meetingSummary.create).toHaveBeenCalledWith({
      data: { bookingId: 42 },
      select: expect.objectContaining({ id: true, bookingId: true, status: true }),
    });
    expect(result.status).toBe("PENDING");
    expect(result.bookingId).toBe(42);
  });

  it("throws ErrorWithCode when prisma fails", async () => {
    vi.mocked(prisma.meetingSummary.create).mockRejectedValue(new Error("DB down"));

    await expect(repo.create(42)).rejects.toThrow("Failed to create MeetingSummary");
  });
});

describe("MeetingSummaryRepository.findByBookingId", () => {
  it("returns null when no record exists", async () => {
    vi.mocked(prisma.meetingSummary.findUnique).mockResolvedValue(null);

    const result = await repo.findByBookingId(99);

    expect(result).toBeNull();
  });

  it("returns a DTO when a record exists", async () => {
    vi.mocked(prisma.meetingSummary.findUnique).mockResolvedValue({
      ...mockRecord,
      status: MeetingSummaryStatus.COMPLETED,
      summary: "Great meeting.",
    });

    const result = await repo.findByBookingId(42);

    expect(result?.status).toBe("COMPLETED");
    expect(result?.summary).toBe("Great meeting.");
  });
});

describe("MeetingSummaryRepository.updateStatus", () => {
  it("persists status with no optional fields", async () => {
    vi.mocked(prisma.meetingSummary.update).mockResolvedValue(mockRecord);

    await repo.updateStatus(1, MeetingSummaryStatus.PROCESSING);

    expect(prisma.meetingSummary.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: MeetingSummaryStatus.PROCESSING },
      select: { id: true },
    });
  });

  it("persists status with all optional fields", async () => {
    vi.mocked(prisma.meetingSummary.update).mockResolvedValue(mockRecord);

    await repo.updateStatus(1, MeetingSummaryStatus.COMPLETED, {
      summary: "Summary text",
      provider: "google",
      model: "gemini-2.0-flash",
    });

    expect(prisma.meetingSummary.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        status: MeetingSummaryStatus.COMPLETED,
        summary: "Summary text",
        provider: "google",
        model: "gemini-2.0-flash",
      },
      select: { id: true },
    });
  });
});
