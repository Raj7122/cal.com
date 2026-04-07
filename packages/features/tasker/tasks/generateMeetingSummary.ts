import { z } from "zod";

const schema = z.object({
  bookingId: z.number().int().positive(),
  transcriptionUrl: z.string().url(),
});

export async function generateMeetingSummary(payload: string): Promise<void> {
  const { bookingId, transcriptionUrl } = schema.parse(JSON.parse(payload));

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

  await service.generateSummary(bookingId, transcriptionUrl);
}
