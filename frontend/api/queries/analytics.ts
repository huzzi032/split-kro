import { getDb } from "./connection";
import { expenses, expenseSplits } from "../../db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

export async function getGroupStats(groupId: number, fromDate?: Date, toDate?: Date) {
  const db = getDb();
  const conditions = [eq(expenses.groupId, groupId)];
  if (fromDate) conditions.push(gte(expenses.expenseDate, fromDate));
  if (toDate) conditions.push(lte(expenses.expenseDate, toDate));

  const expenseList = await db
    .select()
    .from(expenses)
    .where(and(...conditions));

  const totalAmount = expenseList.reduce(
    (sum, e) => sum + parseFloat(e.amount.toString()),
    0,
  );

  const categoryBreakdown = await db
    .select({
      category: expenses.category,
      total: sql<string>`SUM(${expenses.amount})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(expenses)
    .where(and(...conditions))
    .groupBy(expenses.category);

  const memberSpending = await db
    .select({
      paidBy: expenses.paidBy,
      total: sql<string>`SUM(${expenses.amount})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(expenses)
    .where(and(...conditions))
    .groupBy(expenses.paidBy);

  const monthlyTrends = await db
    .select({
      month: sql<string>`DATE_FORMAT(${expenses.expenseDate}, '%Y-%m')`,
      total: sql<string>`SUM(${expenses.amount})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(expenses)
    .where(and(...conditions))
    .groupBy(sql`DATE_FORMAT(${expenses.expenseDate}, '%Y-%m')`)
    .orderBy(desc(sql`DATE_FORMAT(${expenses.expenseDate}, '%Y-%m')`));

  return {
    totalExpenses: expenseList.length,
    totalAmount: Math.round(totalAmount * 100) / 100,
    averageExpense: expenseList.length > 0 ? Math.round((totalAmount / expenseList.length) * 100) / 100 : 0,
    categoryBreakdown: categoryBreakdown.map((c) => ({
      category: c.category,
      total: parseFloat(c.total ?? "0"),
      count: c.count,
    })),
    memberSpending: memberSpending.map((m) => ({
      userId: m.paidBy,
      total: parseFloat(m.total ?? "0"),
      count: m.count,
    })),
    monthlyTrends: monthlyTrends.map((t) => ({
      month: t.month,
      total: parseFloat(t.total ?? "0"),
      count: t.count,
    })),
  };
}

export async function getPersonalStats(userId: number, groupId?: number) {
  const db = getDb();

  const expenseConditions = groupId ? [eq(expenses.paidBy, userId), eq(expenses.groupId, groupId)] : [eq(expenses.paidBy, userId)];
  const splitConditions = groupId ? [eq(expenseSplits.userId, userId), eq(expenses.groupId, groupId)] : [eq(expenseSplits.userId, userId)];

  const paidResult = await db
    .select({ total: sql<string>`SUM(${expenses.amount})` })
    .from(expenses)
    .where(and(...expenseConditions));

  const owedResult = await db
    .select({
      total: sql<string>`SUM(${expenseSplits.amountOwed})`,
      settled: sql<string>`SUM(CASE WHEN ${expenseSplits.settled} = 1 THEN ${expenseSplits.amountOwed} ELSE 0 END)`,
    })
    .from(expenseSplits)
    .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
    .where(and(...splitConditions, eq(expenseSplits.settled, false)));

  const totalPaid = parseFloat(paidResult[0]?.total ?? "0");
  const totalOwed = parseFloat(owedResult[0]?.total ?? "0");
  const totalSettled = parseFloat(owedResult[0]?.settled ?? "0");

  return {
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalOwed: Math.round(totalOwed * 100) / 100,
    totalSettled: Math.round(totalSettled * 100) / 100,
    outstanding: Math.round((totalOwed - totalSettled) * 100) / 100,
  };
}
