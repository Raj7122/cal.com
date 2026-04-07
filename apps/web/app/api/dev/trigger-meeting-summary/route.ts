import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// This endpoint only exists in development. Return 404 in production so it is
// never accidentally exposed.
if (process.env.NODE_ENV === "production") {
  throw new Error("Dev-only endpoint must not be included in production builds.");
}

const bodySchema = z.union([
  z.object({
    bookingId: z.number().int().positive(),
    transcriptionUrl: z.string().url(),
  }),
  z.object({
    bookingId: z.number().int().positive(),
    transcriptText: z.string().min(1),
  }),
]);

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const json = await req.json();
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid request body", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { bookingId } = parsed.data;

  const { MeetingSummaryRepository } = await import(
    "@calcom/features/meetingSummary/repositories/MeetingSummaryRepository"
  );
  const { GeminiSummarizer } = await import(
    "@calcom/features/meetingSummary/services/GeminiSummarizer"
  );
  const { MeetingSummaryService } = await import(
    "@calcom/features/meetingSummary/services/MeetingSummaryService"
  );

  const repo = new MeetingSummaryRepository();
  const summarizer = new GeminiSummarizer();
  const service = new MeetingSummaryService(repo, summarizer);

  try {
    if ("transcriptText" in parsed.data) {
      await service.generateSummaryFromText(bookingId, parsed.data.transcriptText);
    } else {
      await service.generateSummary(bookingId, parsed.data.transcriptionUrl);
    }

    const summary = await repo.findByBookingId(bookingId);
    return NextResponse.json({ message: "Success", summary });
  } catch (err) {
    return NextResponse.json(
      { message: "Summary generation failed", error: (err as Error).message },
      { status: 500 }
    );
  }
}
