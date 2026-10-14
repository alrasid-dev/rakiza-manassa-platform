import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Loader2, MessageCircle, Minus, Paperclip, Send, X } from "lucide-react";
import { ChangeEvent, useState } from "react";
import { toast } from "sonner";

const SUPPORT_ROLES = ["technical_support_agent", "technical_support_manager", "court_president", "assistant_president"];

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "text/plain",
  "application/zip",
]);
const ACCEPT_ATTR = Array.from(ALLOWED_ATTACHMENT_MIME).join(",");

const parseAttachments = (value: unknown): Array<{ id: number; name: string; mimeType?: string; url?: string }> => {
  try { return Array.isArray(value) ? value as Array<{ id: number; name: string; mimeType?: string; url?: string }> : JSON.parse(String(value ?? "[]")); } catch { return []; }
};

/** زر عائم + نافذة محادثة دعم فني (يُخفى عن موظفي الدعم أنفسهم). */
export function LiveChatWidget() {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<Array<{ originalName: string; mimeType: string; contentBase64: string }>>([]);

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
      setAttachments([]);
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

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 5 - attachments.length);
    if (!files.length) { event.target.value = ""; return; }
    const oversized = files.find(file => file.size > MAX_ATTACHMENT_BYTES);
    if (oversized) { toast.error(`«${oversized.name}» يتجاوز الحد الأقصى (8 ميجابايت).`); event.target.value = ""; return; }
    const unsupported = files.find(file => file.type && !ALLOWED_ATTACHMENT_MIME.has(file.type));
    if (unsupported) { toast.error(`صيغة «${unsupported.name}» غير مدعومة. المدعوم: PDF، Word، Excel، PNG/JPEG، TXT، ZIP.`); event.target.value = ""; return; }
    const converted = await Promise.all(files.map(async (file): Promise<{ originalName: string; mimeType: string; contentBase64: string } | null> => {
      try {
        const contentBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        return { originalName: file.name, mimeType: file.type || "application/octet-stream", contentBase64 };
      } catch {
        return null;
      }
    }));
    setAttachments(prev => [...prev, ...converted.filter((file): file is { originalName: string; mimeType: string; contentBase64: string } => Boolean(file))].slice(0, 5));
    event.target.value = "";
  };

  const submit = () => {
    if (!conversationId) return;
    if (!message.trim() && !attachments.length) return;
    send.mutate({ conversationId, body: message.trim() || "مرفق", attachments: attachments.length ? attachments : undefined });
  };

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => void openChat()}
          aria-label="محادثة الدعم"
          className="fixed left-5 bottom-20 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--rakiza-olive-strong)] text-white shadow-lg transition hover:bg-[#17603b]"
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
          <div className="flex items-center justify-between border-b bg-[var(--rakiza-olive-strong)] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              <span className="font-bold">الدعم الفني</span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setIsOpen(false)} aria-label="تصغير">
                <Minus className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="إغلاق المحادثة">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
            {messages.data?.messages?.map(msg => (
              <div
                key={msg.message.id}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.message.senderProfileId === myId ? "self-end bg-[var(--rakiza-olive-strong)] text-white" : "self-start bg-gray-100 text-[var(--rakiza-ink)]"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.message.body}</p>
                {parseAttachments(msg.attachments).map(att => att.url ? (String(att.mimeType || "").startsWith("image/") ? <a key={att.id} href={att.url} target="_blank" rel="noreferrer" className="mt-1 block"><img src={att.url} alt={att.name} className="max-h-44 max-w-full rounded-lg" /></a> : <a key={att.id} href={att.url} download={att.name} className="mt-1 block text-xs underline">📎 {att.name}</a>) : null)}
                <span className="mt-1 block text-[10px] opacity-70">
                  {new Date(msg.message.createdAt).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t bg-white p-3">
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((file, index) => (
                  <span key={index} className="flex items-center gap-1 rounded-full bg-[#eef5ec] px-2 py-1 text-xs text-[var(--rakiza-olive-strong)]">
                    {file.originalName}
                    <button type="button" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))} aria-label={`إزالة ${file.originalName}`}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="cursor-pointer text-[var(--rakiza-olive-strong)]" title="إرفاق ملف">
                <Paperclip className="h-5 w-5" />
                <input type="file" multiple className="hidden" accept={ACCEPT_ATTR} onChange={event => void addFiles(event)} />
              </label>
              <input
                value={message}
                onChange={event => setMessage(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && (message.trim() || attachments.length) && conversationId) submit();
                }}
                placeholder="اكتب رسالتك…"
                className="flex-1 rounded-lg border border-[#dbe1dc] px-3 py-2 text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={submit}
                disabled={(!message.trim() && !attachments.length) || send.isPending || !conversationId}
                className="rounded-lg bg-[var(--rakiza-olive-strong)] px-3 py-2 text-white disabled:opacity-50"
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
