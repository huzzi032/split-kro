import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Receipt,
  ArrowRight,
} from "lucide-react";
import { useEffect, useState } from "react";

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  trend?: "up" | "down" | "neutral";
  color: string;
}) {
  return (
    <Card className="border-[#e4e4e9] shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-[#60646c]">{title}</p>
            <p className="mt-2 text-2xl font-bold text-[#1c2024]">{value}</p>
            {subtitle && <p className="mt-1 text-xs text-[#60646c]">{subtitle}</p>}
          </div>
          <div className={`rounded-lg p-2.5 ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1 text-xs">
            {trend === "up" ? (
              <TrendingUp className="h-3.5 w-3.5 text-[#10b981]" />
            ) : trend === "down" ? (
              <TrendingDown className="h-3.5 w-3.5 text-[#eb8e90]" />
            ) : null}
            <span
              className={
                trend === "up"
                  ? "text-[#10b981]"
                  : trend === "down"
                    ? "text-[#eb8e90]"
                    : "text-[#60646c]"
              }
            >
              {trend === "up" ? "Increased" : "Decreased"} from last month
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: groups, isLoading: groupsLoading } = trpc.group.list.useQuery();
  const [selectedGroup, setSelectedGroup] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (groups && groups.length > 0 && !selectedGroup) {
      setSelectedGroup(groups[0].id);
    }
  }, [groups, selectedGroup]);

  const { data: personalStats } = trpc.analytics.personalStats.useQuery(
    { groupId: selectedGroup },
    { enabled: !!selectedGroup },
  );

  const { data: balances } = trpc.settlement.balances.useQuery(
    { groupId: selectedGroup! },
    { enabled: !!selectedGroup },
  );

  const { data: recentExpenses } = trpc.expense.list.useQuery(
    { groupId: selectedGroup! },
    { enabled: !!selectedGroup },
  );

  // const personalBalance = balances?.find((b) => b.userId === user?.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1c2024]">
          Welcome back, {user?.name?.split(" ")[0] ?? "there"}!
        </h1>
        <p className="mt-1 text-[#60646c]">
          Here's what's happening with your shared expenses
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Spent"
          value={`${personalStats?.totalPaid?.toFixed(2) ?? "0.00"} PKR`}
          icon={Wallet}
          color="bg-[#0d74ce]"
          trend="up"
        />
        <StatCard
          title="You Owe"
          value={`${personalStats?.totalOwed?.toFixed(2) ?? "0.00"} PKR`}
          icon={TrendingDown}
          color="bg-[#eb8e90]"
          trend="neutral"
        />
        <StatCard
          title="Groups"
          value={`${groups?.length ?? 0}`}
          subtitle={`${groups?.reduce((acc, g) => acc + (g.memberCount ?? g.members?.length ?? 0), 0) ?? 0} total members`}
          icon={Users}
          color="bg-[#10b981]"
        />
        <StatCard
          title="Expenses"
          value={`${recentExpenses?.length ?? 0}`}
          subtitle="This group"
          icon={Receipt}
          color="bg-[#ab6400]"
        />
      </div>

      {/* Group Selector & Balance */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-[#e4e4e9] shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold text-[#1c2024]">
              Group Balances
            </CardTitle>
            {groups && groups.length > 0 && (
              <select
                value={selectedGroup ?? ""}
                onChange={(e) => setSelectedGroup(Number(e.target.value))}
                className="rounded-lg border border-[#e4e4e9] bg-white px-3 py-1.5 text-sm text-[#1c2024] outline-none focus:ring-2 focus:ring-[#0d74ce]"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </CardHeader>
          <CardContent>
            {groupsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !groups || groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f0f0f3]">
                  <Users className="h-8 w-8 text-[#60646c]" />
                </div>
                <h3 className="text-lg font-semibold text-[#1c2024]">No groups yet</h3>
                <p className="mt-1 text-sm text-[#60646c]">
                  Create a group to start splitting expenses
                </p>
                <Link to="/groups" className="mt-4">
                  <Button className="rounded-full bg-[#0d74ce]">Create Group</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {balances?.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between rounded-lg border border-[#e4e4e9] p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0d74ce]/10 text-sm font-semibold text-[#0d74ce]">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#1c2024]">
                          {member.name}
                          {member.userId === user?.id && (
                            <span className="ml-2 text-xs text-[#0d74ce]">(You)</span>
                          )}
                        </p>
                        <p className="text-xs text-[#60646c]">
                          <span className="inline-flex items-center rounded-full bg-[#10b981]/10 px-2 py-0.5 text-[#10b981]">
                            Paid: {member.paid.toFixed(2)}
                          </span>
                          <span className="ml-2 inline-flex items-center rounded-full bg-[#eb8e90]/10 px-2 py-0.5 text-[#eb8e90]">
                            Owed: {member.owed.toFixed(2)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div
                      className={`text-right text-sm font-semibold ${
                        member.net >= 0 ? "text-[#10b981]" : "text-[#eb8e90]"
                      }`}
                    >
                      {member.net >= 0 ? "+" : ""}
                      {member.net.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-[#e4e4e9] shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-[#1c2024]">
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/groups">
              <Button variant="outline" className="w-full justify-start gap-3 rounded-lg border-[#e4e4e9]">
                <Users className="h-4 w-4 text-[#0d74ce]" />
                Create Group
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            </Link>
            <Link to="/expenses/new">
              <Button variant="outline" className="w-full justify-start gap-3 rounded-lg border-[#e4e4e9]">
                <Receipt className="h-4 w-4 text-[#10b981]" />
                Add Expense
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            </Link>
            <Link to="/analytics">
              <Button variant="outline" className="w-full justify-start gap-3 rounded-lg border-[#e4e4e9]">
                <TrendingUp className="h-4 w-4 text-[#ab6400]" />
                View Analytics
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            </Link>
            <Link to="/settlements">
              <Button variant="outline" className="w-full justify-start gap-3 rounded-lg border-[#e4e4e9]">
                <Wallet className="h-4 w-4 text-[#eb8e90]" />
                Settle Up
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Expenses */}
      <Card className="border-[#e4e4e9] shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-[#1c2024]">
            Recent Expenses
          </CardTitle>
          <Link to="/expenses">
            <Button variant="ghost" size="sm" className="gap-1 text-[#0d74ce]">
              View All <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {!recentExpenses || recentExpenses.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#60646c]">
              No expenses yet. Add your first one!
            </div>
          ) : (
            <div className="space-y-2">
              {recentExpenses.slice(0, 5).map((exp) => (
                <div
                  key={exp.id}
                  className="flex items-center justify-between rounded-lg border border-[#e4e4e9] p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f0f3]">
                      <Receipt className="h-5 w-5 text-[#60646c]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1c2024]">
                        {exp.description ?? exp.category}
                      </p>
                      <p className="text-xs text-[#60646c]">
                        Paid by {exp.payer?.name ?? "Unknown"} on{" "}
                        {new Date(exp.expenseDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#1c2024]">
                      {exp.amount} {exp.currency}
                    </p>
                    <p className="text-xs text-[#60646c]">{exp.category}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
