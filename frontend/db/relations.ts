import { relations } from "drizzle-orm";
import {
  users,
  groups,
  groupMembers,
  expenses,
  expenseSplits,
  settlements,
  chatMessages,
  notifications,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  groupMemberships: many(groupMembers),
  expensesPaid: many(expenses),
  expenseSplits: many(expenseSplits),
  settlementsPaid: many(settlements),
  settlementsReceived: many(settlements),
  chatMessages: many(chatMessages),
  notifications: many(notifications),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  creator: one(users, { fields: [groups.createdBy], references: [users.id] }),
  members: many(groupMembers),
  expenses: many(expenses),
  settlements: many(settlements),
  chatMessages: many(chatMessages),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
  user: one(users, { fields: [groupMembers.userId], references: [users.id] }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  group: one(groups, { fields: [expenses.groupId], references: [groups.id] }),
  payer: one(users, { fields: [expenses.paidBy], references: [users.id] }),
  splits: many(expenseSplits),
}));

export const expenseSplitsRelations = relations(expenseSplits, ({ one }) => ({
  expense: one(expenses, { fields: [expenseSplits.expenseId], references: [expenses.id] }),
  user: one(users, { fields: [expenseSplits.userId], references: [users.id] }),
}));

export const settlementsRelations = relations(settlements, ({ one }) => ({
  group: one(groups, { fields: [settlements.groupId], references: [groups.id] }),
  payer: one(users, { fields: [settlements.paidBy], references: [users.id] }),
  payee: one(users, { fields: [settlements.paidTo], references: [users.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  user: one(users, { fields: [chatMessages.userId], references: [users.id] }),
  group: one(groups, { fields: [chatMessages.groupId], references: [groups.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  group: one(groups, { fields: [notifications.groupId], references: [groups.id] }),
}));
