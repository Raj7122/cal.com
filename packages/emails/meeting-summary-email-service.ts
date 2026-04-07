import type { CalendarEvent } from "@calcom/types/Calendar";

import OrganizerMeetingSummaryEmail from "./templates/organizer-meeting-summary-email";

export const sendMeetingSummaryEmail = async (calEvent: CalendarEvent, summary: string) => {
  return new OrganizerMeetingSummaryEmail(calEvent, summary).sendEmail();
};
