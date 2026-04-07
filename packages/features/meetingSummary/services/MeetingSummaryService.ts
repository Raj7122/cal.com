import { MeetingSummaryStatus } from "@calcom/prisma/enums";

import { sendMeetingSummaryEmail } from "@calcom/emails/meeting-summary-email-service";
import { getTranslation } from "@calcom/i18n/server";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";

import type { MeetingSummaryRepository } from "../repositories/MeetingSummaryRepository";
import type { IAISummarizer } from "./IAISummarizer";

// HTTP status codes from Daily.co that indicate the transcript link has expired.
// Do not retry on these — mark FAILED immediately and return cleanly.
const EXPIRED_LINK_STATUSES = new Set([401, 403, 404, 410]);

export class MeetingSummaryService {
  constructor(
    private readonly repo: MeetingSummaryRepository,
    private readonly summarizer: IAISummarizer
  ) {}

  async generateSummary(bookingId: number, transcriptionUrl: string): Promise<void> {
    // Idempotent: reuse an existing PENDING record rather than creating a duplicate.
    let summary = await this.repo.findByBookingId(bookingId);
    if (!summary) {
      summary = await this.repo.create(bookingId);
    }

    await this.repo.updateStatus(summary.id, MeetingSummaryStatus.PROCESSING);

    try {
      // Download the transcript from Daily.co.
      const response = await fetch(transcriptionUrl);

      if (!response.ok) {
        if (EXPIRED_LINK_STATUSES.has(response.status)) {
          // Expired or missing link — mark failed, do not rethrow (no point retrying).
          await this.repo.updateStatus(summary.id, MeetingSummaryStatus.FAILED, {
            error: `Transcript link unavailable (HTTP ${response.status}). The Daily.co access link may have expired (12-hour TTL).`,
          });
          return;
        }
        throw new ErrorWithCode(
          ErrorCode.InternalServerError,
          `Failed to download transcript: HTTP ${response.status}`
        );
      }

      const transcript = await response.text();

      // Fetch booking context for prompt enrichment and email sending.
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: {
          title: true,
          uid: true,
          startTime: true,
          endTime: true,
          description: true,
          eventType: { select: { customReplyToEmail: true } },
          user: {
            select: { email: true, name: true, timeZone: true, locale: true },
          },
          userPrimaryEmail: true,
          attendees: {
            select: { id: true, name: true, email: true, timeZone: true, locale: true },
          },
        },
      });

      const context = {
        title: booking?.title,
        attendees: booking?.attendees.map((a) => a.name || a.email) ?? [],
      };

      const summaryText = await this.summarizer.summarize(transcript, context);

      await this.repo.updateStatus(summary.id, MeetingSummaryStatus.COMPLETED, {
        summary: summaryText,
        provider: "google",
        model: "gemini-2.0-flash",
      });

      if (booking) {
        await this.sendSummaryEmail(booking, summaryText);
      }
    } catch (err) {
      // Mark failed and rethrow so the tasker can retry on unexpected errors.
      await this.repo.updateStatus(summary.id, MeetingSummaryStatus.FAILED, {
        error: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Alternative entry point used by the dev-only trigger endpoint.
   * Accepts transcript text directly, skipping the HTTP download step.
   */
  async generateSummaryFromText(bookingId: number, transcriptText: string): Promise<void> {
    let summary = await this.repo.findByBookingId(bookingId);
    if (!summary) {
      summary = await this.repo.create(bookingId);
    }

    await this.repo.updateStatus(summary.id, MeetingSummaryStatus.PROCESSING);

    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: {
          title: true,
          uid: true,
          startTime: true,
          endTime: true,
          description: true,
          eventType: { select: { customReplyToEmail: true } },
          user: {
            select: { email: true, name: true, timeZone: true, locale: true },
          },
          userPrimaryEmail: true,
          attendees: {
            select: { id: true, name: true, email: true, timeZone: true, locale: true },
          },
        },
      });

      const context = {
        title: booking?.title,
        attendees: booking?.attendees.map((a) => a.name || a.email) ?? [],
      };

      const summaryText = await this.summarizer.summarize(transcriptText, context);

      await this.repo.updateStatus(summary.id, MeetingSummaryStatus.COMPLETED, {
        summary: summaryText,
        provider: "google",
        model: "gemini-2.0-flash",
      });

      if (booking) {
        await this.sendSummaryEmail(booking, summaryText);
      }
    } catch (err) {
      await this.repo.updateStatus(summary.id, MeetingSummaryStatus.FAILED, {
        error: (err as Error).message,
      });
      throw err;
    }
  }

  private async sendSummaryEmail(
    booking: {
      title: string;
      uid: string;
      startTime: Date;
      endTime: Date;
      description: string | null;
      eventType: { customReplyToEmail: string | null } | null;
      user: { email: string; name: string | null; timeZone: string; locale: string | null } | null;
      userPrimaryEmail: string | null;
      attendees: { id: number; name: string; email: string; timeZone: string; locale: string | null }[];
    },
    summaryText: string
  ): Promise<void> {
    const organizerLocale = booking.user?.locale ?? "en";
    const t = await getTranslation(organizerLocale, "common");

    const attendeesWithTranslations = await Promise.all(
      booking.attendees.map(async (attendee) => ({
        id: attendee.id,
        name: attendee.name,
        email: attendee.email,
        timeZone: attendee.timeZone,
        language: {
          translate: await getTranslation(attendee.locale ?? "en", "common"),
          locale: attendee.locale ?? "en",
        },
      }))
    );

    await sendMeetingSummaryEmail(
      {
        type: booking.title,
        title: booking.title,
        description: booking.description ?? undefined,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        uid: booking.uid,
        customReplyToEmail: booking.eventType?.customReplyToEmail ?? undefined,
        organizer: {
          email: booking.userPrimaryEmail ?? booking.user?.email ?? "",
          name: booking.user?.name ?? "",
          timeZone: booking.user?.timeZone ?? "UTC",
          language: { translate: t, locale: organizerLocale },
        },
        attendees: attendeesWithTranslations,
      },
      summaryText
    );
  }
}
