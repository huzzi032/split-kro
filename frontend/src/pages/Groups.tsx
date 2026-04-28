import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router";
import { Plus, Users, ArrowRight } from "lucide-react";

export default function Groups() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: groups, isLoading } = trpc.group.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", description: "", currency: "PKR" });

  const createGroup = trpc.group.create.useMutation({
    onSuccess: () => {
      utils.group.list.invalidate();
      setCreateOpen(false);
      setNewGroup({ name: "", description: "", currency: "PKR" });
      toast("Group created successfully!");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1c2024]">Groups</h1>
          <p className="mt-1 text-[#60646c]">Manage your expense sharing groups</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full bg-[#0d74ce]">
              <Plus className="h-4 w-4" /> Create Group
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-[#1c2024]">
                Create New Group
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-[#1c2024]">Group Name</Label>
                <Input
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  placeholder="e.g., Roommates, Trip to Skardu"
                  className="mt-1.5 rounded-lg border-[#e4e4e9]"
                />
              </div>
              <div>
                <Label className="text-[#1c2024]">Description (optional)</Label>
                <Input
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                  placeholder="What is this group for?"
                  className="mt-1.5 rounded-lg border-[#e4e4e9]"
                />
              </div>
              <div>
                <Label className="text-[#1c2024]">Currency</Label>
                <select
                  value={newGroup.currency}
                  onChange={(e) => setNewGroup({ ...newGroup, currency: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-[#e4e4e9] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0d74ce]"
                >
                  <option value="PKR">PKR - Pakistani Rupee</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                </select>
              </div>
              <Button
                className="w-full rounded-full bg-[#0d74ce]"
                onClick={() => createGroup.mutate(newGroup)}
                disabled={!newGroup.name || createGroup.isPending}
              >
                {createGroup.isPending ? "Creating..." : "Create Group"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-40 animate-pulse border-[#e4e4e9] bg-[#f0f0f3]" />
          ))}
        </div>
      ) : !groups || groups.length === 0 ? (
        <Card className="border-[#e4e4e9]">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f0f0f3]">
              <Users className="h-8 w-8 text-[#60646c]" />
            </div>
            <h3 className="text-lg font-semibold text-[#1c2024]">No groups yet</h3>
            <p className="mt-1 text-sm text-[#60646c]">
              Create a group to start tracking shared expenses with friends and family
            </p>
            <Button
              className="mt-4 gap-2 rounded-full bg-[#0d74ce]"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" /> Create Your First Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Card
              key={group.id}
              className="group border-[#e4e4e9] shadow-sm transition-shadow hover:shadow-md"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0d74ce]/10 text-xl font-bold text-[#0d74ce]">
                    {group.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-[#f0f0f3] px-3 py-1 text-xs font-medium text-[#60646c]">
                    <Users className="h-3.5 w-3.5" />
                    {group.memberCount ?? group.members?.length ?? 0} members
                  </div>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#1c2024]">{group.name}</h3>
                {group.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-[#60646c]">{group.description}</p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs font-medium text-[#60646c]">
                    {group.currency} • Created{" "}
                    {new Date(group.createdAt).toLocaleDateString()}
                  </span>
                  <Link to={`/groups/${group.id}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-[#0d74ce] hover:bg-[#0d74ce]/5"
                    >
                      Open <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
