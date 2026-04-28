export const apiClient = {
    _getHeaders: () => {
        const token = localStorage.getItem("token");
        return {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        };
    },
    auth: {
        register: async (email: string, name: string, password: string = "password123") => {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, name, password }),
            });
            if (!res.ok) {
                try {
                    const err = await res.json();
                    throw new Error(err.detail || "Registration failed");
                } catch (e: any) {
                    throw new Error(e.message || `Registration failed with status ${res.status}`);
                }
            }
            try {
                return await res.json();
            } catch (e: any) {
                throw new Error("Invalid response from server");
            }
        },
        login: async (email: string, password: string = "password123") => {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    username: email,
                    password: password
                }),
            });
            if (!res.ok) {
                try {
                    const err = await res.json();
                    throw new Error(err.detail || "Login failed");
                } catch (e: any) {
                    throw new Error(e.message || `Login failed with status ${res.status}`);
                }
            }
            try {
                return await res.json();
            } catch (e: any) {
                throw new Error("Invalid response from server");
            }
        },
    },
    group: {
        addMember: async (groupId: number, email: string) => {
            const res = await fetch(`/api/groups/${groupId}/members`, {
                method: "POST",
                headers: apiClient._getHeaders(),
                body: JSON.stringify({ email }),
            });
            if (!res.ok) throw new Error("Failed to add member");
            return res.json();
        },
        createInvitation: async (groupId: number, email: string) => {
            const res = await fetch(`/api/groups/${groupId}/invitations`, {
                method: "POST",
                headers: apiClient._getHeaders(),
                body: JSON.stringify({ email }),
            });
            if (!res.ok) throw new Error("Failed to create invitation");
            return res.json();
        },
        listPendingInvitations: async () => {
            const res = await fetch(`/api/groups/invitations/pending`, {
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to fetch invitations");
            return res.json();
        },
        acceptInvitation: async (token: string) => {
            const res = await fetch(`/api/groups/invitations/${token}/accept`, {
                method: "POST",
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to accept invitation");
            return res.json();
        },
        declineInvitation: async (token: string) => {
            const res = await fetch(`/api/groups/invitations/${token}/decline`, {
                method: "POST",
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to decline invitation");
            return res.json();
        },
        removeMember: async (groupId: number, payload: any) => {
            const res = await fetch(`/api/groups/${groupId}/members/remove`, {
                method: "POST",
                headers: apiClient._getHeaders(),
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("Failed to remove member");
            return res.json();
        },
        createGroup: async (name: string, description?: string, currency?: string) => {
            const res = await fetch(`/api/groups/`, {
                method: "POST",
                headers: apiClient._getHeaders(),
                body: JSON.stringify({ name, description, currency }),
            });
            if (!res.ok) throw new Error("Failed to create group");
            return res.json();
        },
        deleteGroup: async (groupId: number, payload: any) => {
            const res = await fetch(`/api/groups/${groupId}`, {
                method: "DELETE",
                headers: apiClient._getHeaders(),
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("Failed to delete group");
            return res.json();
        },
        getGroups: async () => {
            const res = await fetch(`/api/groups/`, { headers: apiClient._getHeaders() });
            if (!res.ok) throw new Error("Failed to fetch groups");
            return res.json();
        },
        getGroupDetail: async (groupId: number) => {
            const res = await fetch(`/api/groups/${groupId}`, { headers: apiClient._getHeaders() });
            if (!res.ok) throw new Error("Failed to fetch group details");
            return res.json();
        },
        setMemberLimit: async (groupId: number, payload: any) => {
            const res = await fetch(`/api/groups/${groupId}/members/limit`, {
                method: "PUT",
                headers: apiClient._getHeaders(),
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("Failed to set member limit");
            return res.json();
        },
        listMemberLimits: async (groupId: number) => {
            const res = await fetch(`/api/groups/${groupId}/members/limits`, {
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to fetch member limits");
            return res.json();
        },
    },
    expense: {
        createExpense: async (payload: any) => {
            const res = await fetch(`/api/expenses/`, {
                method: "POST",
                headers: apiClient._getHeaders(),
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("Failed to add expense");
            return res.json();
        },
        deleteExpense: async (id: number) => {
            const res = await fetch(`/api/expenses/${id}`, {
                method: "DELETE",
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to delete expense");
            return res.json();
        },
        getExpenses: async (groupId: number, category?: string) => {
            const params = new URLSearchParams({ groupId: String(groupId) });
            if (category) params.set("category", category);
            const res = await fetch(`/api/expenses/?${params.toString()}`, { headers: apiClient._getHeaders() });
            if (!res.ok) throw new Error("Failed to fetch expenses");
            return res.json();
        }
    },
    chat: {
        sendMessage: async (content: string, groupId?: number) => {
            const res = await fetch(`/api/chat/`, {
                method: "POST",
                headers: apiClient._getHeaders(),
                body: JSON.stringify(groupId ? { messageContent: content, groupId } : { messageContent: content }),
            });
            if (!res.ok) throw new Error("Failed to send message");
            const data = await res.json();
            if (!data.message && data.aiResponse) {
                data.message = data.aiResponse;
            }
            return data;
        },
        getHistory: async () => {
            return [];
        }
    },
    analytics: {
        getGroupStats: async (groupId: number) => {
            const params = new URLSearchParams({ groupId: String(groupId) });
            const res = await fetch(`/api/analytics/group?${params.toString()}`, { headers: apiClient._getHeaders() });
            if (!res.ok) throw new Error("Failed to fetch analytics stats");
            return res.json();
        },
        getPersonalStats: async (groupId?: number) => {
            const params = new URLSearchParams();
            if (typeof groupId === "number") {
                params.set("groupId", String(groupId));
            }
            const query = params.toString();
            const res = await fetch(`/api/analytics/personal${query ? `?${query}` : ""}`, { headers: apiClient._getHeaders() });
            if (!res.ok) throw new Error("Failed to fetch personal stats");
            return res.json();
        },
    },
    settlement: {
        getBalances: async (groupId: number) => {
            const params = new URLSearchParams({ groupId: String(groupId) });
            const res = await fetch(`/api/settlements/balances?${params.toString()}`, {
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to fetch balances");
            return res.json();
        },
        getSettlementPlan: async (groupId: number) => {
            const params = new URLSearchParams({ groupId: String(groupId) });
            const res = await fetch(`/api/settlements/plan?${params.toString()}`, {
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to fetch settlement plan");
            return res.json();
        },
        getHistory: async (groupId: number) => {
            const params = new URLSearchParams({ groupId: String(groupId) });
            const res = await fetch(`/api/settlements/?${params.toString()}`, {
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to fetch settlement history");
            return res.json();
        },
        recordSettlement: async (payload: {
            groupId: number;
            paidTo: number;
            amount: string;
            currency?: string;
            paymentMethod?: string;
            notes?: string;
        }) => {
            const res = await fetch(`/api/settlements/`, {
                method: "POST",
                headers: apiClient._getHeaders(),
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("Failed to record settlement");
            return res.json();
        }
    },
    event: {
        list: async (groupId?: number) => {
            const params = new URLSearchParams();
            if (typeof groupId === "number") {
                params.set("groupId", String(groupId));
            }
            const query = params.toString();
            const res = await fetch(`/api/events/${query ? `?${query}` : ""}`, {
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to fetch events");
            return res.json();
        },
        create: async (payload: any) => {
            const res = await fetch(`/api/events/`, {
                method: "POST",
                headers: apiClient._getHeaders(),
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("Failed to create event");
            return res.json();
        },
        getDetail: async (eventId: number) => {
            const res = await fetch(`/api/events/${eventId}`, {
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to fetch event details");
            return res.json();
        },
        addExpense: async (eventId: number, payload: any) => {
            const res = await fetch(`/api/events/${eventId}/expenses`, {
                method: "POST",
                headers: apiClient._getHeaders(),
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("Failed to add event expense");
            return res.json();
        },
        balances: async (eventId: number) => {
            const res = await fetch(`/api/events/${eventId}/balances`, {
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to fetch event balances");
            return res.json();
        },
        summary: async (eventId: number) => {
            const res = await fetch(`/api/events/${eventId}/summary`, {
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to fetch event summary");
            return res.json();
        },
    },
    notification: {
        list: async (unreadOnly: boolean) => {
            const params = new URLSearchParams({ unreadOnly: String(unreadOnly) });
            const res = await fetch(`/api/notifications/?${params.toString()}`, { headers: apiClient._getHeaders() });
            if (!res.ok) throw new Error("Failed to fetch notifications");
            return res.json();
        },
        unreadCount: async () => {
            const res = await fetch(`/api/notifications/unread-count`, { headers: apiClient._getHeaders() });
            if (!res.ok) throw new Error("Failed to fetch unread count");
            return res.json();
        },
        markRead: async (id: number) => {
            const res = await fetch(`/api/notifications/mark-read`, {
                method: "POST",
                headers: apiClient._getHeaders(),
                body: JSON.stringify({ id }),
            });
            if (!res.ok) throw new Error("Failed to mark notification read");
            return res.json();
        },
        markAllRead: async () => {
            const res = await fetch(`/api/notifications/mark-all-read`, {
                method: "POST",
                headers: apiClient._getHeaders(),
            });
            if (!res.ok) throw new Error("Failed to mark all read");
            return res.json();
        },
    }
};
