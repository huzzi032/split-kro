import { getDb } from "./connection";
import { settlements, expenses, groupMembers } from "../../db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function findSettlementsByGroup(groupId: number) {
  return getDb().query.settlements.findMany({
    where: eq(settlements.groupId, groupId),
    with: { payer: true, payee: true },
    orderBy: [desc(settlements.createdAt)],
  });
}

export async function createSettlement(data: {
  groupId: number;
  paidBy: number;
  paidTo: number;
  amount: string;
  currency: string;
  paymentMethod?: string;
  notes?: string;
}) {
  const db = getDb();
  const [{ id }] = await db
    .insert(settlements)
    .values({
      groupId: data.groupId,
      paidBy: data.paidBy,
      paidTo: data.paidTo,
      amount: data.amount,
      currency: data.currency,
      paymentMethod: data.paymentMethod,
      notes: data.notes,
      isConfirmed: true,
    })
    .$returningId();

  return db.query.settlements.findFirst({
    where: eq(settlements.id, id),
    with: { payer: true, payee: true },
  });
}

// Calculate net balances for each member in a group
export async function calculateBalances(groupId: number) {
  const db = getDb();

  // Get all expenses in group
  const groupExpenses = await db.query.expenses.findMany({
    where: eq(expenses.groupId, groupId),
    with: { splits: true },
  });

  // Get all settlements in group
  const groupSettlements = await db.query.settlements.findMany({
    where: eq(settlements.groupId, groupId),
  });

  // Get all active members
  const members = await db.query.groupMembers.findMany({
    where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.isActive, true)),
    with: { user: true },
  });

  const balances: Record<number, { userId: number; name: string; avatar?: string | null; net: number; paid: number; owed: number }> = {};

  for (const m of members) {
    balances[m.userId] = {
      userId: m.userId,
      name: m.user?.name ?? "Unknown",
      avatar: m.user?.avatar,
      net: 0,
      paid: 0,
      owed: 0,
    };
  }

  // Calculate from expenses
  const memberIds = members.map((m) => m.userId);

  for (const exp of groupExpenses) {
    const paidBy = exp.paidBy;
    const amount = parseFloat(exp.amount.toString());

    if (!balances[paidBy]) {
      balances[paidBy] = {
        userId: paidBy,
        name: "Unknown",
        avatar: null,
        net: 0,
        paid: 0,
        owed: 0,
      };
    }

    balances[paidBy].paid += amount;
    balances[paidBy].net += amount;

    const splitTotal = exp.splits.reduce(
      (sum, split) => sum + parseFloat(split.amountOwed.toString() || "0"),
      0,
    );

    if (exp.splits.length > 0 && splitTotal > 0) {
      for (const split of exp.splits) {
        const owed = parseFloat(split.amountOwed.toString());
        if (!split.settled && balances[split.userId]) {
          balances[split.userId].owed += owed;
          balances[split.userId].net -= owed;
        }
      }
    } else if (memberIds.length > 0) {
      const perPerson = amount / memberIds.length;
      for (const uid of memberIds) {
        balances[uid].owed += perPerson;
        balances[uid].net -= perPerson;
      }
    }
  }

  // Adjust for settlements
  for (const s of groupSettlements) {
    const amount = parseFloat(s.amount.toString());
    balances[s.paidBy].net -= amount;
    balances[s.paidTo].net += amount;
  }

  return Object.values(balances);
}

// Minimize transactions using greedy algorithm
export function minimizeTransactions(
  balances: { userId: number; name: string; net: number }[],
) {
  const creditors = balances
    .filter((b) => b.net > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.net - a.net);

  const debtors = balances
    .filter((b) => b.net < -0.01)
    .map((b) => ({ ...b, net: Math.abs(b.net) }))
    .sort((a, b) => b.net - a.net);

  const transactions: {
    from: number;
    fromName: string;
    to: number;
    toName: string;
    amount: number;
  }[] = [];

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.net, creditor.net);

    if (amount > 0.01) {
      transactions.push({
        from: debtor.userId,
        fromName: debtor.name,
        to: creditor.userId,
        toName: creditor.name,
        amount: Math.round(amount * 100) / 100,
      });
    }

    debtor.net -= amount;
    creditor.net -= amount;

    if (debtor.net < 0.01) i++;
    if (creditor.net < 0.01) j++;
  }

  return transactions;
}

export async function getPersonalBalanceInGroup(groupId: number, userId: number) {
  const allBalances = await calculateBalances(groupId);
  return allBalances.find((b) => b.userId === userId);
}
