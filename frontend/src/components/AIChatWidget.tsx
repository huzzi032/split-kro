import { useState, useRef, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, X, Send, Bot, User, Sparkles, Loader2 } from "lucide-react";

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<
    { id: number; role: "user" | "assistant"; content: string; action?: string }[]
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: groups } = trpc.group.list.useQuery();
  const [selectedGroup, setSelectedGroup] = useState<number | undefined>(groups?.[0]?.id);

  useEffect(() => {
    if (groups && groups.length > 0 && !selectedGroup) {
      setSelectedGroup(groups[0].id);
    }
  }, [groups, selectedGroup]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{ groupId?: number }>;
      if (typeof customEvent.detail?.groupId === "number") {
        setSelectedGroup(customEvent.detail.groupId);
      }
      setOpen(true);
    };

    window.addEventListener("open-ai-chat", handleOpen as EventListener);
    return () => window.removeEventListener("open-ai-chat", handleOpen as EventListener);
  }, []);

  const sendMessage = trpc.chat.send.useMutation({
    onSuccess: (data) => {
      const reply = data.aiResponse || data.message || "";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: reply || "(no response)",
          action: data.action,
        },
      ]);
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
        // Refresh relevant data based on action
        if (data.action === "expense_created") {
          // Invalidate all queries that may be affected by a new expense
          utils.expense.list.invalidate();
          utils.settlement.balances.invalidate();
          utils.settlement.settlementPlan?.invalidate?.();
          utils.settlement.list?.invalidate?.();
          utils.analytics.groupStats.invalidate();
          if (selectedGroup) {
            utils.group.getById?.invalidate?.({ id: selectedGroup });
          }
      }
    },
    onError: (err) => {
      toast.error("AI Error", { description: err.message });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sendMessage.isPending]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timeout);
  }, [open]);

  function sendUserMessage(text: string) {
    if (!text.trim()) return;
    const userMsg = text.trim();
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: userMsg }]);
    setMessage("");
    sendMessage.mutate({ messageContent: userMsg, groupId: selectedGroup });
  }

  function handleSubmit() {
    sendUserMessage(message);
  }

  const quickActions = [
    "Show my balance",
    "Add lunch 5000 rupees split equal",
    "Who owes me?",
    "Give me a summary",
    "Create event Hunza Trip",
  ];

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-[#0d74ce] shadow-lg hover:bg-[#0d74ce]/90"
        >
          <MessageSquare className="h-6 w-6" />
        </Button>
      )}

      {/* Chat Window */}
      {open && (
        <Card className="fixed inset-x-3 bottom-3 z-50 flex h-[78vh] max-h-[640px] flex-col overflow-hidden rounded-2xl border border-[#e4e4e9] bg-white shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[560px] sm:w-[380px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#e4e4e9] bg-[#0d74ce] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">AI Assistant</p>
                <p className="text-[10px] text-white/70">Powered by Groq AI</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {groups && groups.length > 0 && (
                <select
                  value={selectedGroup ?? ""}
                  onChange={(e) => setSelectedGroup(Number(e.target.value))}
                  className="rounded-md border border-white/30 bg-white/10 px-2 py-1 text-xs text-white outline-none"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id} className="text-[#1c2024]">
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0d74ce]/10">
                  <Bot className="h-6 w-6 text-[#0d74ce]" />
                </div>
                <p className="mt-3 text-sm font-medium text-[#1c2024]">
                  Ask me about expenses
                </p>
                <p className="mt-1 text-xs text-[#60646c]">
                  I understand English and Urdu!
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {quickActions.map((action) => (
                    <button
                      key={action}
                      onClick={() => {
                        sendUserMessage(action);
                      }}
                      className="rounded-full bg-[#f0f0f3] px-3 py-1.5 text-xs text-[#60646c] transition-colors hover:bg-[#e4e4e9]"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${
                      msg.role === "user" ? "flex-row-reverse" : ""
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        msg.role === "user"
                          ? "bg-[#0d74ce]"
                          : "bg-[#10b981]"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <User className="h-3.5 w-3.5 text-white" />
                      ) : (
                        <Bot className="h-3.5 w-3.5 text-white" />
                      )}
                    </div>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-[#0d74ce] text-white"
                          : "bg-[#f0f0f3] text-[#1c2024]"
                      }`}
                    >
                      {msg.content}
                      {msg.action === "expense_created" && (
                        <span className="mt-1 block text-xs opacity-70">
                          Expense was auto-created
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {sendMessage.isPending && (
                  <div className="flex gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#10b981]">
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="flex items-center gap-2 rounded-2xl bg-[#f0f0f3] px-3 py-2 text-sm text-[#60646c]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Thinking...
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-[#e4e4e9] p-3">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type in English or Urdu..."
                className="rounded-full border-[#e4e4e9] text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
              <Button
                size="icon"
                className="shrink-0 rounded-full bg-[#0d74ce]"
                onClick={handleSubmit}
                disabled={!message.trim() || sendMessage.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-[#60646c]">
              Try: "Aj lunch 3500, hum 3 log" or "Show my balance"
            </p>
          </div>
        </Card>
      )}
    </>
  );
}
