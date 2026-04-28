import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { trpc } from "@/providers/trpc";
import { useState } from "react";
import AIChatWidget from "./AIChatWidget";
import { Link, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Users,
  Receipt,
  PieChart,
  Settings,
  LogOut,
  Menu,
  MessageSquare,
  Bell,
  Plus,
  ChevronRight,
  Wallet,
  CalendarDays,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users, label: "Groups", path: "/groups" },
  { icon: CalendarDays, label: "Events", path: "/events" },
  { icon: Receipt, label: "Expenses", path: "/expenses" },
  { icon: PieChart, label: "Analytics", path: "/analytics" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

function Sidebar({ groups, currentGroupId, onGroupSelect }: { groups: any[]; currentGroupId?: number; onGroupSelect?: (id: number) => void }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex h-full w-64 flex-col border-r border-[#e4e4e9] bg-white">
      <div className="flex h-16 items-center gap-2 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0d74ce]">
          <Wallet className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-semibold text-[#1c2024]">Split kro</span>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="space-y-1 py-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive
                  ? "bg-[#f0f0f3] text-[#1c2024]"
                  : "text-[#60646c] hover:bg-[#f8f8fb] hover:text-[#1c2024]"
                  }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>

        {groups.length > 0 && (
          <div className="mt-4">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#60646c]">
              Your Groups
            </div>
            <div className="space-y-1">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    onGroupSelect?.(g.id);
                    navigate(`/groups/${g.id}`);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${currentGroupId === g.id
                    ? "bg-[#f0f0f3] text-[#1c2024] font-medium"
                    : "text-[#60646c] hover:bg-[#f8f8fb]"
                    }`}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0d74ce]/10 text-xs font-semibold text-[#0d74ce]">
                    {g.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate">{g.name}</span>
                  <ChevronRight className="ml-auto h-4 w-4 opacity-50" />
                </button>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-[#e4e4e9] p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-[#60646c] hover:text-[#1c2024]"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("open-ai-chat", {
                detail: { groupId: currentGroupId },
              }),
            );
          }}
        >
          <MessageSquare className="h-5 w-5" />
          AI Chat Assistant
        </Button>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentGroupId, setCurrentGroupId] = useState<number | undefined>();
  const { data: groups } = trpc.group.list.useQuery(undefined, { enabled: !!user });
  const { data: unreadCount } = trpc.notification.unreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });

  return (
    <div className="flex h-screen w-full bg-[#f0f0f3]">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          groups={groups ?? []}
          currentGroupId={currentGroupId}
          onGroupSelect={setCurrentGroupId}
        />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild className="lg:hidden">
          <Button variant="ghost" size="icon" className="absolute left-4 top-3 z-50">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          <Sidebar
            groups={groups ?? []}
            currentGroupId={currentGroupId}
            onGroupSelect={(id) => {
              setCurrentGroupId(id);
              setSidebarOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-16 items-center justify-between border-b border-[#e4e4e9] bg-white px-4 lg:px-8">
          <div className="flex items-center gap-4 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0d74ce]">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-[#1c2024]">Split kro</span>
          </div>

          <div className="hidden lg:block" />

          <div className="flex items-center gap-3">
            <Link to="/expenses/new">
              <Button size="sm" className="gap-2 rounded-full bg-[#0d74ce] hover:bg-[#0d74ce]/90">
                <Plus className="h-4 w-4" />
                Add Expense
              </Button>
            </Link>

            <Link to="/notifications" className="relative">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5 text-[#60646c]" />
                {!!unreadCount && unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#eb8e90] text-[11px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </Link>

            <div className="flex items-center gap-3 pl-3 border-l border-[#e4e4e9]">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-[#1c2024]">{user?.name ?? "User"}</p>
                <p className="text-xs text-[#60646c]">{user?.email ?? ""}</p>
              </div>
              <div className="h-9 w-9 overflow-hidden rounded-full bg-[#0d74ce]/10">
                {user?.avatar ? (
                  <img src={user.avatar} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[#0d74ce]">
                    {(user?.name ?? "U").charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={logout} className="text-[#60646c]">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
      <AIChatWidget />
    </div>
  );
}
