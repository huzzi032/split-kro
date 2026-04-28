import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getGroupStats, getPersonalStats } from "./queries/analytics";
import { isGroupMember } from "./queries/groups";
import { TRPCError } from "@trpc/server";

export const analyticsRouter = createRouter({
  groupStats: authedQuery
    .input(
      z.object({
        groupId: z.number(),
        fromDate: z.string().datetime().optional(),
        toDate: z.string().datetime().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const member = await isGroupMember(input.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      return getGroupStats(
        input.groupId,
        input.fromDate ? new Date(input.fromDate) : undefined,
        input.toDate ? new Date(input.toDate) : undefined,
      );
    }),

  personalStats: authedQuery
    .input(
      z.object({
        groupId: z.number().optional(),
      }),
    )
    .query(({ ctx, input }) => getPersonalStats(ctx.user.id, input.groupId)),

  exportExpenses: authedQuery
    .input(z.object({ groupId: z.number() }))
    .query(async ({ ctx, input }) => {
      const member = await isGroupMember(input.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      // TODO: generate CSV data
      return { message: "Export feature coming soon" };
    }),
});
