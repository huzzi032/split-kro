import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Users } from "lucide-react";

const categories = [
  "Food", "Rent", "Utilities", "Entertainment", "Transport",
  "Shopping", "Health", "Travel", "Education", "Other",
];

type SplitMode = "equal" | "custom" | "percentage";

export default function NewExpense() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: groups } = trpc.group.list.useQuery();

  const [groupId, setGroupId] = useState<number | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [category, setCategory] = useState("Food");
  const [description, setDescription] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [paidBy, setPaidBy] = useState<number>(0);
  const [customSplits, setCustomSplits] = useState<Record<number, string>>({});
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);

  const { data: members } = trpc.expense.membersForSplits.useQuery(
    { groupId: groupId! },
    { enabled: !!groupId },
  );

  useEffect(() => {
    if (!groups || groups.length === 0) {
      setGroupId(undefined);
      return;
    }

    const stillExists = typeof groupId === "number" && groups.some((g) => g.id === groupId);
    if (!stillExists) {
      setGroupId(groups[0].id);
    }
  }, [groups, groupId]);

  const createExpense = trpc.expense.create.useMutation({
    onSuccess: () => {
      utils.expense.list.invalidate();
      toast("Expense created successfully!");
      navigate("/expenses");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const memberList = members ?? [];
  const total = parseFloat(amount) || 0;
  const allowPartialSplit = memberList.length > 3;

  useEffect(() => {
    if (!memberList.length) {
      setSelectedMemberIds([]);
      return;
    }

    setSelectedMemberIds((prev) => {
      const validIds = prev.filter((id) => memberList.some((m) => m.id === id));
      if (validIds.length > 0) return validIds;
      return memberList.map((m) => m.id);
    });
  }, [memberList]);

  useEffect(() => {
    if (!memberList.length) {
      setPaidBy(0);
      return;
    }

    setPaidBy((prev) => (memberList.some((m) => m.id === prev) ? prev : memberList[0].id));
  }, [memberList]);

  const activeMembers = memberList.filter((m) => selectedMemberIds.includes(m.id));
  const splitTargets = allowPartialSplit ? activeMembers : memberList;

  function getSplits(): { userId: number; amount: string; percentage?: string }[] {
    if (!splitTargets.length) return [];
    const numMembers = splitTargets.length;

    if (splitMode === "equal") {
      const perPerson = (total / numMembers).toFixed(2);
      return splitTargets.map((m) => ({ userId: m.id, amount: perPerson }));
    }

    if (splitMode === "percentage") {
      return splitTargets.map((m) => {
        const pct = parseFloat(customSplits[m.id] ?? "0") || (100 / numMembers);
        const amt = ((total * pct) / 100).toFixed(2);
        return { userId: m.id, amount: amt, percentage: pct.toFixed(2) };
      });
    }

    return splitTargets.map((m) => ({
      userId: m.id,
      amount: customSplits[m.id] || (total / numMembers).toFixed(2),
    }));
  }

  function toggleSplitTarget(userId: number) {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function handleSubmit() {
    if (!groupId || !amount || !paidBy) {
      toast.error("Please fill all required fields");
      return;
    }
    const splits = getSplits();
    if (!splits.length) {
      toast.error("Select at least one member for split");
      return;
    }

    if (splitMode === "custom") {
      const splitSum = splits.reduce((sum, split) => sum + (parseFloat(split.amount) || 0), 0);
      if (Math.abs(splitSum - total) > 0.01) {
        toast.error("Custom split total must match expense amount");
        return;
      }
    }

    if (splitMode === "percentage") {
      const pctSum = splits.reduce((sum, split) => sum + (parseFloat(split.percentage || "0") || 0), 0);
      if (Math.abs(pctSum - 100) > 0.01) {
        toast.error("Percentages must total 100%");
        return;
      }
    }

    if (splits.some((split) => (parseFloat(split.amount) || 0) <= 0)) {
      toast.error("Each selected member must have a split greater than 0");
      return;
    }

    createExpense.mutate({
      groupId,
      amount: Number(amount),
      currency,
      category,
      description,
      paidBy,
      splits,
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5 text-[#60646c]" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-[#1c2024]">Add Expense</h1>
          <p className="text-sm text-[#60646c]">Record a new shared expense</p>
        </div>
      </div>

      <Card className="border-[#e4e4e9]">
        <CardContent className="space-y-4 p-6">
          {/* Group */}
          <div>
            <Label className="text-[#1c2024]">Group</Label>
            <select
              value={groupId ?? ""}
              onChange={(e) => {
                const nextGroupId = Number(e.target.value);
                setGroupId(Number.isFinite(nextGroupId) ? nextGroupId : undefined);
                setPaidBy(0);
                setCustomSplits({});
                setSelectedMemberIds([]);
              }}
              className="mt-1.5 w-full rounded-lg border border-[#e4e4e9] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0d74ce]"
              disabled={!groups || groups.length === 0}
            >
              {(!groups || groups.length === 0) && (
                <option value="">No groups available</option>
              )}
              {groups?.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            {(!groups || groups.length === 0) && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-[#fff7ed] p-3 text-xs text-[#ab6400]">
                <span>Create a group first to add expenses.</span>
                <Button variant="outline" size="sm" onClick={() => navigate("/groups")}>Go to Groups</Button>
              </div>
            )}
          </div>

          {/* Amount & Currency */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-[#1c2024]">Amount</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1.5 rounded-lg border-[#e4e4e9]"
              />
            </div>
            <div>
              <Label className="text-[#1c2024]">Currency</Label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#e4e4e9] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0d74ce]"
              >
                <option value="PKR">PKR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          {/* Description & Category */}
          <div>
            <Label className="text-[#1c2024]">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this expense for?"
              className="mt-1.5 rounded-lg border-[#e4e4e9]"
            />
          </div>
          <div>
            <Label className="text-[#1c2024]">Category</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    category === cat
                      ? "bg-[#0d74ce] text-white"
                      : "bg-[#f0f0f3] text-[#60646c] hover:bg-[#e4e4e9]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Paid By */}
          <div>
            <Label className="text-[#1c2024]">Paid By</Label>
            {memberList.length === 0 ? (
              <p className="mt-1.5 text-xs text-[#60646c]">No members found for this group yet.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {memberList.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPaidBy(m.id)}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      paidBy === m.id
                        ? "bg-[#0d74ce] text-white"
                        : "bg-[#f0f0f3] text-[#60646c] hover:bg-[#e4e4e9]"
                    }`}
                  >
                    <Users className="h-3 w-3" />
                    {m.name}
                  </button>
                ))}
              </div>
            )}
            {memberList.length === 1 && (
              <p className="mt-2 text-xs text-[#ab6400]">
                Only one member is in this group right now. Add more members from Group Details to split expenses.
              </p>
            )}
          </div>

          {/* Split Mode */}
          <div>
            <Label className="text-[#1c2024]">Split Type</Label>
            <div className="mt-1.5 flex gap-2">
              {(["equal", "custom", "percentage"] as SplitMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSplitMode(mode)}
                  className={`rounded-full px-4 py-2 text-xs font-medium capitalize transition-colors ${
                    splitMode === mode
                      ? "bg-[#0d74ce] text-white"
                      : "bg-[#f0f0f3] text-[#60646c] hover:bg-[#e4e4e9]"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {allowPartialSplit && (
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[#1c2024]">Split Between</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedMemberIds(memberList.map((m) => m.id))}
                    className="text-xs font-medium text-[#0d74ce]"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => setSelectedMemberIds([])}
                    className="text-xs font-medium text-[#60646c]"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-[#60646c]">
                Choose only members involved in this expense.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {memberList.map((m) => {
                  const selected = selectedMemberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleSplitTarget(m.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        selected
                          ? "bg-[#0d74ce] text-white"
                          : "bg-[#f0f0f3] text-[#60646c] hover:bg-[#e4e4e9]"
                      }`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Split Details */}
          {splitMode !== "equal" && splitTargets.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[#1c2024]">
                {splitMode === "percentage" ? "Percentages (%)" : "Custom Amounts"}
              </Label>
              {splitTargets.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-[#1c2024]">{m.name}</span>
                  <Input
                    type="number"
                    value={customSplits[m.id] ?? ""}
                    onChange={(e) =>
                      setCustomSplits({ ...customSplits, [m.id]: e.target.value })
                    }
                    placeholder={splitMode === "percentage" ? "%" : "Amount"}
                    className="w-32 rounded-lg border-[#e4e4e9]"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          <div className="rounded-lg bg-[#f0f0f3] p-4">
            <p className="text-sm font-medium text-[#1c2024]">Split Summary</p>
            <div className="mt-2 space-y-1">
              {getSplits().map((s) => {
                const member = memberList.find((m) => m.id === s.userId);
                return (
                  <div key={s.userId} className="flex justify-between text-sm">
                    <span className="text-[#60646c]">{member?.name ?? "Unknown"}</span>
                    <span className="font-medium text-[#1c2024]">
                      {s.amount} {currency}
                      {s.percentage && ` (${s.percentage}%)`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <Button
            className="w-full rounded-full bg-[#0d74ce]"
            onClick={handleSubmit}
            disabled={createExpense.isPending}
          >
            {createExpense.isPending ? "Saving..." : "Save Expense"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
