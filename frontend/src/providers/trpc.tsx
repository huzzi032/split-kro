import { QueryClient, QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "../lib/api";
import type { ReactNode } from "react";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } }
});

const createQuery = (key: string, queryFn: any) => ({
  useQuery: (input: any, options: any) => useQuery({
    queryKey: [key, input],
    queryFn: () => queryFn(input),
    ...options
  })
});

const createMutation = (mutationFn: any) => ({
  useMutation: (options: any) => useMutation({
    mutationFn,
    ...options
  })
});

// Mock query returns empty array
const mockQueryArr = (key: string) => createQuery(key, () => []);
// Mock query returns empty object
const mockQueryObj = (key: string) => createQuery(key, () => ({}));
// Mock numerical
const mockQueryNum = (key: string) => createQuery(key, () => 0);

export const trpc = {
  useUtils: () => {
    const createUtilsProxy = (path: string[] = []): any => {
      return new Proxy(() => { }, {
        get: (target, prop: string) => {
          if (prop === 'invalidate') {
            return async () => {
              await queryClient.invalidateQueries({ queryKey: [path.join('.')] });
            };
          }
          return createUtilsProxy([...path, prop]);
        }
      });
    };
    return createUtilsProxy();
  },
  auth: {
    me: createQuery("auth.me", async () => {
      const res = await fetch("/api/auth/me", { headers: apiClient._getHeaders() });
      if (!res.ok) throw new Error("Not logged in");
      return res.json();
    }),
    logout: createMutation(async () => {
      localStorage.removeItem("token");
      return { success: true };
    })
  },
  group: {
    list: createQuery("group.list", async () => {
      return await apiClient.group.getGroups();
    }),
    create: createMutation(async (input: any) => {
      return await apiClient.group.createGroup(input.name, input.description, input.currency);
    }),
    getById: createQuery("group.getById", async (input: any) => {
      return await apiClient.group.getGroupDetail(input.id);
    }),
    addMember: createMutation(async (input: any) => {
      return await apiClient.group.addMember(input.groupId, input.email);
    }),
    createInvitation: createMutation(async (input: any) => {
      return await apiClient.group.createInvitation(input.groupId, input.email);
    }),
    listPendingInvitations: createQuery("group.listPendingInvitations", async () => {
      return await apiClient.group.listPendingInvitations();
    }),
    acceptInvitation: createMutation(async (input: any) => {
      return await apiClient.group.acceptInvitation(input.token);
    }),
    declineInvitation: createMutation(async (input: any) => {
      return await apiClient.group.declineInvitation(input.token);
    }),
    removeMember: createMutation(async (input: any) => {
      const payload = {
        userId: input.userId,
        notifyRemoved: input.notifyRemoved,
        notifyRemaining: input.notifyRemaining,
        notifyByEmail: input.notifyByEmail,
        notificationTitle: input.notificationTitle,
        notificationBody: input.notificationBody,
      };
      return await apiClient.group.removeMember(input.groupId, payload);
    }),
    delete: createMutation(async (input: any) => {
      const payload = {
        notifyMembers: input.notifyMembers,
        notifyByEmail: input.notifyByEmail,
        notificationTitle: input.notificationTitle,
        notificationBody: input.notificationBody,
      };
      return await apiClient.group.deleteGroup(input.groupId, payload);
    }),
    setMemberLimit: createMutation(async (input: any) => {
      const payload = {
        userId: input.userId,
        amount: input.amount,
      };
      return await apiClient.group.setMemberLimit(input.groupId, payload);
    }),
    listMemberLimits: createQuery("group.listMemberLimits", async (input: any) => {
      return await apiClient.group.listMemberLimits(input.groupId);
    }),
  },
  expense: {
    list: createQuery("expense.list", async (input: any) => {
      return await apiClient.expense.getExpenses(input.groupId, input.category);
    }),
    create: createMutation(async (input: any) => {
      return await apiClient.expense.createExpense(input);
    }),
    delete: createMutation(async (input: any) => {
      return await apiClient.expense.deleteExpense(input.id);
    }),
    membersForSplits: createQuery("expense.membersForSplits", async (input: any) => {
      const g = await apiClient.group.getGroupDetail(input.groupId);
      return g.members.map((m: any) => ({ id: m.userId, name: m.user.name, email: m.user.email }));
    })
  },
  chat: {
    send: createMutation(async (input: any) => {
      return await apiClient.chat.sendMessage(input.messageContent, input.groupId);
    })
  },
  analytics: {
    personalStats: createQuery("analytics.personalStats", async (input: any) => {
      return await apiClient.analytics.getPersonalStats(input.groupId);
    }),
    groupStats: createQuery("analytics.groupStats", async (input: any) => {
      return await apiClient.analytics.getGroupStats(input.groupId);
    })
  },
  settlement: {
    balances: createQuery("settlement.balances", async (input: any) => {
      return await apiClient.settlement.getBalances(input.groupId);
    }),
    settlementPlan: createQuery("settlement.settlementPlan", async (input: any) => {
      return await apiClient.settlement.getSettlementPlan(input.groupId);
    }),
    list: createQuery("settlement.list", async (input: any) => {
      return await apiClient.settlement.getHistory(input.groupId);
    }),
    settle: createMutation(async (input: any) => {
      return await apiClient.settlement.recordSettlement(input);
    })
  },
  event: {
    list: createQuery("event.list", async (input: any) => {
      return await apiClient.event.list(input?.groupId);
    }),
    create: createMutation(async (input: any) => {
      return await apiClient.event.create(input);
    }),
    getById: createQuery("event.getById", async (input: any) => {
      return await apiClient.event.getDetail(input.id);
    }),
    addExpense: createMutation(async (input: any) => {
      return await apiClient.event.addExpense(input.eventId, input.payload);
    }),
    balances: createQuery("event.balances", async (input: any) => {
      return await apiClient.event.balances(input.eventId);
    }),
    summary: createQuery("event.summary", async (input: any) => {
      return await apiClient.event.summary(input.eventId);
    }),
  },
  notification: {
    list: createQuery("notification.list", async (input: any) => {
      return await apiClient.notification.list(!!input?.unreadOnly);
    }),
    unreadCount: createQuery("notification.unreadCount", async () => {
      const res = await apiClient.notification.unreadCount();
      return res.count ?? 0;
    }),
    markRead: createMutation(async (input: any) => {
      return await apiClient.notification.markRead(input.id);
    }),
    markAllRead: createMutation(async () => {
      return await apiClient.notification.markAllRead();
    })
  }
} as any;

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

