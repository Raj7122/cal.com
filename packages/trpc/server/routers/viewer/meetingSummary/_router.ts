import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";
import { ZGetMeetingSummaryInputSchema } from "./getMeetingSummary.schema";

type MeetingSummaryRouterHandlerCache = {
  getMeetingSummary?: typeof import("./getMeetingSummary.handler").getMeetingSummaryHandler;
};

export const meetingSummaryRouter = router({
  get: authedProcedure
    .input(ZGetMeetingSummaryInputSchema)
    .query(async ({ ctx, input }) => {
      const { getMeetingSummaryHandler } = await import("./getMeetingSummary.handler");

      return getMeetingSummaryHandler({ ctx, input });
    }),
});
