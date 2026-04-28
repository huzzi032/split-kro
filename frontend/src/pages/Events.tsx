import { useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Plus, Wallet } from "lucide-react";

export default function Events() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: groups } = trpc.group.list.useQuery();
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>(undefined);

  const { data: events, isLoading } = trpc.event.list.useQuery(
    { groupId: selectedGroupId },
    { enabled: true },
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    name: "",
    description: "",
    budget: "",
    currency: "PKR",
    groupId: 0,
  });

  const createEvent = trpc.event.create.useMutation({
    onSuccess: () => {
      utils.event.list.invalidate();
      setCreateOpen(false);
      setNewEvent({ name: "", description: "", budget: "", currency: "PKR", groupId: 0 });
      toast("Event created successfully!");
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const groupOptions = groups ?? [];
  const defaultGroupId = useMemo(() => groupOptions[0]?.id ?? 0, [groupOptions]);

  function handleCreate() {
    const groupId = newEvent.groupId || selectedGroupId || defaultGroupId;
    if (!groupId) {
      toast.error("Please select a group");
      return;
    }
    if (!newEvent.name.trim()) {
      toast.error("Please enter an event name");
      return;
    }

    createEvent.mutate({
      groupId,
      name: newEvent.name.trim(),
      description: newEvent.description.trim() || undefined,
      budget: newEvent.budget ? Number(newEvent.budget) : undefined,
      currency: newEvent.currency,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1c2024]">Events & Trips</h1>
          <p className="mt-1 text-[#60646c]">Plan trips, track budgets, and split event expenses</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {groupOptions.length > 0 && (
            <select
              value={selectedGroupId ?? ""}
              onChange={(e) => setSelectedGroupId(Number(e.target.value))}
              className="rounded-lg border border-[#e4e4e9] bg-white px-3 py-2 text-sm outline-none"
            >
              <option value="">All groups</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-full bg-[#0d74ce]">
                <Plus className="h-4 w-4" /> Create Event
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Event</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Event Name</Label>
                  <Input
                    value={newEvent.name}
                    onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                    placeholder="Trip to Hunza"
                    className="mt-1.5 rounded-lg"
                  />
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Input
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    placeholder="Hotel, transport, meals"
                    className="mt-1.5 rounded-lg"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Budget (optional)</Label>
                    <Input
                      type="number"
                      value={newEvent.budget}
                      onChange={(e) => setNewEvent({ ...newEvent, budget: e.target.value })}
                      placeholder="0.00"
                      className="mt-1.5 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <select
                      value={newEvent.currency}
                      onChange={(e) => setNewEvent({ ...newEvent, currency: e.target.value })}
                      className="mt-1.5 w-full rounded-lg border border-[#e4e4e9] bg-white px-3 py-2 text-sm outline-none"
                    >
                      <option value="PKR">PKR</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label>Group</Label>
                  <select
                    value={newEvent.groupId || selectedGroupId || defaultGroupId}
                    onChange={(e) => setNewEvent({ ...newEvent, groupId: Number(e.target.value) })}
                    className="mt-1.5 w-full rounded-lg border border-[#e4e4e9] bg-white px-3 py-2 text-sm outline-none"
                  >
                    {groupOptions.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <Button
                  className="w-full rounded-full bg-[#0d74ce]"
                  onClick={handleCreate}
                  disabled={createEvent.isPending}
                >
                  {createEvent.isPending ? "Creating..." : "Create Event"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-40 animate-pulse border-[#e4e4e9] bg-[#f0f0f3]" />
          ))}
        </div>
      ) : !events || events.length === 0 ? (
        <Card className="border-[#e4e4e9]">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f0f0f3]">
              <Calendar className="h-8 w-8 text-[#60646c]" />
            </div>
            <h3 className="text-lg font-semibold text-[#1c2024]">No events yet</h3>
            <p className="mt-1 text-sm text-[#60646c]">Create an event to start planning your next trip.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event: any) => (
            <Card key={event.id} className="border-[#e4e4e9] shadow-sm transition-shadow hover:shadow-md">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0d74ce]/10 text-xl font-bold text-[#0d74ce]">
                    {event.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-[#f0f0f3] px-3 py-1 text-xs font-medium text-[#60646c]">
                    <Wallet className="h-3.5 w-3.5" />
                    {event.memberCount ?? 0} members
                  </div>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#1c2024]">{event.name}</h3>
                {event.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-[#60646c]">{event.description}</p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs font-medium text-[#60646c]">
                    {event.budget ? `Budget ${event.budget} ${event.currency}` : "No budget"}
                  </span>
                  <Link to={`/events/${event.id}`}>
                    <Button variant="ghost" size="sm" className="text-[#0d74ce] hover:bg-[#0d74ce]/5">
                      Open
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
