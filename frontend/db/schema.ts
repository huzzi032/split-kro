import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  decimal,
  mysqlEnum,
  bigint,
  boolean,
  index,
} from "drizzle-orm/mysql-core";

// ─── Users (managed by OAuth auth system) ───
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  preferredCurrency: varchar("preferred_currency", { length: 10 }).default("PKR"),
  language: mysqlEnum("language", ["en", "ur"]).default("en"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Groups ───
export const groups = mysqlTable(
  "groups",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    picture: text("picture"),
    currency: varchar("currency", { length: 10 }).default("PKR").notNull(),
    createdBy: bigint("created_by", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    createdByIdx: index("groups_created_by_idx").on(table.createdBy),
  }),
);

export type Group = typeof groups.$inferSelect;
export type InsertGroup = typeof groups.$inferInsert;

// ─── Group Members (junction) ───
export const groupMembers = mysqlTable(
  "group_members",
  {
    id: serial("id").primaryKey(),
    groupId: bigint("group_id", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => ({
    groupIdx: index("gm_group_idx").on(table.groupId),
    userIdx: index("gm_user_idx").on(table.userId),
    uniqueMember: index("gm_unique_idx").on(table.groupId, table.userId),
  }),
);

export type GroupMember = typeof groupMembers.$inferSelect;
export type InsertGroupMember = typeof groupMembers.$inferInsert;

// ─── Expenses ───
export const expenses = mysqlTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    groupId: bigint("group_id", { mode: "number", unsigned: true }).notNull(),
    paidBy: bigint("paid_by", { mode: "number", unsigned: true }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).default("PKR").notNull(),
    category: mysqlEnum("category", [
      "Food",
      "Rent",
      "Utilities",
      "Entertainment",
      "Transport",
      "Shopping",
      "Health",
      "Travel",
      "Education",
      "Other",
    ]).default("Other"),
    description: varchar("description", { length: 500 }),
    receiptUrl: text("receipt_url"),
    expenseDate: timestamp("expense_date").defaultNow().notNull(),
    isRecurring: boolean("is_recurring").default(false),
    recurringInterval: mysqlEnum("recurring_interval", ["weekly", "monthly", "yearly"]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    groupIdx: index("exp_group_idx").on(table.groupId),
    paidByIdx: index("exp_paid_by_idx").on(table.paidBy),
    dateIdx: index("exp_date_idx").on(table.expenseDate),
    categoryIdx: index("exp_category_idx").on(table.category),
  }),
);

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

// ─── Expense Splits ───
export const expenseSplits = mysqlTable(
  "expense_splits",
  {
    id: serial("id").primaryKey(),
    expenseId: bigint("expense_id", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    amountOwed: decimal("amount_owed", { precision: 12, scale: 2 }).notNull(),
    percentage: decimal("percentage", { precision: 5, scale: 2 }),
    settled: boolean("settled").default(false).notNull(),
    settledAt: timestamp("settled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    expenseIdx: index("split_expense_idx").on(table.expenseId),
    userIdx: index("split_user_idx").on(table.userId),
  }),
);

export type ExpenseSplit = typeof expenseSplits.$inferSelect;
export type InsertExpenseSplit = typeof expenseSplits.$inferInsert;

// ─── Settlements (direct payments between users) ───
export const settlements = mysqlTable(
  "settlements",
  {
    id: serial("id").primaryKey(),
    groupId: bigint("group_id", { mode: "number", unsigned: true }).notNull(),
    paidBy: bigint("paid_by", { mode: "number", unsigned: true }).notNull(),
    paidTo: bigint("paid_to", { mode: "number", unsigned: true }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).default("PKR").notNull(),
    paymentMethod: varchar("payment_method", { length: 100 }),
    notes: varchar("notes", { length: 500 }),
    isConfirmed: boolean("is_confirmed").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    groupIdx: index("set_group_idx").on(table.groupId),
    paidByIdx: index("set_paid_by_idx").on(table.paidBy),
    paidToIdx: index("set_paid_to_idx").on(table.paidTo),
  }),
);

export type Settlement = typeof settlements.$inferSelect;
export type InsertSettlement = typeof settlements.$inferInsert;

// ─── Chat Messages (AI conversation log) ───
export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    groupId: bigint("group_id", { mode: "number", unsigned: true }),
    messageContent: text("message_content").notNull(),
    aiResponse: text("ai_response"),
    action: mysqlEnum("action", [
      "expense_created",
      "settlement",
      "info",
      "query",
      "unknown",
    ]).default("unknown"),
    expenseCreated: boolean("expense_created").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("chat_user_idx").on(table.userId),
    groupIdx: index("chat_group_idx").on(table.groupId),
    createdIdx: index("chat_created_idx").on(table.createdAt),
  }),
);

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// ─── Notifications ───
export const notifications = mysqlTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    groupId: bigint("group_id", { mode: "number", unsigned: true }),
    type: mysqlEnum("type", [
      "expense_added",
      "expense_updated",
      "settlement",
      "member_added",
      "reminder",
      "system",
    ]).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    relatedId: bigint("related_id", { mode: "number", unsigned: true }),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("notif_user_idx").on(table.userId),
    readIdx: index("notif_read_idx").on(table.isRead),
    createdIdx: index("notif_created_idx").on(table.createdAt),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
