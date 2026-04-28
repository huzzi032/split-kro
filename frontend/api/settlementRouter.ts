import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  findSettlementsByGroup,
  createSettlement,
  calculateBalances,
  minimizeTransactions,
  getPersonalBalanceInGroup,
} from "./queries/settlements";
import { isGroupMember } from "./queries/groups";
import { TRPCError } from "@trpc/server";

export const settlementRouter = createRouter({
  list: authedQuery
    .input(z.object({ groupId: z.number() }))
    .query(async ({ ctx, input }) => {
      const member = await isGroupMember(input.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      return findSettlementsByGroup(input.groupId);
    }),

  balances: authedQuery
    .input(z.object({ groupId: z.number() }))
    .query(async ({ ctx, input }) => {
      const member = await isGroupMember(input.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      return calculateBalances(input.groupId);
    }),

  settlementPlan: authedQuery
    .input(z.object({ groupId: z.number() }))
    .query(async ({ ctx, input }) => {
      const member = await isGroupMember(input.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      const balances = await calculateBalances(input.groupId);
      const transactions = minimizeTransactions(balances);
      return { balances, transactions };
    }),

  personalBalance: authedQuery
    .input(z.object({ groupId: z.number() }))
    .query(async ({ ctx, input }) => {
      const member = await isGroupMember(input.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      return getPersonalBalanceInGroup(input.groupId, ctx.user.id);
    }),

  settle: authedQuery
    .input(
      z.object({
        groupId: z.number(),
        paidTo: z.number(),
        amount: z.string(),
        currency: z.string().max(10).optional(),
        paymentMethod: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const member = await isGroupMember(input.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      return createSettlement({
        groupId: input.groupId,
        paidBy: ctx.user.id,
        paidTo: input.paidTo,
        amount: input.amount,
        currency: input.currency ?? "PKR",
        paymentMethod: input.paymentMethod,
        notes: input.notes,
      });
    }),
});
