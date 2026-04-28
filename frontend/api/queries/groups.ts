import { getDb } from "./connection";
import { groups, groupMembers, users } from "../../db/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function findGroupsByUser(userId: number) {
  const db = getDb();
  const memberships = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(
      and(eq(groupMembers.userId, userId), eq(groupMembers.isActive, true)),
    );

  if (memberships.length === 0) return [];

  const groupIds = memberships.map((m) => m.groupId);
  return db.query.groups.findMany({
    where: inArray(groups.id, groupIds),
    with: { members: { with: { user: true } } },
  });
}

export async function findGroupById(groupId: number) {
  return getDb().query.groups.findFirst({
    where: eq(groups.id, groupId),
    with: {
      members: { with: { user: true } },
      creator: true,
    },
  });
}

export async function createGroup(data: {
  name: string;
  description?: string;
  currency?: string;
  createdBy: number;
}) {
  const db = getDb();
  const [{ id }] = await db
    .insert(groups)
    .values({
      name: data.name,
      description: data.description,
      currency: data.currency ?? "PKR",
      createdBy: data.createdBy,
    })
    .$returningId();

  // Add creator as admin
  await db.insert(groupMembers).values({
    groupId: id,
    userId: data.createdBy,
    role: "admin",
    isActive: true,
  });

  return findGroupById(id);
}

export async function updateGroup(
  groupId: number,
  data: { name?: string; description?: string; picture?: string; currency?: string },
) {
  await getDb()
    .update(groups)
    .set(data)
    .where(eq(groups.id, groupId));
  return findGroupById(groupId);
}

export async function deleteGroup(groupId: number) {
  await getDb().delete(groups).where(eq(groups.id, groupId));
}

export async function addGroupMember(data: {
  groupId: number;
  userId: number;
  role?: "admin" | "member";
}) {
  const db = getDb();
  await db.insert(groupMembers).values({
    groupId: data.groupId,
    userId: data.userId,
    role: data.role ?? "member",
    isActive: true,
  });
}

export async function removeGroupMember(groupId: number, userId: number) {
  await getDb()
    .delete(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
      ),
    );
}

export async function updateMemberRole(
  groupId: number,
  userId: number,
  role: "admin" | "member",
) {
  await getDb()
    .update(groupMembers)
    .set({ role })
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
      ),
    );
}

export async function findUserByEmail(email: string) {
  return getDb().query.users.findFirst({
    where: eq(users.email, email),
  });
}

export async function isGroupAdmin(groupId: number, userId: number) {
  const member = await getDb().query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, userId),
      eq(groupMembers.isActive, true),
    ),
  });
  return member?.role === "admin";
}

export async function isGroupMember(groupId: number, userId: number) {
  const member = await getDb().query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, userId),
      eq(groupMembers.isActive, true),
    ),
  });
  return !!member;
}
