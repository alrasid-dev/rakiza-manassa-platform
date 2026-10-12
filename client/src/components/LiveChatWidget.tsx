import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { useState } from "react";

const SUPPORT_ROLES = ["technical_support_agent", "technical_support_manager", "court_president", "assistant_president"];

/** زر عائم + نافذة محادثة دعم فني (يُخفى عن موظفي الدعم أنفسهم). */
export function LiveChatWidget() {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);

  const roles = trpc.court.myRoles.useQuery(undefined, { enabled: isAuthenticated });
  const me = trpc.court.people.self.useQuery(undefined, { enabled: isAuthenticated });
  const createSupport = trpc.court.communications.conversations.createSupport.useMutation();

  const messages = trpc.court.communications.conversations.get.useQuery(
    { conversationId: conversationId as number },
    { enabled: Boolean(conversationId) && isOpen, refetchInterval: 3000 },
  );
  const unread = trpc.court.communications.conversations.unreadCount.useQuery(
    undefined,
    { enabled: isAuthenticated && !isOpen, refetchInterval: 30000 },
  );
  const send = trpc.court.communications.conversations.send.useMutation({
    onSuccess: () => {
      setMessage("");
      void messages.refetch();
      void unread.refetch();
    },
  });

  const isSupport = roles.data?.some(role => SUPPORT_ROLES.includes(role)) ?? false;
  if (!isAuthenticated || isSupport) return null;
  const myId = me.data?.id;

  const openChat = async () => {
    setIsOpen(true);
    if (!conversationId) {
      try {
        const result = await createSupport.mutateAsync();
        setConversationId(result.conversationId);
      } catch {
        setIsOpen(false);
      }
    }
  };

  const submit = () => {
    if (message.trim() && conversationId) send.mutate({ conversationId, body: message.trim() });
  };

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => void openChat()}
          aria-label="محادثة الدعم"
          className="fixed left-5 bottom-20 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#1f7a4d] text-white shadow-lg transition hover:bg-[#17603b]"
        >
          <MessageCircle className="h-6 w-6" />
          {(unread.data ?? 0) > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold">
              {unread.data}
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <div className="fixed left-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl" dir="rtl">
          <div className="flex items-center justify-between border-b bg-[#1f7a4d] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              <span className="font-bold">الدعم الفني</span>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="إغلاق المحادثة">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
            {messages.data?.messages?.map(msg => (
              <div
                key={msg.message.id}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.message.senderProfileId === myId ? "self-end bg-[#1f7a4d] text-white" : "self-start bg-gray-100 text-gray-900"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.message.body}</p>
                <span className="mt-1 block text-[10px] opacity-70">
                  {new Date(msg.message.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t bg-white p-3">
            <div className="flex gap-2">
              <input
                value={message}
                onChange={event => setMessage(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && message.trim() && conversationId) submit();
                }}
                placeholder="اكتب رسالتك…"
                className="flex-1 rounded-lg border border-[#dbe1dc] px-3 py-2 text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!message.trim() || send.isPending || !conversationId}
                className="rounded-lg bg-[#1f7a4d] px-3 py-2 text-white disabled:opacity-50"
                aria-label="إرسال"
              >
                {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
