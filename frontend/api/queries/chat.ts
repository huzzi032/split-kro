import { getDb } from "./connection";
import { chatMessages, notifications } from "../../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export async function findChatMessagesByUser(userId: number, groupId?: number, limit = 50) {
  const db = getDb();
  const conditions = [eq(chatMessages.userId, userId)];
  if (groupId) conditions.push(eq(chatMessages.groupId, groupId));

  return db.query.chatMessages.findMany({
    where: and(...conditions),
    orderBy: [desc(chatMessages.createdAt)],
    limit,
  });
}

export async function createChatMessage(data: {
  userId: number;
  groupId?: number;
  messageContent: string;
  aiResponse?: string;
  action?: "expense_created" | "settlement" | "info" | "query" | "unknown";
  expenseCreated?: boolean;
}) {
  const db = getDb();
  const [{ id }] = await db
    .insert(chatMessages)
    .values({
      userId: data.userId,
      groupId: data.groupId ?? null,
      messageContent: data.messageContent,
      aiResponse: data.aiResponse,
      action: data.action ?? "unknown",
      expenseCreated: data.expenseCreated ?? false,
    })
    .$returningId();

  return db.query.chatMessages.findFirst({
    where: eq(chatMessages.id, id),
  });
}

// Notifications
export async function findNotificationsByUser(userId: number, unreadOnly = false) {
  const db = getDb();
  const conditions = [eq(notifications.userId, userId)];
  if (unreadOnly) conditions.push(eq(notifications.isRead, false));

  return db.query.notifications.findMany({
    where: and(...conditions),
    orderBy: [desc(notifications.createdAt)],
    limit: 50,
  });
}

export async function createNotification(data: {
  userId: number;
  groupId?: number;
  type: "expense_added" | "expense_updated" | "settlement" | "member_added" | "reminder" | "system";
  title: string;
  body?: string;
  relatedId?: number;
}) {
  await getDb().insert(notifications).values({
    userId: data.userId,
    groupId: data.groupId ?? null,
    type: data.type,
    title: data.title,
    body: data.body,
    relatedId: data.relatedId ?? null,
    isRead: false,
  });
}

export async function markNotificationRead(notificationId: number) {
  await getDb()
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, notificationId));
}

export async function markAllNotificationsRead(userId: number) {
  await getDb()
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId));
}

export async function getUnreadNotificationCount(userId: number) {
  const result = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return result[0]?.count ?? 0;
}
