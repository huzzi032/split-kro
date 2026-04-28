import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router";
import {
  Wallet,
  ArrowRightLeft,
  TrendingDown,
  TrendingUp,
  CheckCircle,
} from "lucide-react";

export default function Settlements() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: groups } = trpc.group.list.useQuery();
  const [selectedGroup, setSelectedGroup] = useState<number | undefined>(undefined);
  const hasGroups = !!groups && groups.length > 0;

  useEffect(() => {
    if (groups && groups.length > 0 && !selectedGroup) {
      setSelectedGroup(groups[0].id);
    }
  }, [groups, selectedGroup]);

  const { data: settlementPlan } = trpc.settlement.settlementPlan.useQuery(
    { groupId: selectedGroup! },
    { enabled: !!selectedGroup },
  );

  const { data: history } = trpc.settlement.list.useQuery(
    { groupId: selectedGroup! },
    { enabled: !!selectedGroup },
  );

  const settleMutation = trpc.settlement.settle.useMutation({
    onSuccess: () => {
      utils.settlement.settlementPlan.invalidate();
      utils.settlement.list.invalidate();
      toast("Settlement recorded!");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1c2024]">Settlements</h1>
          <p className="mt-1 text-[#60646c]">Settle up and view payment history</p>
        </div>
        {groups && groups.length > 0 && (
          <select
            value={selectedGroup ?? ""}
            onChange={(e) => setSelectedGroup(Number(e.target.value))}
            className="rounded-lg border border-[#e4e4e9] bg-white px-3 py-2 text-sm outline-none"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
      </div>

      {!hasGroups && (
        <Card className="border-[#e4e4e9]">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-[#60646c]">Create a group to start settling balances.</p>
            <Link to="/groups">
              <Button className="mt-4 rounded-full bg-[#0d74ce]">Create Group</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {hasGroups && (
        <>
      {/* Balances */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {settlementPlan?.balances.map((member) => (
          <Card key={member.userId} className="border-[#e4e4e9]">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0d74ce]/10 font-semibold text-[#0d74ce]">
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1c2024]">{member.name}</p>
                  <div className={`flex items-center gap-1 text-sm font-semibold ${
                    member.net >= 0 ? "text-[#10b981]" : "text-[#eb8e90]"
                  }`}>
                    {member.net >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {member.net >= 0 ? "+" : ""}{member.net.toFixed(2)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Simplified Plan */}
      {settlementPlan && settlementPlan.transactions.length > 0 && (
        <Card className="border-[#e4e4e9]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-[#1c2024]">
              <ArrowRightLeft className="h-5 w-5 text-[#0d74ce]" />
              Simplified Settlement Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {settlementPlan.transactions.map((tx, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-[#e4e4e9] p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eb8e90]/10 font-semibold text-[#eb8e90]">
                    {tx.fromName.charAt(0).toUpperCase()}
                  </div>
                  <ArrowRightLeft className="h-4 w-4 text-[#60646c]" />
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#10b981]/10 font-semibold text-[#10b981]">
                    {tx.toName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1c2024]">
                      {tx.fromName} <span className="text-[#60646c]">pays</span> {tx.toName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-[#1c2024]">{tx.amount.toFixed(2)}</span>
                  <Button
                    size="sm"
                    className="gap-1 rounded-full bg-[#10b981]"
                    onClick={() =>
                      settleMutation.mutate({
                        groupId: selectedGroup!,
                        paidTo: tx.to,
                        amount: tx.amount.toString(),
                      })
                    }
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Settle
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card className="border-[#e4e4e9]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-[#1c2024]">
            <Wallet className="h-5 w-5 text-[#ab6400]" />
            Settlement History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#60646c]">
              No settlements recorded yet
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-[#e4e4e9] p-4"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-[#10b981]" />
                    <div>
                      <p className="text-sm font-medium text-[#1c2024]">
                        {s.payer?.name} paid {s.payee?.name}
                      </p>
                      <p className="text-xs text-[#60646c]">
                        {new Date(s.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span className="font-semibold text-[#1c2024]">
                    {s.amount} {s.currency}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
