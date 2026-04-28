import { authRouter } from "./auth-router";
import { groupRouter } from "./groupRouter";
import { expenseRouter } from "./expenseRouter";
import { settlementRouter } from "./settlementRouter";
import { chatRouter } from "./chatRouter";
import { analyticsRouter } from "./analyticsRouter";
import { notificationRouter } from "./notificationRouter";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  group: groupRouter,
  expense: expenseRouter,
  settlement: settlementRouter,
  chat: chatRouter,
  analytics: analyticsRouter,
  notification: notificationRouter,
});

export type AppRouter = typeof appRouter;
