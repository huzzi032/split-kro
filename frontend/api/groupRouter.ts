import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  findGroupsByUser,
  findGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  addGroupMember,
  removeGroupMember,
  updateMemberRole,
  findUserByEmail,
  isGroupAdmin,
  isGroupMember,
} from "./queries/groups";
import { TRPCError } from "@trpc/server";

export const groupRouter = createRouter({
  list: authedQuery.query(({ ctx }) => findGroupsByUser(ctx.user.id)),

  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const group = await findGroupById(input.id);
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
      const member = await isGroupMember(input.id, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group member" });
      return group;
    }),

  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        currency: z.string().max(10).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      createGroup({
        name: input.name,
        description: input.description,
        currency: input.currency,
        createdBy: ctx.user.id,
      }),
    ),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        picture: z.string().optional(),
        currency: z.string().max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const admin = await isGroupAdmin(input.id, ctx.user.id);
      if (!admin) throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      const { id, ...data } = input;
      return updateGroup(id, data);
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const admin = await isGroupAdmin(input.id, ctx.user.id);
      if (!admin) throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      await deleteGroup(input.id);
      return { success: true };
    }),

  addMember: authedQuery
    .input(
      z.object({
        groupId: z.number(),
        email: z.string().email(),
        role: z.enum(["admin", "member"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const admin = await isGroupAdmin(input.groupId, ctx.user.id);
      if (!admin) throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      const user = await findUserByEmail(input.email);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      await addGroupMember({ groupId: input.groupId, userId: user.id, role: input.role });
      return { success: true, userId: user.id };
    }),

  removeMember: authedQuery
    .input(z.object({ groupId: z.number(), userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const admin = await isGroupAdmin(input.groupId, ctx.user.id);
      if (!admin && input.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      await removeGroupMember(input.groupId, input.userId);
      return { success: true };
    }),

  updateMemberRole: authedQuery
    .input(z.object({ groupId: z.number(), userId: z.number(), role: z.enum(["admin", "member"]) }))
    .mutation(async ({ ctx, input }) => {
      const admin = await isGroupAdmin(input.groupId, ctx.user.id);
      if (!admin) throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      await updateMemberRole(input.groupId, input.userId, input.role);
      return { success: true };
    }),
});
