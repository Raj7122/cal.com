# AI Meeting Summarizer - Integration Plan

## Context

**GitHub Issue:** [calcom/cal.com#22522](https://github.com/calcom/cal.com/issues/22522)

Cal Video (powered by Daily.co) already has recording and transcription, but no AI-powered summarization. This plan adds automatic meeting summaries generated from transcripts after Cal Video meetings end.

---

## Data Flow

```
Meeting ends
  → Daily.co webhook: recording.ready-to-download
    → (existing) marks booking recorded, submits transcription batch job
  → Daily.co webhook: batch-processor.job-finished
    → (existing) triggers RECORDING_TRANSCRIPTION_GENERATED webhook
    → (NEW) checks CalVideoSettings.enableAIMeetingSummary
    → (NEW) creates MeetingSummary record (status: PENDING)
    → (NEW) enqueues Tasker task: generateMeetingSummary
      → Downloads transcript from Daily access link
      → Sends to OpenAI for summarization
      → Updates MeetingSummary (status: COMPLETED, summary text)
      → Sends summary email to organizer
  → User views booking detail page
    → tRPC query fetches MeetingSummary
    → Renders summary in collapsible section
```

---

## Module 1: Database Schema + Feature Flag

**Goal:** Add the data model and feature flag. No application code yet.

**Files to modify:**
- `packages/prisma/schema.prisma`

**Changes:**

1. Add new enum:
```prisma
enum MeetingSummaryStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

2. Add new model:
```prisma
model MeetingSummary {
  id        Int                  @id @default(autoincrement())
  bookingId Int                  @unique
  booking   Booking              @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  summary   String?
  status    MeetingSummaryStatus @default(PENDING)
  provider  String?
  model     String?
  error     String?
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt
}
```

3. Add relation to Booking model:
```prisma
meetingSummary MeetingSummary?
```

4. Add field to CalVideoSettings model:
```prisma
enableAIMeetingSummary Boolean @default(false)
```

**Post-step commands:**
```bash
npx prisma migrate dev --name add_meeting_summary
yarn prisma generate
yarn type-check:ci --force
```

**Feature flag seed migration:**
```sql
INSERT INTO "Feature" ("slug", "enabled", "type", "description", "createdAt", "updatedAt")
VALUES ('ai-meeting-summary', false, 'OPERATIONAL', 'AI-powered meeting summary generation from Cal Video transcripts', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
```

**Verification:**
- [ ] Migration runs without errors
- [ ] `yarn prisma generate` succeeds
- [ ] `yarn type-check:ci --force` passes (no new errors)

---

## Module 2: Repository Layer

**Goal:** Data access for MeetingSummary records.

**Files to create:**
- `packages/features/meetingSummary/repositories/MeetingSummaryRepository.ts`

**Details:**

```typescript
// Methods:
create(bookingId: number): Promise<MeetingSummaryDTO>
updateStatus(id: number, status: MeetingSummaryStatus, data?: { summary?: string; error?: string; provider?: string; model?: string }): Promise<void>
findByBookingId(bookingId: number): Promise<MeetingSummaryDTO | null>
```

**Rules:**
- Uses `select` (never `include`) per Cal.com standards
- Uses `prisma` client directly (repositories are allowed to)
- Returns plain DTOs, not Prisma types
- No business logic — pure data access
- Uses `ErrorWithCode` for errors (not TRPCError)

**Verification:**
```bash
yarn type-check:ci --force
```
- [ ] Type check passes
- [ ] Repository follows naming conventions (no entity name in method names)

---

## Module 3: AI Summarizer Service

**Goal:** Interface + OpenAI implementation for transcript summarization.

**Files to create:**
- `packages/features/meetingSummary/services/IAISummarizer.ts`
- `packages/features/meetingSummary/services/OpenAISummarizer.ts`

**Interface:**
```typescript
export interface IAISummarizer {
  summarize(
    transcript: string,
    context?: { title?: string; attendees?: string[] }
  ): Promise<string>;
}
```

**OpenAI Implementation:**
- Uses `OPENAI_API_KEY` from `process.env`
- Model: `gpt-4o-mini` (128k context, ~$0.003 per summary)
- Prompt requests: key discussion points, decisions made, action items, executive summary
- Strips VTT timestamps/headers from transcript before sending
- Truncation safety for transcripts exceeding ~100k tokens

**Environment variable to add to `.env.example`:**
```
# AI Meeting Summary (OpenAI)
# OPENAI_API_KEY=
```

**Verification:**
```bash
yarn type-check:ci --force
```
- [ ] Type check passes
- [ ] No `as any` usage
- [ ] `OPENAI_API_KEY` is never logged

---

## Module 4: Meeting Summary Service (Business Logic)

**Goal:** Orchestration service that ties repository + AI summarizer together.

**Files to create:**
- `packages/features/meetingSummary/services/MeetingSummaryService.ts`

**Method:**
```typescript
async generateSummary(bookingId: number, transcriptionUrl: string): Promise<void>
```

**Flow:**
1. Create MeetingSummary record (status: PENDING)
2. Update status to PROCESSING
3. Download transcript from `transcriptionUrl` (Daily.co access link)
4. Fetch booking context (title, attendees) for prompt enrichment
5. Call `IAISummarizer.summarize(transcript, context)`
6. Update MeetingSummary (status: COMPLETED, summary text, provider, model)
7. Send summary email to organizer (Module 6)
8. On error: update status to FAILED with error message

**Rules:**
- Uses `ErrorWithCode` (not TRPCError — this is `packages/features/`)
- Does NOT import from `@calcom/trpc`
- Handles expired transcription links gracefully (12-hour TTL)

**Verification:**
```bash
yarn type-check:ci --force
```
- [ ] Type check passes
- [ ] No imports from `@calcom/trpc`
- [ ] Error handling uses `ErrorWithCode`

---

## Module 5: Tasker Integration

**Goal:** Register the async task so it can be enqueued from the webhook handler.

**Files to modify:**
- `packages/features/tasker/tasker.ts` — add to `TaskPayloads`:
  ```typescript
  generateMeetingSummary: {
    bookingId: number;
    transcriptionUrl: string;
  };
  ```
- `packages/features/tasker/tasks/index.ts` — register handler + config:
  ```typescript
  generateMeetingSummary: () =>
    import("./generateMeetingSummary").then((m) => m.generateMeetingSummary),
  ```
  Config: `{ maxAttempts: 2, minRetryIntervalMins: 5 }`

**Files to create:**
- `packages/features/tasker/tasks/generateMeetingSummary.ts` — task handler that:
  1. Parses payload
  2. Calls `MeetingSummaryService.generateSummary(bookingId, transcriptionUrl)`
  3. Logs success/failure

**Verification:**
```bash
yarn type-check:ci --force
```
- [ ] Type check passes
- [ ] Task handler uses dynamic imports (not eager)

---

## Module 6: Webhook Handler Hook (Integration Point)

**Goal:** Wire the summarizer into the existing Daily.co webhook flow.

**Files to modify:**

1. `apps/web/lib/daily-webhook/getBooking.ts` (line ~24)
   - Add to `eventType.select`:
     ```typescript
     enableAIMeetingSummary: true,
     ```
   - This is alongside existing `canSendCalVideoTranscriptionEmails`
   - Note: `enableAIMeetingSummary` is on `CalVideoSettings`, so check if `calVideoSettings` is already selected. If not, add:
     ```typescript
     calVideoSettings: {
       select: { enableAIMeetingSummary: true }
     }
     ```

2. `apps/web/app/api/recorded-daily-video/route.ts` (after line ~219)
   - In the `batch-processor.job-finished` handler, after `triggerTranscriptionGeneratedWebhook`, add:
     ```typescript
     // Enqueue AI meeting summary generation if enabled
     const enableAIMeetingSummary = booking.eventType?.calVideoSettings?.enableAIMeetingSummary;
     if (enableAIMeetingSummary && batchProcessorJobAccessLink?.transcription) {
       const { getTasker } = await import("@calcom/features/tasker");
       const tasker = await getTasker();
       await tasker.create("generateMeetingSummary", {
         bookingId: bookingReference.bookingId as number,
         transcriptionUrl: batchProcessorJobAccessLink.transcription,
       });
     }
     ```

**Key detail:** The `canSendCalVideoTranscriptionEmails` field is directly on EventType (line 24 of getBooking.ts), but `enableAIMeetingSummary` is on the `CalVideoSettings` relation. Need to select through `calVideoSettings`.

**Verification:**
```bash
yarn type-check:ci --force
```
- [ ] Type check passes
- [ ] Webhook handler doesn't break existing flow (new code is additive)
- [ ] Failure in summary generation doesn't affect webhook response

---

## Module 7: Email Notification

**Goal:** Send AI summary to organizer via email after generation.

**Files to create:**
- `packages/emails/templates/organizer-meeting-summary-email.ts`
  - Extends `BaseEmail`
  - Follows pattern of `organizer-daily-video-download-transcript-email.ts`
- `packages/emails/src/templates/MeetingSummaryEmail.tsx`
  - React email template with sections: key points, action items, decisions
  - Includes disclaimer: "This summary was generated by AI and may not be perfectly accurate."

**Files to modify:**
- `packages/i18n/locales/en/common.json` — add keys:
  - `"meeting_summary_email_subject": "Meeting Summary: {{title}}"`
  - `"meeting_summary_heading": "AI Meeting Summary"`
  - `"meeting_summary_disclaimer": "This summary was generated by AI and may not be perfectly accurate."`
  - `"meeting_summary_key_points": "Key Discussion Points"`
  - `"meeting_summary_action_items": "Action Items"`
  - `"meeting_summary_decisions": "Decisions Made"`

**Verification:**
```bash
yarn type-check:ci --force
yarn biome check --write .
```
- [ ] Type check passes
- [ ] All UI strings use i18n keys
- [ ] Email template renders correctly

---

## Module 8: tRPC API Endpoint

**Goal:** Expose meeting summary data to the frontend.

**Files to create:**
- `packages/trpc/server/routers/viewer/meetingSummary/getMeetingSummary.schema.ts`
  - Input: `{ bookingUid: z.string() }`
- `packages/trpc/server/routers/viewer/meetingSummary/getMeetingSummary.handler.ts`
  - Fetches summary by booking UID
  - Verifies requesting user is organizer or attendee (auth check)
  - Returns summary data or null
- `packages/trpc/server/routers/viewer/meetingSummary/_router.ts`
  - `get` procedure using protectedProcedure

**Files to modify:**
- `packages/trpc/server/routers/viewer/_router.tsx` — register `meetingSummary` sub-router

**Verification:**
```bash
yarn type-check:ci --force
```
- [ ] Type check passes
- [ ] Auth check prevents unauthorized access
- [ ] Uses `select` for any Prisma queries

---

## Module 9: Frontend UI

**Goal:** Display summary in booking detail + add event type toggle.

**Files to modify:**

1. `apps/web/modules/bookings/views/bookings-single-view.tsx`
   - Add collapsible "AI Meeting Summary" section
   - Uses `trpc.viewer.meetingSummary.get.useQuery({ bookingUid })`
   - States: loading (PENDING/PROCESSING), completed (show summary), failed (error message)
   - Sparkles icon + disclaimer badge

2. `apps/web/modules/event-types/components/tabs/advanced/EventAdvancedTab.tsx`
   - Add `SettingsToggle` for "AI Meeting Summary"
   - Place near existing transcription settings
   - Guard behind `ai-meeting-summary` feature flag

**Files to modify:**
- `packages/i18n/locales/en/common.json` — add keys:
  - `"ai_meeting_summary": "AI Meeting Summary"`
  - `"ai_meeting_summary_description": "Automatically generate an AI summary after Cal Video meetings with recording enabled"`
  - `"ai_meeting_summary_pending": "Summary is being generated..."`
  - `"ai_meeting_summary_failed": "Summary generation failed"`

**Verification:**
```bash
yarn type-check:ci --force
yarn biome check --write .
```
- [ ] Type check passes
- [ ] Toggle only visible when feature flag is enabled
- [ ] Summary section handles all states (loading, success, error, no data)

---

## Implementation Notes

| Concern | Detail |
|---------|--------|
| **Transcript TTL** | Daily.co access links expire in 12 hours. Task must run promptly — no `scheduledAt` delay. |
| **Transcript format** | VTT format. Strip timestamps/headers before sending to AI. |
| **Token limits** | `gpt-4o-mini` has 128k context. Add truncation for transcripts >100k tokens. |
| **Cost** | ~$0.003 per summary. Log usage for monitoring. |
| **Feature flag** | `ai-meeting-summary` global kill switch + per-event-type `enableAIMeetingSummary` toggle. |
| **Architecture** | No `@calcom/trpc` imports in `packages/features/`. Services use `ErrorWithCode`. |
| **Security** | `OPENAI_API_KEY` never logged/exposed. tRPC endpoint verifies user authorization. |

## Critical Files Reference

| File | Why It Matters |
|------|---------------|
| `apps/web/app/api/recorded-daily-video/route.ts` | Webhook handler — primary integration point (line ~207) |
| `apps/web/lib/daily-webhook/getBooking.ts` | Booking select query — needs `enableAIMeetingSummary` |
| `packages/prisma/schema.prisma` | Add MeetingSummary model + CalVideoSettings field |
| `packages/features/tasker/tasker.ts` | Add task type to TaskPayloads |
| `packages/features/tasker/tasks/index.ts` | Register task handler + config |
| `packages/emails/templates/organizer-daily-video-download-transcript-email.ts` | Pattern to follow for summary email |
| `apps/web/modules/bookings/views/bookings-single-view.tsx` | Booking detail UI |
| `packages/features/ee/workflows/lib/constants.ts` | Workflow constants reference |
