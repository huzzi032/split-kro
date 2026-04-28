import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router";
import {
  Plus,
  Receipt,
  Filter,
  Trash2,
} from "lucide-react";

const categories = [
  "Food", "Rent", "Utilities", "Entertainment", "Transport",
  "Shopping", "Health", "Travel", "Education", "Other",
];

export default function Expenses() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: groups } = trpc.group.list.useQuery();
  const [selectedGroup, setSelectedGroup] = useState<number | undefined>(groups?.[0]?.id);
  const [filterCategory, setFilterCategory] = useState<string>("");

  useEffect(() => {
    if (groups && groups.length > 0 && !selectedGroup) {
      setSelectedGroup(groups[0].id);
    }
  }, [groups, selectedGroup]);

  const { data: expenses, isLoading } = trpc.expense.list.useQuery(
    { groupId: selectedGroup!, category: filterCategory || undefined },
    { enabled: !!selectedGroup },
  );

  const deleteExpense = trpc.expense.delete.useMutation({
    onSuccess: () => {
      utils.expense.list.invalidate();
      toast("Expense deleted");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1c2024]">Expenses</h1>
          <p className="mt-1 text-[#60646c]">View and manage all your expenses</p>
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
          <Link to="/expenses/new">
            <Button className="gap-2 rounded-full bg-[#0d74ce]">
              <Plus className="h-4 w-4" /> Add Expense
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-[#60646c]" />
        <Button
          variant={filterCategory === "" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-full text-xs"
          onClick={() => setFilterCategory("")}
        >
          All
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={filterCategory === cat ? "secondary" : "ghost"}
            size="sm"
            className="rounded-full text-xs"
            onClick={() => setFilterCategory(cat === filterCategory ? "" : cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-[#f0f0f3]" />
          ))}
        </div>
      ) : !expenses || expenses.length === 0 ? (
        <Card className="border-[#e4e4e9]">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Receipt className="h-8 w-8 text-[#60646c]" />
            <p className="mt-2 text-sm text-[#60646c]">No expenses found</p>
            <Link to="/expenses/new">
              <Button className="mt-4 rounded-full bg-[#0d74ce]">Add First Expense</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {expenses.map((exp) => (
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
                      Paid by {exp.payer?.name} • {new Date(exp.expenseDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#1c2024]">
                      {exp.amount} {exp.currency}
                    </p>
                    <p className="text-xs text-[#60646c]">{exp.category}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-[#eb8e90] hover:bg-[#eb8e90]/10"
                    onClick={() => deleteExpense.mutate({ id: exp.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
