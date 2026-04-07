import { z } from "zod";

export const ZGetMeetingSummaryInputSchema = z.object({
  bookingUid: z.string(),
});

export type TGetMeetingSummaryInputSchema = z.infer<typeof ZGetMeetingSummaryInputSchema>;
