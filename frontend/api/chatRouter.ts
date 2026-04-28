import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { parseNaturalLanguage, parseWithGroq } from "./lib/aiParser";
import { findChatMessagesByUser, createChatMessage, createNotification } from "./queries/chat";
import { findGroupById, isGroupMember } from "./queries/groups";
import { createExpense } from "./queries/expenses";
import { calculateBalances, minimizeTransactions, createSettlement } from "./queries/settlements";
import { TRPCError } from "@trpc/server";
import { env } from "./lib/env";

export const chatRouter = createRouter({
  history: authedQuery
    .input(
      z.object({
        groupId: z.number().optional(),
        limit: z.number().min(1).max(100).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      findChatMessagesByUser(ctx.user.id, input.groupId, input.limit ?? 50),
    ),

  send: authedQuery
    .input(
      z.object({
        message: z.string().min(1),
        groupId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const userName = ctx.user.name ?? "You";
      let groupId = input.groupId;

      // If groupId provided, verify membership
      if (groupId) {
        const member = await isGroupMember(groupId, userId);
        if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      }

      // Get group members for parsing context
      let members: { id: number; name: string }[] = [];
      if (groupId) {
        const group = await findGroupById(groupId);
        members =
          group?.members
            ?.filter((m) => m.isActive && m.user)
            .map((m) => ({ id: m.userId, name: m.user!.name ?? `User ${m.userId}` })) ?? [];
      }

      // Try Groq first if API key available
      let result = env.groqApiKey
        ? await parseWithGroq(input.message, members, userName, env.groqApiKey)
        : null;

      // Fallback to built-in parser
      if (!result) {
        result = parseNaturalLanguage(input.message, members, userName);
      }

      // Handle expense creation
      if (result.type === "expense" && result.expense && groupId) {
        // Resolve participants to user IDs
        const participantNames = result.expense.participants;
        const participantMap = new Map(members.map((m) => [m.name.toLowerCase(), m.id]));
        const splits: { userId: number; amount: string; percentage?: string }[] = [];

        for (const name of participantNames) {
          const uid = participantMap.get(name.toLowerCase());
          if (uid) {
            splits.push({
              userId: uid,
              amount: result.expense.splits[name]?.toString() ?? "0",
            });
          }
        }

        if (splits.length > 0) {
          const paidByName = result.expense.paidBy;
          const paidById = participantMap.get(paidByName.toLowerCase()) ?? userId;

          const expense = await createExpense({
            groupId,
            paidBy: paidById,
            amount: result.expense.amount!.toString(),
            currency: result.expense.currency,
            category: result.expense.category,
            description: result.expense.description,
            expenseDate: new Date(result.expense.date),
            splits,
          });

          // Create notifications for participants
          for (const split of splits) {
            if (split.userId !== paidById) {
              await createNotification({
                userId: split.userId,
                groupId,
                type: "expense_added",
                title: `New expense: ${result.expense.description}`,
                body: `${userName} added ${result.expense.amount} ${result.expense.currency} for ${result.expense.description}`,
                relatedId: expense?.id,
              });
            }
          }

          result.message = `✅ Expense created: ${result.expense.description} for ${result.expense.amount} ${result.expense.currency}`;
          result.action = "expense_created";
        }
      }

      // Handle query responses with live data
      if (result.type === "query" && groupId) {
        if (result.query?.type === "balance") {
          const balances = await calculateBalances(groupId);
          const personal = balances.find((b) => b.userId === userId);
          if (personal) {
            const status = personal.net >= 0 ? "owed" : "owe";
            result.message = `Your balance: ${personal.net >= 0 ? "+" : ""}${personal.net.toFixed(2)} ${status === "owed" ? "(you are owed)" : "(you owe)"}`;
          }
        }
        if (result.query?.type === "who_owes") {
          const balances = await calculateBalances(groupId);
          const owedBy = balances.filter((b) => b.net < -0.01 && b.userId !== userId);
          if (owedBy.length > 0) {
            result.message = `People who owe money:\n${owedBy.map((b) => `- ${b.name}: owes ${Math.abs(b.net).toFixed(2)}`).join("\n")}`;
          } else {
            result.message = "No one owes money in this group right now!";
          }
        }
        if (result.query?.type === "settle") {
          const balances = await calculateBalances(groupId);
          const transactions = minimizeTransactions(balances);
          const myTx = transactions.filter((t) => t.from === userId || t.to === userId);
          if (myTx.length > 0) {
            result.message = `Your settlements:\n${myTx.map((t) => t.from === userId ? `- Pay ${t.toName}: ${t.amount.toFixed(2)}` : `- Receive from ${t.fromName}: ${t.amount.toFixed(2)}`).join("\n")}`;
          } else {
            result.message = "You're all settled up!";
          }
        }
      }

      // Handle settlement command
      if (result.type === "settlement" && groupId) {
        // Parse "settle up with X for Y amount"
        const targetMatch = input.message.match(/with\s+(\w+)/i);
        const amountMatch = input.message.match(/(\d+(?:\.\d{1,2})?)/);
        if (targetMatch && amountMatch) {
          const targetName = targetMatch[1].toLowerCase();
          const targetMember = members.find((m) => m.name.toLowerCase().includes(targetName));
          if (targetMember) {
            const amount = amountMatch[1];
            await createSettlement({
              groupId,
              paidBy: userId,
              paidTo: targetMember.id,
              amount,
              currency: "PKR",
            });
            result.message = `✅ Settlement recorded: You paid ${targetMember.name} ${amount}`;
            result.action = "settlement";
          }
        }
      }

      // Log the chat message
      await createChatMessage({
        userId,
        groupId,
        messageContent: input.message,
        aiResponse: result.message,
        action: result.action as any,
        expenseCreated: result.action === "expense_created",
      });

      return result;
    }),
});
