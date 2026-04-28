import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, CheckCircle, Users } from "lucide-react";

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: detail, isLoading } = trpc.event.getById.useQuery({ id: eventId }, { enabled: !!eventId });
  const { data: summary } = trpc.event.summary.useQuery({ eventId }, { enabled: !!eventId });
  const { data: balances } = trpc.event.balances.useQuery({ eventId }, { enabled: !!eventId });

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paidBy, setPaidBy] = useState<number | undefined>(undefined);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);

  const members = detail?.members ?? [];
  const expenses = detail?.expenses ?? [];

  const addExpense = trpc.event.addExpense.useMutation({
    onSuccess: () => {
      utils.event.getById.invalidate({ id: eventId });
      utils.event.summary.invalidate({ eventId });
      utils.event.balances.invalidate({ eventId });
      setExpenseOpen(false);
      setAmount("");
      setDescription("");
      toast("Event expense added!");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  useEffect(() => {
    if (members.length > 0 && !paidBy) {
      setPaidBy(members[0].userId);
    }
  }, [members, paidBy]);

  useEffect(() => {
    if (members.length > 0 && selectedMemberIds.length === 0) {
      setSelectedMemberIds(members.map((m: any) => m.userId));
    }
  }, [members, selectedMemberIds.length]);

  function toggleMember(userId: number) {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function handleAddExpense() {
    if (!eventId || !amount) {
      toast.error("Please enter amount");
      return;
    }
    const total = Number(amount);
    if (!members.length) {
      toast.error("No members found for this event");
      return;
    }

    const splitTargets = selectedMemberIds.length > 0 ? selectedMemberIds : members.map((m: any) => m.userId);
    const perPerson = (total / splitTargets.length).toFixed(2);
    const splits = splitTargets.map((userId) => ({ userId, amount: perPerson }));

    addExpense.mutate({
      eventId,
      payload: {
        eventId,
        amount: total,
        description: description.trim() || "event expense",
        paidBy: paidBy || members[0].userId,
        splits,
      },
    });
  }

  if (isLoading || !detail) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-sm text-[#60646c]">Loading event...</p>
      </div>
    );
  }

  const event = detail.event;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/events">
          <Button variant="ghost" size="icon" className="text-[#60646c]">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#1c2024]">{event.name}</h1>
          <p className="text-sm text-[#60646c]">{event.description || "Event overview"}</p>
        </div>
        <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
          <DialogTrigger asChild>
            <Button className="ml-auto rounded-full bg-[#0d74ce]">Add Event Expense</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Event Expense</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1.5 rounded-lg"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1.5 rounded-lg"
                />
              </div>
              <div>
                <Label>Paid By</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {members.map((m: any) => (
                    <button
                      key={m.userId}
                      onClick={() => setPaidBy(m.userId)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        paidBy === m.userId ? "bg-[#0d74ce] text-white" : "bg-[#f0f0f3] text-[#60646c]"
                      }`}
                    >
                      {m.user?.name || "Member"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Split Between</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {members.map((m: any) => (
                    <button
                      key={m.userId}
                      onClick={() => toggleMember(m.userId)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        selectedMemberIds.includes(m.userId)
                          ? "bg-[#10b981] text-white"
                          : "bg-[#f0f0f3] text-[#60646c]"
                      }`}
                    >
                      {m.user?.name || "Member"}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                className="w-full rounded-full bg-[#0d74ce]"
                onClick={handleAddExpense}
                disabled={addExpense.isPending}
              >
                {addExpense.isPending ? "Saving..." : "Save Expense"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-[#e4e4e9]">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0d74ce]/10">
              <Calendar className="h-6 w-6 text-[#0d74ce]" />
            </div>
            <div>
              <p className="text-sm text-[#60646c]">Budget</p>
              <p className="text-xl font-bold text-[#1c2024]">
                {summary?.budget ? `${summary.budget.toFixed(2)} ${summary.currency}` : "No budget"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#e4e4e9]">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#10b981]/10">
              <CheckCircle className="h-6 w-6 text-[#10b981]" />
            </div>
            <div>
              <p className="text-sm text-[#60646c]">Spent</p>
              <p className="text-xl font-bold text-[#1c2024]">
                {summary?.spent?.toFixed(2) ?? "0.00"} {summary?.currency ?? event.currency}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#e4e4e9]">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ab6400]/10">
              <Users className="h-6 w-6 text-[#ab6400]" />
            </div>
            <div>
              <p className="text-sm text-[#60646c]">Remaining</p>
              <p className="text-xl font-bold text-[#1c2024]">
                {summary?.remaining !== null && summary?.remaining !== undefined
                  ? `${summary.remaining.toFixed(2)} ${summary.currency}`
                  : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#e4e4e9]">
        <CardHeader>
          <CardTitle>Event Balances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!balances || balances.length === 0 ? (
            <p className="text-sm text-[#60646c]">No balances yet.</p>
          ) : (
            balances.map((member: any) => (
              <div
                key={member.userId}
                className="flex items-center justify-between rounded-lg border border-[#e4e4e9] p-4"
              >
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
                <div className={`text-sm font-semibold ${member.net >= 0 ? "text-[#10b981]" : "text-[#eb8e90]"}`}>
                  {member.net >= 0 ? "+" : ""}{member.net.toFixed(2)}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-[#e4e4e9]">
        <CardHeader>
          <CardTitle>Event Expenses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {expenses.length === 0 ? (
            <p className="text-sm text-[#60646c]">No expenses yet.</p>
          ) : (
            expenses.map((exp: any) => (
              <div key={exp.id} className="flex items-center justify-between rounded-lg border border-[#e4e4e9] p-4">
                <div>
                  <p className="text-sm font-medium text-[#1c2024]">{exp.description || "Expense"}</p>
                  <p className="text-xs text-[#60646c]">Paid by {exp.payer?.name || "Unknown"}</p>
                </div>
                <div className="text-sm font-semibold text-[#1c2024]">
                  {exp.amount} {exp.currency}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
