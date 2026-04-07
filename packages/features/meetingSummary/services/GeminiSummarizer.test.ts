import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Track the latest generateContent mock so tests can assert on it
let _mockGenerateContent: ReturnType<typeof vi.fn>;

vi.mock("@google/generative-ai", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class MockGoogleGenerativeAI {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_apiKey: string) {}
    getGenerativeModel() {
      return {
        generateContent: vi.fn().mockResolvedValue({
          response: { text: () => "## Executive Summary\nGreat meeting." },
        }),
      };
    }
  }
  return { GoogleGenerativeAI: MockGoogleGenerativeAI };
});

import { GeminiSummarizer, stripVttFormatting } from "./GeminiSummarizer";

describe("stripVttFormatting", () => {
  it("removes WEBVTT header", () => {
    const input = "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nHello world.";
    expect(stripVttFormatting(input)).toBe("Hello world.");
  });

  it("removes timestamp cue lines", () => {
    const input = "00:00:01.000 --> 00:00:05.000\nAlice: Hello.\n00:00:06.000 --> 00:00:10.000\nBob: Hi.";
    expect(stripVttFormatting(input)).toBe("Alice: Hello.\nBob: Hi.");
  });

  it("removes sequence number lines (blank line between cues is preserved)", () => {
    const input = "1\n00:00:01.000 --> 00:00:05.000\nAlice: Hello.\n\n2\n00:00:06.000 --> 00:00:10.000\nBob: Hi.";
    // The blank line separating VTT cue blocks is preserved as a paragraph break
    expect(stripVttFormatting(input)).toBe("Alice: Hello.\n\nBob: Hi.");
  });

  it("collapses excess blank lines", () => {
    const input = "Alice: Hello.\n\n\n\nBob: Hi.";
    expect(stripVttFormatting(input)).toBe("Alice: Hello.\n\nBob: Hi.");
  });

  it("returns empty string for a WEBVTT-only file", () => {
    expect(stripVttFormatting("WEBVTT")).toBe("");
  });
});

describe("GeminiSummarizer.summarize", () => {
  const summarizer = new GeminiSummarizer();
  const transcript = "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nAlice: Let's ship it.";

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("returns summary text on success", async () => {
    const result = await summarizer.summarize(transcript, {
      title: "Sprint Planning",
      attendees: ["Alice", "Bob"],
    });
    expect(result).toBe("## Executive Summary\nGreat meeting.");
  });

  it("throws ErrorWithCode when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(summarizer.summarize(transcript)).rejects.toThrow("GEMINI_API_KEY is not configured");
  });

  it("truncates transcript exceeding MAX_TRANSCRIPT_CHARS", async () => {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const mockGenerateContent = vi.fn().mockResolvedValue({
      response: { text: () => "Summary." },
    });

    // Spy on prototype to intercept the model call for this test only
    const getGenerativeModelSpy = vi
      .spyOn(GoogleGenerativeAI.prototype, "getGenerativeModel")
      .mockReturnValueOnce({ generateContent: mockGenerateContent } as never);

    const longTranscript = "A".repeat(3_000_000);
    await summarizer.summarize(longTranscript);

    const calledPrompt = mockGenerateContent.mock.calls[0][0] as string;
    // The transcript portion in the prompt should be truncated to MAX_TRANSCRIPT_CHARS
    expect(calledPrompt.length).toBeLessThan(3_000_000);

    getGenerativeModelSpy.mockRestore();
  });
});
