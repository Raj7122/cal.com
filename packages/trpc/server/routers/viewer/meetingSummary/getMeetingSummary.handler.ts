import { TRPCError } from "@trpc/server";

import prisma from "@calcom/prisma";
import type { MeetingSummaryStatusDto } from "@calcom/lib/dto/MeetingSummaryDto";

import type { TrpcSessionUser } from "../../../types";
import type { TGetMeetingSummaryInputSchema } from "./getMeetingSummary.schema";

type GetMeetingSummaryOptions = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: TGetMeetingSummaryInputSchema;
};

const statusMap: Record<string, MeetingSummaryStatusDto> = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

export async function getMeetingSummaryHandler({ ctx, input }: GetMeetingSummaryOptions) {
  const booking = await prisma.booking.findUnique({
    where: { uid: input.bookingUid },
    select: {
      id: true,
      userId: true,
      attendees: { select: { email: true } },
      meetingSummary: {
        select: {
          id: true,
          status: true,
          summary: true,
          error: true,
          createdAt: true,
        },
      },
    },
  });

  if (!booking) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
  }

  // Only the organizer or an attendee of the booking may view the summary.
  const isOrganizer = booking.userId === ctx.user.id;
  const isAttendee = booking.attendees.some((a) => a.email === ctx.user.email);

  if (!isOrganizer && !isAttendee) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this summary" });
  }

  if (!booking.meetingSummary) {
    return null;
  }

  const { meetingSummary } = booking;

  return {
    id: meetingSummary.id,
    status: statusMap[meetingSummary.status] ?? "PENDING",
    summary: meetingSummary.summary,
    error: meetingSummary.error,
    createdAt: meetingSummary.createdAt,
  };
}
