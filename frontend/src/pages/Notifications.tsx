import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router";
import { Bell, CheckCheck, ArrowLeft, Receipt, Users, Wallet } from "lucide-react";

export default function Notifications() {
  const utils = trpc.useUtils();
  const { data: notifications, isLoading } = trpc.notification.list.useQuery({ unreadOnly: false });
  const { data: unreadCount } = trpc.notification.unreadCount.useQuery();
  const { data: pendingInvites } = trpc.group.listPendingInvitations.useQuery();

  const acceptInvite = trpc.group.acceptInvitation.useMutation({
    onSuccess: () => {
      utils.group.list.invalidate();
      utils.group.listPendingInvitations.invalidate();
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const declineInvite = trpc.group.declineInvitation.useMutation({
    onSuccess: () => {
      utils.group.listPendingInvitations.invalidate();
    },
  });

  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const getIcon = (type: string) => {
    switch (type) {
      case "expense_added": return Receipt;
      case "settlement": return Wallet;
      case "member_added": return Users;
      case "reminder": return Bell;
      case "system": return Bell;
      default: return Bell;
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5 text-[#60646c]" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[#1c2024]">Notifications</h1>
            {unreadCount !== undefined && unreadCount > 0 && (
              <p className="text-sm text-[#0d74ce]">{unreadCount} unread</p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 rounded-full border-[#e4e4e9]"
          onClick={() => markAllRead.mutate()}
        >
          <CheckCheck className="h-4 w-4" /> Mark all read
        </Button>
      </div>

      {pendingInvites && pendingInvites.length > 0 && (
        <Card className="border-[#e4e4e9]">
          <CardContent className="space-y-3 py-5">
            <p className="text-sm font-medium text-[#1c2024]">Pending invitations</p>
            {pendingInvites.map((invite: any) => (
              <div
                key={invite.id}
                className="flex flex-col gap-3 rounded-lg border border-[#e4e4e9] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-[#1c2024]">{invite.groupName}</p>
                  <p className="text-xs text-[#60646c]">Invited by {invite.inviterName}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="rounded-full bg-[#0d74ce]"
                    onClick={() => acceptInvite.mutate({ token: invite.token })}
                    disabled={acceptInvite.isPending}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => declineInvite.mutate({ token: invite.token })}
                    disabled={declineInvite.isPending}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-[#f0f0f3]" />
          ))}
        </div>
      ) : !notifications || notifications.length === 0 ? (
        <Card className="border-[#e4e4e9]">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Bell className="h-8 w-8 text-[#60646c]" />
            <p className="mt-2 text-sm text-[#60646c]">No notifications yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const Icon = getIcon(notif.type);
            return (
              <Card
                key={notif.id}
                className={`border-[#e4e4e9] transition-colors ${
                  !notif.isRead ? "bg-[#0d74ce]/5" : ""
                }`}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f0f3]">
                    <Icon className="h-5 w-5 text-[#60646c]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#1c2024]">{notif.title}</p>
                    {notif.body && (
                      <p className="text-xs text-[#60646c]">{notif.body}</p>
                    )}
                    <p className="mt-1 text-xs text-[#60646c]">
                      {new Date(notif.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!notif.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[#0d74ce]"
                      onClick={() => markRead.mutate({ id: notif.id })}
                    >
                      Mark read
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
