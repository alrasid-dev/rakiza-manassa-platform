import DashboardLayout from "@/components/DashboardLayout";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Check, CheckCheck, FileText, Forward, MessageCircle, Paperclip, Pin, Plus, Reply, Search, Send, UserRound, UsersRound, X } from "lucide-react";
import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const EMOJIS = ["👍", "✅", "👀", "🙏", "⚠️"];
const MAX_BYTES = 8 * 1024 * 1024;
type Pending = { originalName: string; mimeType: string; contentBase64: string };
type Reference = { id: number; senderName: string; body: string };
type CreateMode = "direct" | "group";
type DirectoryPerson = { profile: { id: number; fullName: string; email?: string | null; unitId?: number | null; jobTitle?: string | null }; unitName?: string | null };
type DirectoryUnit = { id: number; name: string };

export function filterCustomGroupPeople(people: Array<{ id: number; unitId: number | null; fullName?: string | null; email?: string | null }>, unitIds: string[], query: string) {
  const units = new Set(unitIds.map(Number));
  const value = query.trim().toLowerCase();
  return value.length < 2 ? [] : people.filter(person => Boolean(person.unitId && units.has(person.unitId) && `${person.fullName} ${person.email}`.toLowerCase().includes(value)));
}

export function expandCustomGroupMemberIds(ids: string[], unitIds: string[], people: Array<{ id: number; unitId: number | null }>) {
  return Array.from(new Set([...ids, ...unitIds.flatMap(unit => people.filter(person => person.unitId === Number(unit)).map(person => String(person.id)))]));
}

const initials = (text = "ر") => text.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("");
const preview = (text = "") => text.replace(/\s+/g, " ").trim().slice(0, 90) || "لا توجد رسائل بعد";
const clock = (date?: Date | string) => date ? new Date(date).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "";
const parseFiles = (value: unknown): any[] => { try { return Array.isArray(value) ? value : JSON.parse(String(value)); } catch { return []; } };

async function pending(file: File): Promise<Pending> {
  if (file.size > MAX_BYTES) throw new Error("حجم كل مرفق يجب ألا يتجاوز 8 م.ب.");
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { originalName: file.name, mimeType: file.type || "application/octet-stream", contentBase64 };
}

export default function MessagesPage() {
  const [location] = useLocation();
  const utils = trpc.useUtils();
  const me = trpc.court.people.self.useQuery();
  const roles = trpc.court.myRoles.useQuery();
  const permission = trpc.court.registration.myPermission.useQuery();
  const chats = trpc.court.communications.conversations.list.useQuery(undefined, { refetchInterval: 30_000 });
  const units = trpc.court.communications.units.useQuery();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const conversation = trpc.court.communications.conversations.get.useQuery({ conversationId: conversationId as number }, { enabled: Boolean(conversationId), refetchInterval: 4_000 });
  const [chatSearch, setChatSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [body, setBody] = useState("");
  const [attached, setAttached] = useState<Pending[]>([]);
  const [reply, setReply] = useState<Reference | null>(null);
  const [forward, setForward] = useState<Reference | null>(null);
  const [targetId, setTargetId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("direct");
  const [directoryUnitId, setDirectoryUnitId] = useState("");
  const [directorySearch, setDirectorySearch] = useState("");
  const [selectedProfileIds, setSelectedProfileIds] = useState<number[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupGreeting, setGroupGreeting] = useState("");
  const typing = useRef<number | null>(null);
  const isTyping = useRef(false);
  const setTyping = trpc.court.communications.conversations.setTyping.useMutation();
  const peopleSearch = trpc.court.communications.peopleSearch.useQuery(
    { unitId: Number(directoryUnitId) || undefined, query: directorySearch.trim() || undefined },
    { enabled: Boolean(directoryUnitId) },
  );
  const search = trpc.court.communications.conversations.searchMessages.useQuery(
    { conversationId: conversationId as number, query: messageSearch.trim() },
    { enabled: Boolean(conversationId) && messageSearch.trim().length >= 2 },
  );
  const refreshChats = (nextConversationId?: number) => {
    if (nextConversationId) setConversationId(nextConversationId);
    void chats.refetch();
    void utils.court.communications.conversations.unreadCount.invalidate();
  };
  const reaction = trpc.court.communications.conversations.toggleReaction.useMutation({ onSuccess: () => conversation.refetch(), onError: error => toast.error(error.message) });
  const pin = trpc.court.communications.conversations.setPinnedMessage.useMutation({ onSuccess: () => conversation.refetch(), onError: error => toast.error(error.message) });
  const send = trpc.court.communications.conversations.send.useMutation({
    onSuccess: () => { setBody(""); setAttached([]); setReply(null); void conversation.refetch(); refreshChats(); },
    onError: error => toast.error(error.message),
  });
  const forwardMessage = trpc.court.communications.conversations.forward.useMutation({ onSuccess: () => { setForward(null); setTargetId(""); toast.success("تمت إعادة التوجيه داخل ركيزة."); }, onError: error => toast.error(error.message) });
  const createConversation = trpc.court.communications.conversations.create.useMutation({
    onSuccess: (result) => { closeCreate(); refreshChats(result.conversationId); toast.success("تم إنشاء المحادثة الفردية."); },
    onError: error => toast.error(error.message),
  });
  const createGroup = trpc.court.communications.conversations.createCustomGroup.useMutation({
    onSuccess: (result) => { closeCreate(); refreshChats(result.conversationId); toast.success("تم إنشاء المجموعة."); },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    const id = Number(new URLSearchParams(location.split("?")[1] || "").get("conversationId"));
    if (id) setConversationId(id);
  }, [location]);
  useEffect(() => () => {
    if (typing.current) clearTimeout(typing.current);
    if (conversationId) setTyping.mutate({ conversationId, isTyping: false });
  }, [conversationId]);

  const filteredChats = useMemo(() => (chats.data || []).filter((item: any) => `${item.displayName} ${item.lastMessage?.body || ""}`.includes(chatSearch)), [chats.data, chatSearch]);
  const activeChat = (chats.data || []).find((item: any) => item.conversation.id === conversationId);
  const canPin = ["department", "custom", "general"].includes(conversation.data?.conversation?.conversationType || "") && (conversation.data?.conversation?.createdByProfileId === me.data?.id || roles.data?.some(role => ["court_president", "assistant_president", "court_secretary", "department_manager"].includes(role)));
  const canCreateGroup = permission.data === "full_control" || roles.data?.some(role => ["court_president", "assistant_president", "court_secretary", "department_manager"].includes(role));
  const people = (peopleSearch.data || []) as DirectoryPerson[];
  const directoryUnits = (units.data || []) as DirectoryUnit[];

  function closeCreate() {
    setCreateOpen(false);
    setDirectoryUnitId("");
    setDirectorySearch("");
    setSelectedProfileIds([]);
    setGroupName("");
    setGroupGreeting("");
    setCreateMode("direct");
  }

  function setText(value: string) {
    setBody(value);
    if (!conversationId) return;
    if (typing.current) clearTimeout(typing.current);
    if (value.trim() && !isTyping.current) {
      isTyping.current = true;
      setTyping.mutate({ conversationId, isTyping: true });
    }
    typing.current = window.setTimeout(() => {
      isTyping.current = false;
      setTyping.mutate({ conversationId, isTyping: false });
    }, 2800);
  }

  async function addAttachments(list: File[]) {
    try {
      const files = await Promise.all(list.map(pending));
      if (files.length + attached.length > 5) throw new Error("يمكن إرفاق خمسة ملفات هنا؛ استخدم تجميع ZIP للمرفقات الأكثر.");
      setAttached(current => [...current, ...files]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز الملف.");
    }
  }

  function toggleProfile(profileId: number) {
    setSelectedProfileIds(current => current.includes(profileId) ? current.filter(id => id !== profileId) : [...current, profileId]);
  }

  function startDirectChat(profileId: number) {
    createConversation.mutate({ participantProfileIds: [profileId], body: "بدء محادثة مباشرة", conversationType: "direct", unitId: Number(directoryUnitId) || null });
  }

  function createSelectedGroup() {
    if (!groupName.trim()) { toast.error("اكتب اسم المجموعة أولاً."); return; }
    if (!selectedProfileIds.length) { toast.error("اختر موظفاً واحداً على الأقل."); return; }
    createGroup.mutate({ name: groupName.trim(), participantProfileIds: selectedProfileIds, body: groupGreeting.trim() || undefined });
  }

  const submit = () => {
    if (conversationId) send.mutate({ conversationId, body: body.trim() || "مرفق", replyToMessageId: reply?.id ?? null, attachments: attached });
  };
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); void addAttachments(Array.from(event.dataTransfer.files)); };

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-[1440px]">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[.12em] text-[var(--rakiza-olive-strong)]">تواصل داخلي محمي</p>
            <h1 className="mt-1 text-3xl font-black text-[var(--rakiza-ink)]">الدردشات</h1>
          </div>
          <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--rakiza-olive)] px-4 py-2.5 text-sm font-black text-white hover:bg-[var(--rakiza-olive-strong)]"><Plus className="h-4 w-4" />محادثة جديدة</button>
        </header>

        <div className="min-h-[650px] overflow-hidden rounded-[1.75rem] border border-[#cbd6ca] bg-[#f7f8f3] shadow-[0_18px_48px_rgba(30,61,48,.08)] lg:grid lg:grid-cols-[21rem_1fr]">
          <aside className="border-b bg-[#eff2eb] p-3 lg:border-b-0 lg:border-l lg:border-[#d4ddd1]">
            <label className="relative block"><Search className="absolute right-3 top-3 h-4 w-4 text-[#648071]" /><input value={chatSearch} onChange={event => setChatSearch(event.target.value)} placeholder="ابحث في الدردشات" className="h-11 w-full rounded-xl border border-[#c8d3c6] bg-[var(--rakiza-surface)] px-3 pr-9 text-sm outline-none focus:border-[#5c9170]" /></label>
            <div className="mt-4 flex items-center justify-between px-1"><p className="text-sm font-black text-[#2c5541]">المحادثات</p><button type="button" onClick={() => setCreateOpen(true)} className="grid h-7 w-7 place-items-center rounded-lg bg-[#dce9da] text-[var(--rakiza-olive)]" aria-label="إنشاء محادثة"><Plus className="h-4 w-4" /></button></div>
            <div className="mt-2 max-h-[550px] space-y-1 overflow-y-auto">{filteredChats.map((item: any) => <button type="button" key={item.conversation.id} onClick={() => setConversationId(item.conversation.id)} className={`flex w-full items-center gap-2.5 rounded-xl p-2.5 text-right ${conversationId === item.conversation.id ? "bg-[#d9e9da]" : "hover:bg-[#e4ede2]"}`}><span className="grid h-10 w-10 place-items-center rounded-full bg-[#dcefe1] text-xs font-black text-[#1d6b45]">{item.conversation.conversationType === "direct" ? initials(item.displayName) : <UsersRound className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm text-[#254839]">{item.displayName}</b><small className="mt-1 block truncate text-xs text-[#718279]">{preview(item.lastMessage?.body)}</small></span>{item.unreadCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#138a4a] px-1 text-[10px] text-white">{item.unreadCount}</span>}</button>)}</div>
          </aside>

          <main className="flex min-h-[520px] flex-col bg-[#e8ebe3]">
            {conversation.data?.conversation ? <>
              <header className="border-b border-[#d3dbd0] bg-[var(--rakiza-surface)] px-5 py-3"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#deefe2] text-[#1a6844]">{["department", "custom", "general"].includes(conversation.data.conversation.conversationType) ? <UsersRound className="h-4 w-4" /> : initials(activeChat?.displayName)}</span><div className="min-w-0 flex-1"><h2 className="truncate text-base font-black text-[#254839]">{activeChat?.displayName || conversation.data.conversation.subject}</h2><p className="text-xs text-[#77897e]">{conversation.data.typingNames?.length ? `${conversation.data.typingNames.join("، ")} يكتب الآن…` : "محادثة داخلية"}</p></div><label className="relative w-48"><Search className="absolute right-2 top-2.5 h-3.5 w-3.5 text-[#648071]" /><input value={messageSearch} onChange={event => setMessageSearch(event.target.value)} placeholder="بحث في هذه المحادثة" className="h-9 w-full rounded-lg border border-[#c8d3c6] bg-[#f3f5ef] px-2 pr-7 text-xs" /></label></div>{conversation.data.pinnedMessage && <div className="mt-2 flex gap-2 rounded-xl bg-[#f5edd8] px-3 py-2 text-sm text-[#6f5925]"><Pin className="h-3.5 w-3.5" /><span className="flex-1"><b>{conversation.data.pinnedMessage.senderName}</b> · {preview(conversation.data.pinnedMessage.body)}</span>{canPin && <button type="button" onClick={() => pin.mutate({ conversationId: conversationId as number, messageId: null })}>إزالة</button>}</div>}{messageSearch.trim().length > 1 && <div className="mt-2 rounded-lg bg-[#eef3eb] p-2 text-sm">{search.isLoading ? "جارٍ البحث…" : search.data?.map((item: any) => <p key={item.message.id}><b>{item.senderName}: </b>{preview(item.message.body)} {item.attachmentNames && <span className="text-[var(--rakiza-gold)]">· <Paperclip className="inline h-3 w-3" />{item.attachmentNames}</span>}</p>)}</div>}</header>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5">{conversation.data.messages.map((item: any) => { const own = item.message.senderProfileId === me.data?.id; const reads = item.readByNames || []; return <article key={item.message.id} className={`flex ${own ? "justify-start" : "justify-end"}`}><div className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 ${own ? "rounded-tr-sm bg-[#dff1e3]" : "rounded-tl-sm border border-[#ccd7ca] bg-[var(--rakiza-surface)]"}`}><div className="flex items-center gap-2 text-xs"><b className="text-[#2d6b49]">{own ? "أنت" : item.senderName}</b><span className="text-[#829188]">{clock(item.message.createdAt)}</span><span className="mr-auto flex gap-1"><button type="button" onClick={() => setReply({ id: item.message.id, senderName: item.senderName, body: item.message.body })} aria-label="رد"><Reply className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setForward({ id: item.message.id, senderName: item.senderName, body: item.message.body })} aria-label="إعادة توجيه"><Forward className="h-3.5 w-3.5" /></button>{canPin && <button type="button" onClick={() => pin.mutate({ conversationId: conversationId as number, messageId: item.message.id })} aria-label="تثبيت"><Pin className="h-3.5 w-3.5" /></button>}</span></div>{item.repliedTo && <div className="mt-2 border-r-2 border-[#8eb99a] bg-[#eef5ec] px-2 py-1 text-xs"><b>{item.repliedTo.senderName}</b> {preview(item.repliedTo.body)}</div>}<p className="mt-1 whitespace-pre-wrap text-base leading-7">{item.message.body}</p>{parseFiles(item.attachments).map((file: any) => file.url && <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-[#276447]"><FileText className="ml-1 inline h-3.5 w-3.5" />{file.name}</a>)}<div className="mt-2 flex flex-wrap gap-1">{EMOJIS.map(symbol => { const present = (item.reactions || []).find((entry: any) => entry.reaction === symbol); return <button key={symbol} type="button" disabled={reaction.isPending} onClick={() => reaction.mutate({ conversationId: conversationId as number, messageId: item.message.id, reaction: symbol as "👍" })} className={`rounded-full border px-1.5 py-0.5 text-xs ${present?.reactedByMe ? "border-[var(--rakiza-olive-strong)] bg-[#e0f2e4]" : "border-[#ccd7ca] bg-[var(--rakiza-surface)]"}`}>{symbol}{present?.count ? ` ${present.count}` : ""}</button>; })}</div>{own && <p className="mt-1 flex items-center gap-1 text-[10px] text-[#688878]">{reads.length ? <CheckCheck className="h-3.5 w-3.5 text-[var(--rakiza-olive-strong)]" /> : <Check className="h-3.5 w-3.5" />}{reads.length ? "مقروء" : "تم الإرسال"}</p>}</div></article>; })}</div>
              <footer className="border-t border-[#d3dbd0] bg-[var(--rakiza-surface)] p-3"><div onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} className={`rounded-2xl border p-2 ${dragging ? "border-dashed border-[var(--rakiza-olive-strong)] bg-[#e8f5ea]" : "border-[#cbd6ca] bg-[#f1f3ed]"}`}>{reply && <div className="mb-2 flex justify-between rounded-lg bg-[#e4eee3] px-2 py-1 text-sm">رد على {reply.senderName}: {preview(reply.body)}<button type="button" onClick={() => setReply(null)}><X className="h-4 w-4" /></button></div>}<textarea value={body} onChange={event => setText(event.target.value)} placeholder="اكتب رسالة أو اسحب الملفات هنا…" rows={2} className="w-full resize-none bg-transparent p-1 text-base outline-none" /><div className="flex items-center justify-between"><label className="inline-flex cursor-pointer items-center gap-1 text-sm font-black text-[#496e5a]"><Paperclip className="h-4 w-4" />إرفاق<input type="file" multiple className="sr-only" onChange={event => void addAttachments(Array.from(event.target.files || []))} /></label><button type="button" onClick={submit} disabled={send.isPending || (!body.trim() && !attached.length)} className="rounded-xl bg-[var(--rakiza-olive)] px-3 py-2 text-sm font-black text-white"><Send className="ml-1 inline h-4 w-4" />إرسال</button></div>{attached.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{attached.map((file, index) => <span key={file.originalName + index} className="rounded-lg border border-[#cbd6ca] bg-[var(--rakiza-surface)] px-2 py-1 text-xs"><FileText className="ml-1 inline h-3.5 w-3.5" />{file.originalName}<button type="button" className="mr-2 text-red-600" onClick={() => setAttached(current => current.filter((_, i) => i !== index))}>×</button></span>)}</div>}</div></footer>
            </> : <div className="grid flex-1 place-items-center text-center"><div><MessageCircle className="mx-auto h-9 w-9 text-[#397055]" /><h2 className="mt-3 text-lg font-black text-[#284b3b]">اختر محادثة أو ابدأ واحدة جديدة</h2><p className="mt-2 text-sm text-[#718279]">تبدأ المحادثات الجديدة باختيار القسم ثم الموظف.</p><button type="button" onClick={() => setCreateOpen(true)} className="mt-4 rounded-xl bg-[var(--rakiza-olive)] px-4 py-2 text-sm font-bold text-white">محادثة جديدة</button></div></div>}
          </main>
        </div>

        <Dialog open={createOpen} onOpenChange={open => { if (!open) closeCreate(); else setCreateOpen(true); }}>
          <DialogContent dir="rtl" className="max-h-[90vh] max-w-3xl overflow-y-auto border-[#cbd6ca] bg-[#f4f6ef]">
            <DialogHeader><DialogTitle>بدء تواصل داخلي</DialogTitle><DialogDescription>اختر القسم أولاً، ثم حدّد الموظف لبدء محادثة فردية أو تكوين مجموعة.</DialogDescription></DialogHeader>
            <div className="flex gap-2 rounded-xl bg-[#e6ebe3] p-1"><button type="button" onClick={() => setCreateMode("direct")} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${createMode === "direct" ? "bg-[var(--rakiza-olive)] text-white" : "text-[#4d6256]"}`}><UserRound className="h-4 w-4" />دردشة فردية</button><button type="button" disabled={!canCreateGroup} onClick={() => setCreateMode("group")} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${createMode === "group" ? "bg-[var(--rakiza-olive)] text-white" : "text-[#4d6256]"} disabled:cursor-not-allowed disabled:opacity-45`}><UsersRound className="h-4 w-4" />مجموعة جديدة</button></div>
            {!canCreateGroup && <p className="text-xs leading-6 text-[var(--rakiza-gold)]">إنشاء المجموعة متاح لرئيس القسم وقادة المنصة فقط. الدردشة الفردية متاحة لك.</p>}
            {createMode === "group" && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-[var(--rakiza-ink)]">اسم المجموعة<input value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="مثال: فريق تسليم الأحكام" className="mt-1 h-11 w-full rounded-xl border border-[#c8d3c6] bg-[var(--rakiza-surface)] px-3 text-sm font-normal outline-none focus:border-[#5c9170]" /></label><label className="text-sm font-bold text-[var(--rakiza-ink)]">رسالة افتتاحية <span className="font-normal text-[var(--rakiza-muted)]">(اختيارية)</span><input value={groupGreeting} onChange={event => setGroupGreeting(event.target.value)} placeholder="اكتب رسالة افتتاحية" className="mt-1 h-11 w-full rounded-xl border border-[#c8d3c6] bg-[var(--rakiza-surface)] px-3 text-sm font-normal outline-none focus:border-[#5c9170]" /></label></div>}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><label className="text-sm font-bold text-[var(--rakiza-ink)]">1. اختر القسم<select value={directoryUnitId} onChange={event => { setDirectoryUnitId(event.target.value); setDirectorySearch(""); }} className="mt-1 h-11 w-full rounded-xl border border-[#c8d3c6] bg-[var(--rakiza-surface)] px-3 text-sm font-normal outline-none focus:border-[#5c9170]"><option value="">اختر القسم</option>{directoryUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label className="text-sm font-bold text-[var(--rakiza-ink)]">2. ابحث في موظفي القسم<div className="relative mt-1"><Search className="absolute right-3 top-3 h-4 w-4 text-[#648071]" /><input disabled={!directoryUnitId} value={directorySearch} onChange={event => setDirectorySearch(event.target.value)} placeholder={directoryUnitId ? "اكتب الاسم للترشيح" : "اختر القسم أولاً"} className="h-11 w-full rounded-xl border border-[#c8d3c6] bg-[var(--rakiza-surface)] px-3 pr-9 text-sm font-normal outline-none focus:border-[#5c9170] disabled:cursor-not-allowed disabled:bg-[#e6ebe3]" /></div></label></div>
            {createMode === "group" && directoryUnitId && people.length > 0 && <button type="button" onClick={() => setSelectedProfileIds(current => { const currentIds = people.map(person => person.profile.id); const selectedAll = currentIds.every(id => current.includes(id)); return selectedAll ? current.filter(id => !currentIds.includes(id)) : Array.from(new Set([...current, ...currentIds])); })} className="text-right text-sm font-bold text-[var(--rakiza-olive)]">{people.every(person => selectedProfileIds.includes(person.profile.id)) ? "إلغاء تحديد موظفي القسم" : "تحديد كل موظفي القسم"}</button>}
            <div className="max-h-72 divide-y divide-[#dbe2d8] overflow-y-auto rounded-xl border border-[#cbd6ca] bg-[var(--rakiza-surface)]">{!directoryUnitId ? <p className="p-5 text-center text-sm text-[var(--rakiza-muted)]">اختر قسماً لعرض الموظفين النشطين فيه.</p> : peopleSearch.isLoading ? <p className="p-5 text-center text-sm text-[var(--rakiza-muted)]">جارٍ جلب موظفي القسم…</p> : people.length ? people.map(person => { const selected = selectedProfileIds.includes(person.profile.id); return <div key={person.profile.id} className="flex items-center justify-between gap-3 p-3"><button type="button" onClick={() => createMode === "direct" ? startDirectChat(person.profile.id) : toggleProfile(person.profile.id)} className="flex min-w-0 flex-1 items-center gap-3 text-right"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-black ${selected ? "bg-[var(--rakiza-olive)] text-white" : "bg-[#dce9da] text-[var(--rakiza-olive)]"}`}>{selected ? <Check className="h-4 w-4" /> : initials(person.profile.fullName)}</span><span className="min-w-0"><b className="block truncate text-sm text-[#29483a]">{person.profile.fullName}</b><small className="mt-1 block truncate text-xs text-[var(--rakiza-muted)]">{person.profile.jobTitle || person.unitName || "موظف"}</small></span></button>{createMode === "direct" ? <button type="button" disabled={createConversation.isPending} onClick={() => startDirectChat(person.profile.id)} className="rounded-lg border border-[#b8d1bd] bg-[#eef5ec] px-2.5 py-1.5 text-xs font-bold text-[var(--rakiza-olive)]">بدء الدردشة</button> : <button type="button" onClick={() => toggleProfile(person.profile.id)} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${selected ? "bg-[#dce9da] text-[var(--rakiza-olive-strong)]" : "border border-[#c8d3c6] text-[#52675a]"}`}>{selected ? "محدد" : "إضافة"}</button>}</div>; }) : <p className="p-5 text-center text-sm text-[var(--rakiza-muted)]">لا يوجد موظفون نشطون مطابقون في هذا القسم.</p>}</div>
            {createMode === "group" && <p className="text-xs text-[#64736a]">الأعضاء المحددون: <b className="text-[var(--rakiza-olive-strong)]">{selectedProfileIds.length}</b>. يستطيع رئيس القسم جمع موظفي قسمه، بينما يستطيع القادة اختيار موظفين من أقسام متعددة.</p>}
            <DialogFooter><button type="button" onClick={closeCreate} className="rounded-lg border border-[#c6d4c7] px-4 py-2 text-sm font-bold text-[#31594d]">إلغاء</button>{createMode === "group" && <button type="button" disabled={createGroup.isPending || !selectedProfileIds.length || !groupName.trim()} onClick={createSelectedGroup} className="rounded-lg bg-[var(--rakiza-olive)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{createGroup.isPending ? "جارٍ الإنشاء…" : "إنشاء المجموعة"}</button>}</DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(forward)} onOpenChange={open => !open && setForward(null)}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إعادة توجيه رسالة</DialogTitle><DialogDescription>سيُنقل نص الرسالة إلى محادثة أنت عضو فيها، دون المرفقات.</DialogDescription></DialogHeader><select value={targetId} onChange={event => setTargetId(event.target.value)} className="h-10 w-full rounded-xl border border-[#c8d3c6] bg-[var(--rakiza-surface)] px-3"><option value="">اختر المحادثة</option>{(chats.data || []).filter((item: any) => item.conversation.id !== conversationId).map((item: any) => <option key={item.conversation.id} value={item.conversation.id}>{item.displayName}</option>)}</select><DialogFooter><button type="button" onClick={() => setForward(null)}>إلغاء</button><button type="button" disabled={!targetId || !forward} onClick={() => forward && forwardMessage.mutate({ sourceMessageId: forward.id, targetConversationId: Number(targetId) })} className="rounded-xl bg-[var(--rakiza-olive)] px-3 py-2 text-white">إعادة التوجيه</button></DialogFooter></DialogContent></Dialog>
      </section>
    </DashboardLayout>
  );
}
