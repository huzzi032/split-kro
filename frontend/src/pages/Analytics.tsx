import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Download, TrendingUp, PieChart as PieIcon, BarChart3 } from "lucide-react";

const COLORS = ["#0d74ce", "#10b981", "#ab6400", "#eb8e90", "#8b5cf6", "#f59e0b", "#ec4899", "#6366f1", "#14b8a6", "#78716c"];

export default function Analytics() {
  const { data: groups } = trpc.group.list.useQuery();
  const [selectedGroup, setSelectedGroup] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (groups && groups.length > 0 && !selectedGroup) {
      setSelectedGroup(groups[0].id);
    }
  }, [groups, selectedGroup]);

  const { data: stats, isLoading } = trpc.analytics.groupStats.useQuery(
    { groupId: selectedGroup! },
    { enabled: !!selectedGroup },
  );

  const { data: personalStats } = trpc.analytics.personalStats.useQuery(
    { groupId: selectedGroup },
    { enabled: !!selectedGroup },
  );

  const hasGroups = !!groups && groups.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1c2024]">Analytics</h1>
          <p className="mt-1 text-[#60646c]">Insights into your group spending</p>
        </div>
        <div className="flex items-center gap-3">
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
          <Button variant="outline" className="gap-2 rounded-full border-[#e4e4e9]">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {!hasGroups && (
        <Card className="border-[#e4e4e9]">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-[#60646c]">Create a group to start seeing analytics.</p>
            <Link to="/groups">
              <Button className="mt-4 rounded-full bg-[#0d74ce]">Create Group</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {hasGroups && (
        <>
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-[#e4e4e9]">
          <CardContent className="p-6">
            <p className="text-sm text-[#60646c]">Total Spent</p>
            <p className="mt-2 text-2xl font-bold text-[#1c2024]">
              {stats?.totalAmount?.toFixed(2) ?? "0.00"} PKR
            </p>
          </CardContent>
        </Card>
        <Card className="border-[#e4e4e9]">
          <CardContent className="p-6">
            <p className="text-sm text-[#60646c]">Total Expenses</p>
            <p className="mt-2 text-2xl font-bold text-[#1c2024]">{stats?.totalExpenses ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-[#e4e4e9]">
          <CardContent className="p-6">
            <p className="text-sm text-[#60646c]">Average Expense</p>
            <p className="mt-2 text-2xl font-bold text-[#1c2024]">
              {stats?.averageExpense?.toFixed(2) ?? "0.00"} PKR
            </p>
          </CardContent>
        </Card>
        <Card className="border-[#e4e4e9]">
          <CardContent className="p-6">
            <p className="text-sm text-[#60646c]">Your Share</p>
            <p className="mt-2 text-2xl font-bold text-[#1c2024]">
              {personalStats?.totalOwed?.toFixed(2) ?? "0.00"} PKR
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category Breakdown */}
        <Card className="border-[#e4e4e9]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-[#1c2024]">
              <PieIcon className="h-5 w-5 text-[#0d74ce]" />
              Category Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !stats ? (
              <div className="h-64 animate-pulse rounded-lg bg-[#f0f0f3]" />
            ) : stats.categoryBreakdown.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-[#60646c]">
                No data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.categoryBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="total"
                    nameKey="category"
                  >
                    {stats.categoryBreakdown.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} PKR`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Member Comparison */}
        <Card className="border-[#e4e4e9]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-[#1c2024]">
              <BarChart3 className="h-5 w-5 text-[#10b981]" />
              Member Spending
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !stats ? (
              <div className="h-64 animate-pulse rounded-lg bg-[#f0f0f3]" />
            ) : stats.memberSpending.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-[#60646c]">
                No data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.memberSpending}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e9" />
                  <XAxis dataKey="name" tickFormatter={(v) => v || "User"} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} PKR`} />
                  <Bar dataKey="total" fill="#0d74ce" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Monthly Trends */}
        <Card className="border-[#e4e4e9] lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-[#1c2024]">
              <TrendingUp className="h-5 w-5 text-[#ab6400]" />
              Monthly Spending Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !stats ? (
              <div className="h-64 animate-pulse rounded-lg bg-[#f0f0f3]" />
            ) : stats.monthlyTrends.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-[#60646c]">
                No data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={[...stats.monthlyTrends].reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e9" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} PKR`} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#0d74ce"
                    strokeWidth={2}
                    dot={{ fill: "#0d74ce" }}
                    name="Total Spent"
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: "#10b981" }}
                    name="Expense Count"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
        </>
      )}
    </div>
  );
}
