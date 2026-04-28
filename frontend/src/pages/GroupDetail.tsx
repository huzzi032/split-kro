import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft,
  Users,
  Receipt,
  Wallet,
  UserPlus,
  Trash2,
  Crown,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const groupId = Number(id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: group } = trpc.group.getById.useQuery({ id: groupId }, { enabled: !!groupId });
  const { data: expenses } = trpc.expense.list.useQuery({ groupId }, { enabled: !!groupId });
  const { data: settlementData } = trpc.settlement.settlementPlan.useQuery(
    { groupId },
    { enabled: !!groupId },
  );

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [removeMemberOpen, setRemoveMemberOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<any | null>(null);
  const [removeNotifyRemoved, setRemoveNotifyRemoved] = useState(true);
  const [removeNotifyRemaining, setRemoveNotifyRemaining] = useState(true);
  const [removeNotifyByEmail, setRemoveNotifyByEmail] = useState(true);
  const [removeNotificationTitle, setRemoveNotificationTitle] = useState("");
  const [removeNotificationBody, setRemoveNotificationBody] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteNotifyMembers, setDeleteNotifyMembers] = useState(true);
  const [deleteNotifyByEmail, setDeleteNotifyByEmail] = useState(true);
  const [deleteNotificationTitle, setDeleteNotificationTitle] = useState("");
  const [deleteNotificationBody, setDeleteNotificationBody] = useState("");

  const [limitOpen, setLimitOpen] = useState(false);
  const [limitMember, setLimitMember] = useState<any | null>(null);
  const [limitAmount, setLimitAmount] = useState("");

  const addMember = trpc.group.createInvitation.useMutation({
    onSuccess: () => {
      utils.group.getById.invalidate({ id: groupId });
      setAddMemberOpen(false);
      setMemberEmail("");
      toast("Invitation sent!");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const removeMember = trpc.group.removeMember.useMutation({
    onSuccess: () => {
      utils.group.getById.invalidate({ id: groupId });
      toast("Member removed");
      setRemoveMemberOpen(false);
      setMemberToRemove(null);
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const deleteGroup = trpc.group.delete.useMutation({
    onSuccess: () => {
      utils.group.list.invalidate();
      setDeleteOpen(false);
      toast("Group deleted");
      navigate("/groups");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const setMemberLimit = trpc.group.setMemberLimit.useMutation({
    onSuccess: () => {
      utils.group.getById.invalidate({ id: groupId });
      setLimitOpen(false);
      setLimitMember(null);
      setLimitAmount("");
      toast("Limit updated");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const isAdmin = useMemo(() => {
    const currentId = user?.id;
    if (!currentId) return false;
    return group?.members?.some((m: any) => m.userId === currentId && m.role === "admin");
  }, [group?.members, user?.id]);

  const limitsByUserId = useMemo(() => {
    const limits = group?.memberLimits ?? [];
    return new Map(limits.map((l: any) => [l.userId, l]));
  }, [group?.memberLimits]);

  if (!group) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-[#1c2024]">Loading group...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/groups">
          <Button variant="ghost" size="icon" className="text-[#60646c]">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#1c2024]">{group.name}</h1>
          <p className="text-sm text-[#60646c]">{group.description ?? "No description"}</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 rounded-full border-[#0d74ce] text-[#0d74ce]">
                <UserPlus className="h-4 w-4" /> Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Email Address</Label>
                  <Input
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="friend@email.com"
                    className="mt-1.5 rounded-lg"
                  />
                </div>
                <Button
                  className="w-full rounded-full bg-[#0d74ce]"
                  onClick={() =>
                    addMember.mutate({ groupId, email: memberEmail, role: "member" })
                  }
                  disabled={!memberEmail || addMember.isPending}
                >
                  {addMember.isPending ? "Adding..." : "Add Member"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {isAdmin && (
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 rounded-full border-[#eb8e90] text-[#eb8e90]">
                  <Trash2 className="h-4 w-4" /> Delete Group
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Group</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-[#60646c]">
                    This will remove the group, its expenses, and members. This action cannot be undone.
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#1c2024]">Notify members</span>
                      <Switch checked={deleteNotifyMembers} onCheckedChange={setDeleteNotifyMembers} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#1c2024]">Send email</span>
                      <Switch checked={deleteNotifyByEmail} onCheckedChange={setDeleteNotifyByEmail} />
                    </div>
                    <div>
                      <Label>Notification title</Label>
                      <Input
                        value={deleteNotificationTitle}
                        onChange={(e) => setDeleteNotificationTitle(e.target.value)}
                        placeholder={`Group deleted: ${group.name}`}
                        className="mt-1.5 rounded-lg"
                      />
                    </div>
                    <div>
                      <Label>Notification message</Label>
                      <Input
                        value={deleteNotificationBody}
                        onChange={(e) => setDeleteNotificationBody(e.target.value)}
                        placeholder={`The group ${group.name} was deleted.`}
                        className="mt-1.5 rounded-lg"
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full rounded-full bg-[#eb8e90]"
                    onClick={() =>
                      deleteGroup.mutate({
                        groupId,
                        notifyMembers: deleteNotifyMembers,
                        notifyByEmail: deleteNotifyByEmail,
                        notificationTitle: deleteNotificationTitle || undefined,
                        notificationBody: deleteNotificationBody || undefined,
                      })
                    }
                    disabled={deleteGroup.isPending}
                  >
                    {deleteGroup.isPending ? "Deleting..." : "Confirm Delete"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-[#e4e4e9]">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0d74ce]/10">
              <Receipt className="h-6 w-6 text-[#0d74ce]" />
            </div>
            <div>
              <p className="text-sm text-[#60646c]">Total Expenses</p>
              <p className="text-xl font-bold text-[#1c2024]">{expenses?.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#e4e4e9]">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#10b981]/10">
              <Users className="h-6 w-6 text-[#10b981]" />
            </div>
            <div>
              <p className="text-sm text-[#60646c]">Members</p>
              <p className="text-xl font-bold text-[#1c2024]">{group.members?.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#e4e4e9]">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ab6400]/10">
              <Wallet className="h-6 w-6 text-[#ab6400]" />
            </div>
            <div>
              <p className="text-sm text-[#60646c]">Currency</p>
              <p className="text-xl font-bold text-[#1c2024]">{group.currency}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="expenses" className="w-full">
        <TabsList className="rounded-lg bg-white border border-[#e4e4e9]">
          <TabsTrigger value="expenses" className="rounded-md data-[state=active]:bg-[#f0f0f3]">
            Expenses
          </TabsTrigger>
          <TabsTrigger value="balances" className="rounded-md data-[state=active]:bg-[#f0f0f3]">
            Balances
          </TabsTrigger>
          <TabsTrigger value="members" className="rounded-md data-[state=active]:bg-[#f0f0f3]">
            Members
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="mt-4 space-y-3">
          {!expenses || expenses.length === 0 ? (
            <Card className="border-[#e4e4e9]">
              <CardContent className="py-12 text-center">
                <Receipt className="mx-auto h-8 w-8 text-[#60646c]" />
                <p className="mt-2 text-sm text-[#60646c]">No expenses yet</p>
                <Link to="/expenses/new">
                  <Button className="mt-4 rounded-full bg-[#0d74ce]">Add Expense</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            expenses.map((exp) => (
              <Card key={exp.id} className="border-[#e4e4e9]">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f0f3]">
                      <Receipt className="h-5 w-5 text-[#60646c]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1c2024]">
                        {exp.description ?? exp.category}
                      </p>
                      <p className="text-xs text-[#60646c]">
                        By {exp.payer?.name} • {new Date(exp.expenseDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#1c2024]">
                      {exp.amount} {exp.currency}
                    </p>
                    <p className="text-xs text-[#60646c]">{exp.category}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="balances" className="mt-4">
          <Card className="border-[#e4e4e9]">
            <CardHeader>
              <CardTitle className="text-lg text-[#1c2024]">Who Owes Whom</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {settlementData?.balances.map((member) => (
                <div
                  key={member.userId}
                  className={`flex items-center justify-between rounded-lg border border-[#e4e4e9] p-4 ${
                    member.net >= 0 ? "bg-[#10b981]/10" : "bg-[#eb8e90]/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0d74ce]/10 font-semibold text-[#0d74ce]">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1c2024]">{member.name}</p>
                      <p className="text-xs text-[#60646c]">
                        <span className="inline-flex items-center rounded-full bg-[#10b981]/10 px-2 py-0.5 text-[#10b981]">
                          Paid {member.paid.toFixed(2)}
                        </span>
                        <span className="ml-2 inline-flex items-center rounded-full bg-[#eb8e90]/10 px-2 py-0.5 text-[#eb8e90]">
                          Owed {member.owed.toFixed(2)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div
                    className={`flex items-center gap-1 text-sm font-semibold ${
                      member.net >= 0 ? "text-[#10b981]" : "text-[#eb8e90]"
                    }`}
                  >
                    {member.net >= 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    {member.net >= 0 ? "+" : ""}
                    {member.net.toFixed(2)}
                  </div>
                </div>
              ))}

              {settlementData && settlementData.transactions.length > 0 && (
                <div className="mt-4 rounded-lg bg-[#f0f0f3] p-4">
                  <h4 className="mb-3 text-sm font-semibold text-[#1c2024]">
                    Simplified Settlement Plan
                  </h4>
                  <div className="space-y-2">
                    {settlementData.transactions.map((tx, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg bg-white p-3 text-sm"
                      >
                        <span className="text-[#1c2024]">
                          <strong>{tx.fromName}</strong> pays <strong>{tx.toName}</strong>
                        </span>
                        <span className="font-semibold text-[#0d74ce]">
                          {tx.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="mt-4 space-y-3">
          {group.members?.map((member) => (
            <Card key={member.id} className="border-[#e4e4e9]">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0d74ce]/10 font-semibold text-[#0d74ce]">
                    {member.user?.name?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1c2024]">
                      {member.user?.name ?? "Unknown"}
                      {member.role === "admin" && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#ab6400]/10 px-2 py-0.5 text-xs text-[#ab6400]">
                          <Crown className="h-3 w-3" /> Admin
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[#60646c]">{member.user?.email}</p>
                    {limitsByUserId.has(member.userId) && (
                      <p className="text-xs text-[#10b981]">
                        Limit: {limitsByUserId.get(member.userId).amount}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(isAdmin || member.userId === user?.id) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        setLimitMember(member);
                        const existing = limitsByUserId.get(member.userId);
                        setLimitAmount(existing ? String(existing.amount) : "");
                        setLimitOpen(true);
                      }}
                    >
                      Set Limit
                    </Button>
                  )}
                  {isAdmin && member.role !== "admin" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-[#eb8e90] hover:bg-[#eb8e90]/10"
                      onClick={() => {
                        setMemberToRemove(member);
                        setRemoveNotificationTitle(`Group update: ${group.name}`);
                        setRemoveNotificationBody(`You were removed from the group ${group.name}.`);
                        setRemoveNotifyRemoved(true);
                        setRemoveNotifyRemaining(true);
                        setRemoveNotifyByEmail(true);
                        setRemoveMemberOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={removeMemberOpen} onOpenChange={setRemoveMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-[#60646c]">
              Remove {memberToRemove?.user?.name ?? "this member"} from {group.name}?
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#1c2024]">Notify removed member</span>
                <Switch checked={removeNotifyRemoved} onCheckedChange={setRemoveNotifyRemoved} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#1c2024]">Notify remaining members</span>
                <Switch checked={removeNotifyRemaining} onCheckedChange={setRemoveNotifyRemaining} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#1c2024]">Send email</span>
                <Switch checked={removeNotifyByEmail} onCheckedChange={setRemoveNotifyByEmail} />
              </div>
              <div>
                <Label>Notification title</Label>
                <Input
                  value={removeNotificationTitle}
                  onChange={(e) => setRemoveNotificationTitle(e.target.value)}
                  placeholder={`Group update: ${group.name}`}
                  className="mt-1.5 rounded-lg"
                />
              </div>
              <div>
                <Label>Notification message</Label>
                <Input
                  value={removeNotificationBody}
                  onChange={(e) => setRemoveNotificationBody(e.target.value)}
                  placeholder={`You were removed from the group ${group.name}.`}
                  className="mt-1.5 rounded-lg"
                />
              </div>
            </div>
            <Button
              className="w-full rounded-full bg-[#eb8e90]"
              onClick={() =>
                removeMember.mutate({
                  groupId,
                  userId: memberToRemove?.userId,
                  notifyRemoved: removeNotifyRemoved,
                  notifyRemaining: removeNotifyRemaining,
                  notifyByEmail: removeNotifyByEmail,
                  notificationTitle: removeNotificationTitle || undefined,
                  notificationBody: removeNotificationBody || undefined,
                })
              }
              disabled={!memberToRemove || removeMember.isPending}
            >
              {removeMember.isPending ? "Removing..." : "Confirm Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={limitOpen} onOpenChange={setLimitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Member Limit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-[#60646c]">
              Set a spending limit for {limitMember?.user?.name ?? "this member"} in {group.name}.
            </p>
            <div>
              <Label>Limit amount</Label>
              <Input
                type="number"
                value={limitAmount}
                onChange={(e) => setLimitAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1.5 rounded-lg"
              />
            </div>
            <Button
              className="w-full rounded-full bg-[#0d74ce]"
              onClick={() =>
                setMemberLimit.mutate({
                  groupId,
                  userId: limitMember?.userId,
                  amount: limitAmount ? Number(limitAmount) : null,
                })
              }
              disabled={!limitMember || setMemberLimit.isPending}
            >
              {setMemberLimit.isPending ? "Saving..." : "Save Limit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
