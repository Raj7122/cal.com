import { GoogleGenerativeAI } from "@google/generative-ai";

import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";

import type { IAISummarizer } from "./IAISummarizer";

const MODEL_ID = "gemini-2.0-flash";

// Gemini 2.0 Flash has a 1M token context window (~3M chars). Truncate at 2.5M
// to leave room for the prompt template itself.
const MAX_TRANSCRIPT_CHARS = 2_500_000;

const VTT_TIMESTAMP_LINE = /^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}.*$/;
const VTT_SEQUENCE_LINE = /^\d+$/;

/** Strip WEBVTT header, sequence numbers, and timestamp cue lines from a VTT string. */
export function stripVttFormatting(vtt: string): string {
  return vtt
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed === "WEBVTT") return false;
      if (VTT_TIMESTAMP_LINE.test(trimmed)) return false;
      if (VTT_SEQUENCE_LINE.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class GeminiSummarizer implements IAISummarizer {
  async summarize(
    transcript: string,
    context?: { title?: string; attendees?: string[] }
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ErrorWithCode(
        ErrorCode.InternalServerError,
        "GEMINI_API_KEY is not configured. Set it in your environment variables."
      );
    }

    const cleanedTranscript = stripVttFormatting(transcript);
    const truncated =
      cleanedTranscript.length > MAX_TRANSCRIPT_CHARS
        ? cleanedTranscript.slice(0, MAX_TRANSCRIPT_CHARS)
        : cleanedTranscript;

    const title = context?.title ?? "Untitled Meeting";
    const attendees =
      context?.attendees && context.attendees.length > 0
        ? context.attendees.join(", ")
        : "Not specified";

    const prompt = `You are summarizing a Cal Video meeting transcript. Provide a structured summary with these four sections:

1. **Executive Summary** (2-3 sentences capturing the essence of the meeting)
2. **Key Discussion Points** (bullet list of main topics covered)
3. **Decisions Made** (bullet list, or "None identified" if none)
4. **Action Items** (bullet list including the owner if identifiable, or "None identified" if none)

Meeting: ${title}
Attendees: ${attendees}

Transcript:
${truncated}`;

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: MODEL_ID });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    if (!text) {
      throw new ErrorWithCode(ErrorCode.InternalServerError, "Gemini returned an empty response.");
    }

    return text;
  }
}
