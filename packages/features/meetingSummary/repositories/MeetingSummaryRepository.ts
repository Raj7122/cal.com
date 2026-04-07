import { MeetingSummaryStatus } from "@calcom/prisma/enums";

import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import type { MeetingSummaryDto } from "@calcom/lib/dto/MeetingSummaryDto";

const meetingSummarySelect = {
  id: true,
  bookingId: true,
  summary: true,
  status: true,
  provider: true,
  model: true,
  error: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toDto(record: {
  id: number;
  bookingId: number;
  summary: string | null;
  status: MeetingSummaryStatus;
  provider: string | null;
  model: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MeetingSummaryDto {
  const statusMap: Record<MeetingSummaryStatus, MeetingSummaryDto["status"]> = {
    [MeetingSummaryStatus.PENDING]: "PENDING",
    [MeetingSummaryStatus.PROCESSING]: "PROCESSING",
    [MeetingSummaryStatus.COMPLETED]: "COMPLETED",
    [MeetingSummaryStatus.FAILED]: "FAILED",
  };
  return {
    ...record,
    status: statusMap[record.status],
  };
}

export class MeetingSummaryRepository {
  async create(bookingId: number): Promise<MeetingSummaryDto> {
    try {
      const record = await prisma.meetingSummary.create({
        data: { bookingId },
        select: meetingSummarySelect,
      });
      return toDto(record);
    } catch (err) {
      throw new ErrorWithCode(
        ErrorCode.InternalServerError,
        `Failed to create MeetingSummary for bookingId ${bookingId}: ${(err as Error).message}`
      );
    }
  }

  async findByBookingId(bookingId: number): Promise<MeetingSummaryDto | null> {
    const record = await prisma.meetingSummary.findUnique({
      where: { bookingId },
      select: meetingSummarySelect,
    });
    return record ? toDto(record) : null;
  }

  async updateStatus(
    id: number,
    status: MeetingSummaryStatus,
    data?: {
      summary?: string;
      error?: string;
      provider?: string;
      model?: string;
    }
  ): Promise<void> {
    await prisma.meetingSummary.update({
      where: { id },
      data: { status, ...data },
      select: { id: true },
    });
  }
}
