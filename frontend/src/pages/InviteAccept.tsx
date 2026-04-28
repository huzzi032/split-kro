import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";

export default function InviteAccept() {
  const [params] = useSearchParams();
  const token = params.get("token")?.trim();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  const acceptInvite = trpc.group.acceptInvitation.useMutation({
    onSuccess: (data) => {
      const groupId = data?.groupId;
      navigate(groupId ? `/groups/${groupId}` : "/groups");
    },
  });

  const declineInvite = trpc.group.declineInvitation.useMutation({
    onSuccess: () => {
      navigate("/groups");
    },
  });

  useEffect(() => {
    if (!token) return;
    if (!isLoading && !isAuthenticated) {
      localStorage.setItem("pendingInviteToken", token);
      navigate("/login");
    }
  }, [token, isAuthenticated, isLoading, navigate]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7fb] p-6">
        <Card className="w-full max-w-lg border-[#e4e4e9]">
          <CardHeader>
            <CardTitle>Invalid invitation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[#60646c]">The invitation link is missing or invalid.</p>
            <Button className="mt-4" onClick={() => navigate("/groups")}>Go to Groups</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || (!isAuthenticated && !acceptInvite.isPending)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7fb] p-6">
        <Card className="w-full max-w-lg border-[#e4e4e9]">
          <CardHeader>
            <CardTitle>Checking invitation...</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[#60646c]">Please wait while we verify your account.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7fb] p-6">
      <Card className="w-full max-w-lg border-[#e4e4e9]">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[#60646c]">
            You have been invited to join a group on Split kro. Would you like to accept?
          </p>
          <div className="flex gap-3">
            <Button
              className="rounded-full bg-[#0d74ce]"
              onClick={() => acceptInvite.mutate({ token })}
              disabled={acceptInvite.isPending}
            >
              {acceptInvite.isPending ? "Accepting..." : "Accept"}
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => declineInvite.mutate({ token })}
              disabled={declineInvite.isPending}
            >
              {declineInvite.isPending ? "Declining..." : "Decline"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
