// String literal union keeps this DTO ORM-agnostic — no Prisma import in packages/lib
export type MeetingSummaryStatusDto = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export type MeetingSummaryDto = {
  id: number;
  bookingId: number;
  summary: string | null;
  status: MeetingSummaryStatusDto;
  provider: string | null;
  model: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};
