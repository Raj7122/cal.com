import type { TFunction } from "i18next";

import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent } from "@calcom/types/Calendar";

import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export default class OrganizerMeetingSummaryEmail extends BaseEmail {
  calEvent: CalendarEvent;
  summary: string;
  t: TFunction;

  constructor(calEvent: CalendarEvent, summary: string) {
    super();
    this.name = "SEND_MEETING_SUMMARY";
    this.calEvent = calEvent;
    this.summary = summary;
    this.t = this.calEvent.organizer.language.translate;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      to: `${this.calEvent.organizer.email}`,
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      ...getReplyToHeader(
        this.calEvent,
        this.calEvent.attendees.map(({ email }) => email),
        true
      ),
      subject: this.t("meeting_summary_email_subject", {
        title: this.calEvent.title,
      }),
      html: await renderEmail("MeetingSummaryEmail", {
        title: this.calEvent.title,
        date: this.getFormattedDate(),
        summary: this.summary,
        language: this.t,
        name: this.calEvent.organizer.name,
      }),
    };
  }

  protected getTimezone(): string {
    return this.calEvent.organizer.timeZone;
  }

  protected getOrganizerStart(format: string) {
    return this.getFormattedRecipientTime({ time: this.calEvent.startTime, format });
  }

  protected getOrganizerEnd(format: string) {
    return this.getFormattedRecipientTime({ time: this.calEvent.endTime, format });
  }

  protected getLocale(): string {
    return this.calEvent.organizer.language.locale;
  }

  protected getFormattedDate() {
    const organizerTimeFormat = this.calEvent.organizer.timeFormat || TimeFormat.TWELVE_HOUR;

    return `${this.getOrganizerStart(organizerTimeFormat)} - ${this.getOrganizerEnd(
      organizerTimeFormat
    )}, ${this.t(this.getOrganizerStart("dddd").toLowerCase())}, ${this.t(
      this.getOrganizerStart("MMMM").toLowerCase()
    )} ${this.getOrganizerStart("D, YYYY")}`;
  }
}
