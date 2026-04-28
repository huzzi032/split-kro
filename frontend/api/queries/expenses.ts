import { getDb } from "./connection";
import { expenses, expenseSplits, groupMembers } from "../../db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export async function findExpensesByGroup(groupId: number, filters?: {
  fromDate?: Date;
  toDate?: Date;
  category?: string;
  paidBy?: number;
}) {
  const db = getDb();
  const conditions = [eq(expenses.groupId, groupId)];

  if (filters?.fromDate) conditions.push(gte(expenses.expenseDate, filters.fromDate));
  if (filters?.toDate) conditions.push(lte(expenses.expenseDate, filters.toDate));
  if (filters?.category) conditions.push(eq(expenses.category, filters.category as any));
  if (filters?.paidBy) conditions.push(eq(expenses.paidBy, filters.paidBy));

  return db.query.expenses.findMany({
    where: and(...conditions),
    with: {
      payer: true,
      splits: { with: { user: true } },
    },
    orderBy: [desc(expenses.expenseDate)],
  });
}

export async function findExpenseById(expenseId: number) {
  return getDb().query.expenses.findFirst({
    where: eq(expenses.id, expenseId),
    with: {
      payer: true,
      splits: { with: { user: true } },
      group: true,
    },
  });
}

export async function createExpense(data: {
  groupId: number;
  paidBy: number;
  amount: string;
  currency: string;
  category?: string;
  description?: string;
  receiptUrl?: string;
  expenseDate?: Date;
  splits: { userId: number; amount: string; percentage?: string }[];
}) {
  const db = getDb();

  const [{ id }] = await db
    .insert(expenses)
    .values({
      groupId: data.groupId,
      paidBy: data.paidBy,
      amount: data.amount,
      currency: data.currency,
      category: data.category as any ?? "Other",
      description: data.description,
      receiptUrl: data.receiptUrl,
      expenseDate: data.expenseDate ?? new Date(),
    })
    .$returningId();

  // Insert splits
  if (data.splits.length > 0) {
    await db.insert(expenseSplits).values(
      data.splits.map((s) => ({
        expenseId: id,
        userId: s.userId,
        amountOwed: s.amount,
        percentage: s.percentage ?? null,
        settled: false,
      })),
    );
  }

  return findExpenseById(id);
}

export async function updateExpense(
  expenseId: number,
  data: {
    amount?: string;
    currency?: string;
    category?: string;
    description?: string;
    receiptUrl?: string;
    expenseDate?: Date;
    paidBy?: number;
  },
) {
  await getDb()
    .update(expenses)
    .set({
      amount: data.amount,
      currency: data.currency,
      category: data.category as any,
      description: data.description,
      receiptUrl: data.receiptUrl,
      expenseDate: data.expenseDate,
      paidBy: data.paidBy,
    })
    .where(eq(expenses.id, expenseId));
  return findExpenseById(expenseId);
}

export async function deleteExpense(expenseId: number) {
  const db = getDb();
  // Delete splits first (no cascade in MySQL without explicit FK config)
  await db.delete(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));
  await db.delete(expenses).where(eq(expenses.id, expenseId));
}

export async function updateExpenseSplits(
  expenseId: number,
  splits: { userId: number; amount: string; percentage?: string }[],
) {
  const db = getDb();
  await db.delete(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));
  await db.insert(expenseSplits).values(
    splits.map((s) => ({
      expenseId,
      userId: s.userId,
      amountOwed: s.amount,
      percentage: s.percentage ?? null,
      settled: false,
    })),
  );
}

export async function markSplitSettled(splitId: number, settled: boolean) {
  await getDb()
    .update(expenseSplits)
    .set({ settled, settledAt: settled ? new Date() : null })
    .where(eq(expenseSplits.id, splitId));
}

export async function getGroupMembersForSplits(groupId: number) {
  const db = getDb();
  const members = await db.query.groupMembers.findMany({
    where: eq(groupMembers.groupId, groupId),
    with: { user: true },
  });
  return members.map((m) => m.user);
}
