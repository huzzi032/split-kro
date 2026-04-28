import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  findExpensesByGroup,
  findExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  updateExpenseSplits,
  markSplitSettled,
  getGroupMembersForSplits,
} from "./queries/expenses";
import { isGroupMember } from "./queries/groups";
import { TRPCError } from "@trpc/server";

export const expenseRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        groupId: z.number(),
        fromDate: z.string().datetime().optional(),
        toDate: z.string().datetime().optional(),
        category: z.string().optional(),
        paidBy: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const member = await isGroupMember(input.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      return findExpensesByGroup(input.groupId, {
        fromDate: input.fromDate ? new Date(input.fromDate) : undefined,
        toDate: input.toDate ? new Date(input.toDate) : undefined,
        category: input.category,
        paidBy: input.paidBy,
      });
    }),

  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const expense = await findExpenseById(input.id);
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found" });
      const member = await isGroupMember(expense.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      return expense;
    }),

  create: authedQuery
    .input(
      z.object({
        groupId: z.number(),
        amount: z.string(),
        currency: z.string().max(10),
        category: z.string().optional(),
        description: z.string().optional(),
        receiptUrl: z.string().optional(),
        expenseDate: z.string().datetime().optional(),
        paidBy: z.number(),
        splits: z.array(
          z.object({
            userId: z.number(),
            amount: z.string(),
            percentage: z.string().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const member = await isGroupMember(input.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      return createExpense({
        ...input,
        expenseDate: input.expenseDate ? new Date(input.expenseDate) : undefined,
      });
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        amount: z.string().optional(),
        currency: z.string().max(10).optional(),
        category: z.string().optional(),
        description: z.string().optional(),
        receiptUrl: z.string().optional(),
        expenseDate: z.string().datetime().optional(),
        paidBy: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const expense = await findExpenseById(input.id);
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found" });
      const member = await isGroupMember(expense.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      const { id, ...data } = input;
      return updateExpense(id, {
        ...data,
        expenseDate: data.expenseDate ? new Date(data.expenseDate) : undefined,
      });
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const expense = await findExpenseById(input.id);
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found" });
      const member = await isGroupMember(expense.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      await deleteExpense(input.id);
      return { success: true };
    }),

  updateSplits: authedQuery
    .input(
      z.object({
        expenseId: z.number(),
        splits: z.array(
          z.object({
            userId: z.number(),
            amount: z.string(),
            percentage: z.string().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const expense = await findExpenseById(input.expenseId);
      if (!expense) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found" });
      const member = await isGroupMember(expense.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      await updateExpenseSplits(input.expenseId, input.splits);
      return { success: true };
    }),

  settleSplit: authedQuery
    .input(z.object({ splitId: z.number() }))
    .mutation(async ({ input }) => {
      // TODO: verify user owns this split
      await markSplitSettled(input.splitId, true);
      return { success: true };
    }),

  membersForSplits: authedQuery
    .input(z.object({ groupId: z.number() }))
    .query(async ({ ctx, input }) => {
      const member = await isGroupMember(input.groupId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      return getGroupMembersForSplits(input.groupId);
    }),
});
