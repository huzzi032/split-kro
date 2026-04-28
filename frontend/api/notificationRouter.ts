import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  findNotificationsByUser,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
} from "./queries/chat";

export const notificationRouter = createRouter({
  list: authedQuery
    .input(z.object({ unreadOnly: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => findNotificationsByUser(ctx.user.id, input?.unreadOnly ?? false)),

  unreadCount: authedQuery.query(({ ctx }) => getUnreadNotificationCount(ctx.user.id)),

  markRead: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => markNotificationRead(input.id)),

  markAllRead: authedQuery.mutation(({ ctx }) => markAllNotificationsRead(ctx.user.id)),
});
