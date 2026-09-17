import DashboardLayout from "@/components/DashboardLayout";
import MailAttachmentPreviewDialog, {
  type MailPreviewAttachment,
} from "@/components/MailAttachmentPreviewDialog";
import MailComposeWindow from "@/components/MailComposeWindow";
import MailMessageDetailPanel from "@/components/MailMessageDetailPanel";
import MailSettingsDialog from "@/components/MailSettingsDialog";
import MailScheduleButton from "@/components/MailScheduleButton";
import RichTextMailEditor from "@/components/RichTextMailEditor";
import { trpc } from "@/lib/trpc";
import {
  Archive,
  BookTemplate,
  CalendarDays,
  CirclePlus,
  Download,
  FileText,
  Inbox,
  MailOpen,
  Paperclip,
  PenLine,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Folder = "inbox" | "sent" | "drafts" | "starred" | "archive" | "trash";
type RecipientType = "to" | "cc" | "bcc";
type AttachmentDraft = {
  originalName: string;
  mimeType: string;
  contentBase64: string;
};
type ComposeState = {
  messageId?: number;
  parentMessageId?: number;
  subject: string;
  body: string;
  bodyHtml: string;
  importance: "normal" | "high";
  toProfileIds: number[];
  ccProfileIds: number[];
  bccProfileIds: number[];
  attachments: AttachmentDraft[];
};
const folders: Array<{
  id: Folder;
  label: string;
  icon: typeof Inbox;
  action?: "star" | "archive" | "restore" | "trash";
}> = [
  { id: "inbox", label: "البريد الوارد", icon: Inbox, action: "restore" },
  { id: "sent", label: "العناصر المرسلة", icon: Send },
  { id: "drafts", label: "المسودات", icon: FileText },
  { id: "starred", label: "المفضلة", icon: Star, action: "star" },
  { id: "archive", label: "الأرشيف", icon: Archive, action: "archive" },
  { id: "trash", label: "المحذوفات", icon: Trash2, action: "trash" },
];
const categories = ["عاجل", "متابعة", "معلومات", "سري"] as const;
const categoryColors: Record<string, string> = {
  عاجل: "bg-[#fff0ed] text-[#af4438]",
  متابعة: "bg-[#fff8db] text-[#8b6813]",
  معلومات: "bg-[#eaf4ff] text-[#26628d]",
  سري: "bg-[#f3edff] text-[#65428c]",
};
const emptyCompose = (): ComposeState => ({
  subject: "",
  body: "",
  bodyHtml: "",
  importance: "normal",
  toProfileIds: [],
  ccProfileIds: [],
  bccProfileIds: [],
  attachments: [],
});
const initials = (name?: string) =>
  (name || "ر")
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join("");
const formatDate = (value?: Date | string | null) =>
  value
    ? new Date(value).toLocaleString("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";
const escapeMailHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function readAttachments(files: FileList | null) {
  if (!files?.length) return [] as AttachmentDraft[];
  return Promise.all(
    Array.from(files)
      .slice(0, 5)
      .map(
        file =>
          new Promise<AttachmentDraft>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                originalName: file.name,
                mimeType: file.type || "application/octet-stream",
                contentBase64: String(reader.result).split(",")[1] || "",
              });
            reader.onerror = () => reject(new Error(`تعذر قراءة ${file.name}`));
            reader.readAsDataURL(file);
          })
      )
  );
}

export default function RakizaMailPage() {
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [folder, setFolder] = useState<Folder>("inbox");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [filters, setFilters] = useState({
    sender: "",
    subject: "",
    from: "",
    to: "",
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<
    "date" | "sender" | "subject" | "importance"
  >("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState<ComposeState>(emptyCompose);
  const [recipientMode, setRecipientMode] = useState<RecipientType>("to");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<Folder | null>(null);
  const [summary, setSummary] = useState("");
  const [preview, setPreview] = useState<MailPreviewAttachment | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [draftStatus, setDraftStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const lastFingerprint = useRef("");
  const suggestedIds = useRef(new Set<number>());
  const input = useMemo(
    () => ({
      folder,
      search: search.trim() || undefined,
      category: category || undefined,
      sender: filters.sender.trim() || undefined,
      subject: filters.subject.trim() || undefined,
      fromDate: filters.from ? new Date(`${filters.from}T00:00:00`) : undefined,
      toDate: filters.to ? new Date(`${filters.to}T23:59:59.999`) : undefined,
      sortBy,
      sortDir,
    }),
    [folder, search, category, filters, sortBy, sortDir]
  );
  const fingerprint = useMemo(
    () =>
      JSON.stringify({
        parent: compose.parentMessageId,
        subject: compose.subject,
        body: compose.body,
        html: compose.bodyHtml,
        importance: compose.importance,
        to: compose.toProfileIds,
        cc: compose.ccProfileIds,
        bcc: compose.bccProfileIds,
        files: compose.attachments.map(
          file => `${file.originalName}:${file.contentBase64.length}`
        ),
      }),
    [compose]
  );
  const counts = trpc.court.internalMail.folderCounts.useQuery();
  const list = trpc.court.internalMail.list.useQuery(input);
  const selected = trpc.court.internalMail.get.useQuery(
    { messageId: selectedId || 1 },
    { enabled: Boolean(selectedId) }
  );
  const people = trpc.court.communications.peopleSearch.useQuery(
    { query: recipientSearch || undefined },
    { enabled: composeOpen && recipientSearch.trim().length >= 2 }
  );
  const self = trpc.court.people.self.useQuery();
  const preferences = trpc.court.internalMail.preferences.useQuery();
  const refresh = async () => {
    await Promise.all([
      utils.court.internalMail.folderCounts.invalidate(),
      utils.court.internalMail.list.invalidate(),
      utils.court.internalMail.preferences.invalidate(),
      selectedId
        ? utils.court.internalMail.get.invalidate({ messageId: selectedId })
        : Promise.resolve(),
    ]);
  };
  const saveDraft = trpc.court.internalMail.saveDraft.useMutation({
    onSuccess: async result => {
      setCompose(value => ({ ...value, messageId: result.messageId }));
      setDraftStatus("saved");
      await refresh();
    },
    onError: error => {
      setDraftStatus("error");
      lastFingerprint.current = "";
      toast.error(error.message);
    },
  });
  const send = trpc.court.internalMail.send.useMutation({
    onSuccess: async () => {
      await refresh();
      setComposeOpen(false);
      setCompose(emptyCompose());
      setFolder("sent");
      toast.success("تم إرسال رسالة بريد ركيزة داخلياً.");
    },
    onError: error => toast.error(error.message),
  });
  const updateEntry = trpc.court.internalMail.updateEntry.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const summarize = trpc.court.internalMail.summarize.useMutation({
    onSuccess: result => {
      setSummary(result.summary);
      toast.success("تم إنشاء ملخص الرسالة.");
    },
    onError: error => toast.error(error.message),
  });
  const assistant = trpc.court.internalMail.assistant.useMutation({
    onSuccess: result => {
      setAiResult(result);
    },
    onError: error => toast.error(error.message),
  });
  const saveTemplate = trpc.court.internalMail.saveTemplate.useMutation({
    onSuccess: async () => {
      setTemplateName("");
      await refresh();
      toast.success("تم حفظ قالب البريد.");
    },
    onError: error => toast.error(error.message),
  });
  const [aiResult, setAiResult] = useState<{
    replies: string[];
    correctedText: string;
    notes: string[];
  } | null>(null);
  useEffect(() => {
    if (list.data?.length && !selectedId)
      setSelectedId(list.data[0].message.id);
  }, [list.data, selectedId]);
  useEffect(() => {
    setSelectedId(null);
  }, [folder, search, category]);
  useEffect(() => {
    setSummary("");
    setPreview(null);
    setAiResult(null);
  }, [selectedId]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("settings") === "mail")
      setSettingsOpen(true);
  }, []);
  useEffect(() => {
    if (
      new URLSearchParams(location.split("?")[1] || "").get("focus") !==
      "search"
    )
      return;
    const timer = window.setTimeout(
      () =>
        document
          .querySelector<HTMLInputElement>('input[placeholder="بحث في البريد"]')
          ?.focus(),
      50
    );
    return () => window.clearTimeout(timer);
  }, [location]);
  useEffect(() => {
    if (
      !selectedId ||
      suggestedIds.current.has(selectedId) ||
      !selected.data?.message?.body?.trim()
    )
      return;
    suggestedIds.current.add(selectedId);
    const timer = window.setTimeout(
      () => assistant.mutate({ messageId: selectedId, mode: "reply" }),
      500
    );
    return () => window.clearTimeout(timer);
  }, [selectedId, selected.data?.message?.body, assistant]);
  useEffect(() => {
    if (
      !composeOpen ||
      saveDraft.isPending ||
      (!compose.subject.trim() &&
        !compose.body.trim() &&
        !compose.attachments.length) ||
      lastFingerprint.current === fingerprint
    )
      return;
    const timer = window.setTimeout(() => {
      lastFingerprint.current = fingerprint;
      setDraftStatus("saving");
      saveDraft.mutate(compose);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [composeOpen, compose, fingerprint, saveDraft]);
  const toggleRecipient = (id: number) => {
    const key =
      recipientMode === "to"
        ? "toProfileIds"
        : recipientMode === "cc"
          ? "ccProfileIds"
          : "bccProfileIds";
    setCompose(value => ({
      ...value,
      [key]: value[key].includes(id)
        ? value[key].filter(item => item !== id)
        : [...value[key], id],
    }));
  };
  const recipients = [
    ...compose.toProfileIds,
    ...compose.ccProfileIds,
    ...compose.bccProfileIds,
  ];
  const signatureForCompose = () => {
    const text = preferences.data?.signature?.trim() || "";
    const imageUrl = preferences.data?.signatureImageUrl?.startsWith(
      "/manus-storage/internal-mail-signatures/"
    )
      ? preferences.data.signatureImageUrl
      : "";
    return {
      body: `${text ? `\n\n--\n${text}` : ""}${imageUrl ? "\n[صورة التوقيع]" : ""}`,
      bodyHtml:
        text || imageUrl
          ? `<p><br>--<br>${escapeMailHtml(text).replace(/\n/g, "<br>")}${imageUrl ? `<br><img src="${imageUrl}" alt="توقيع البريد" data-signature-image="true">` : ""}</p>`
          : "",
    };
  };
  const openCompose = (kind?: "reply" | "forward") => {
    const message: any = selected.data?.message;
    const signed = signatureForCompose();
    // إغلاق نافذة الإعدادات: نافذة الكتابة العائمة لا يجب أن تفتح داخل طبقة حوار مُعطِّلة للتفاعل.
    setSettingsOpen(false);
    if (kind && message)
      setCompose({
        ...emptyCompose(),
        ...signed,
        parentMessageId: message.id,
        subject: `${kind === "reply" ? "رد" : "إعادة توجيه"}: ${message.subject}`,
        toProfileIds:
          kind === "reply" && message.senderProfileId !== self.data?.id
            ? [message.senderProfileId]
            : [],
        body: `${signed.body}\n\n--- الرسالة الأصلية ---\n${message.body}`,
        bodyHtml: `${signed.bodyHtml}<blockquote>${message.bodyHtml || escapeMailHtml(message.body)}</blockquote>`,
      });
    else setCompose({ ...emptyCompose(), ...signed });
    setRecipientSearch("");
    setRecipientMode("to");
    setComposeOpen(true);
  };
  const useSuggestedReply = (reply: string) => {
    const signed = signatureForCompose();
    openCompose("reply");
    setCompose(current => ({
      ...current,
      body: `${reply}${signed.body}`,
      bodyHtml: `<p>${escapeMailHtml(reply).replace(/\n/g, "<br>")}</p>${signed.bodyHtml}`,
    }));
  };
  const persist = async (shouldSend: boolean) => {
    const result = await saveDraft.mutateAsync(compose);
    lastFingerprint.current = fingerprint;
    if (shouldSend) send.mutate({ messageId: result.messageId });
    else toast.success("تم حفظ المسودة في بريد ركيزة.");
  };
  const persistTemplate = () => {
    if (!compose.subject.trim()) {
      toast.error("اكتب موضوع الرسالة قبل حفظها قالباً.");
      return;
    }
    if (!compose.body.trim()) {
      toast.error("اكتب محتوى الرسالة قبل حفظها قالباً.");
      return;
    }
    saveTemplate.mutate({
      name: templateName.trim() || compose.subject.trim(),
      subject: compose.subject,
      body: compose.body,
      bodyHtml: compose.bodyHtml,
    });
  };
  const attachFiles = async (files: FileList | null) => {
    try {
      const attachments = await readAttachments(files);
      setCompose(value => ({
        ...value,
        attachments: [...value.attachments, ...attachments].slice(0, 5),
      }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر قراءة المرفق."
      );
    }
  };
  const moveMessage = (
    target: Folder,
    action?: "star" | "archive" | "restore" | "trash"
  ) => {
    if (!draggingId || !action) return;
    updateEntry.mutate({ messageId: draggingId, action });
    setDraggingId(null);
    setDropTarget(null);
    toast.success(
      `تم نقل الرسالة إلى «${folders.find(item => item.id === target)?.label}».`
    );
  };
  const detail: any = selected.data;
  return (
    <DashboardLayout>
      <section
        dir="rtl"
        className="mx-auto w-full max-w-none min-h-[calc(100vh-8rem)]"
      >
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.14em] text-[#b18448]">
              مراسلات داخلية آمنة
            </p>
            <h1 className="mt-1 text-3xl font-black text-[#12352f]">
              بريد ركيزة
            </h1>
            <p className="mt-1 text-sm text-[#6d7f75]">
              صندوق بريد داخلي موحد للرسائل والردود والمرفقات وتنظيم المتابعة.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setLocation("/data-exports")}
              className="inline-flex items-center gap-2 rounded-xl border border-[#d9e4d8] bg-white px-3 py-2.5 text-xs font-black text-[#315c4a]"
            >
              <Download className="h-4 w-4" />
              تصدير البيانات
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#d9e4d8] bg-white px-3 py-2.5 text-xs font-black text-[#315c4a]"
            >
              <SlidersHorizontal className="h-4 w-4" />
              إعدادات البريد
            </button>
            <button
              type="button"
              onClick={() => setLocation("/meetings")}
              className="inline-flex items-center gap-2 rounded-xl border border-[#d9e4d8] bg-white px-3 py-2.5 text-xs font-black text-[#315c4a]"
            >
              <CalendarDays className="h-4 w-4" />
              التقويم والاجتماعات
            </button>
            <button
              type="button"
              onClick={() => openCompose()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0e6a40] px-4 py-2.5 text-sm font-black text-white"
            >
              <PenLine className="h-4 w-4" />
              رسالة جديدة
            </button>
          </div>
        </header>
        <div className="min-h-[calc(100vh-14rem)] overflow-hidden rounded-[1.75rem] border border-[#e1e6dc] bg-white shadow-[0_18px_48px_rgba(30,61,48,0.08)] lg:grid lg:grid-cols-[17rem_22rem_minmax(0,1fr)]">
          <aside className="border-b border-[#e6ece5] bg-[#f8fbf8] p-3 lg:border-b-0 lg:border-l">
            <button
              type="button"
              onClick={() => openCompose()}
              className="mb-4 hidden w-full items-center justify-center gap-2 rounded-xl bg-[#e0f1e3] px-3 py-3 text-xs font-black text-[#17623d] lg:flex"
            >
              <CirclePlus className="h-4 w-4" />
              إنشاء رسالة
            </button>
            <div className="mb-4">
              <div className="flex gap-2">
                <label className="relative block flex-1">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-[#75877d]" />
                  <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="بحث في البريد"
                    className="h-10 w-full rounded-xl border border-[#dce6dc] bg-[#fbfdfb] py-2 pl-3 pr-9 text-xs"
                  />
                </label>
                <button
                  type="button"
                  aria-label="البحث المتقدم"
                  onClick={() => setAdvancedOpen(value => !value)}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce6dc] text-[#547064]"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </div>
              {advancedOpen && (
                <div className="mt-2 grid gap-2 rounded-xl bg-[#f5f9f5] p-2">
                  <input
                    aria-label="تصفية حسب المرسل"
                    value={filters.sender}
                    onChange={event =>
                      setFilters(value => ({
                        ...value,
                        sender: event.target.value,
                      }))
                    }
                    placeholder="المرسل"
                    className="rounded-lg border border-[#dce6dc] bg-white px-2.5 py-2 text-xs"
                  />
                  <input
                    aria-label="تصفية حسب الموضوع"
                    value={filters.subject}
                    onChange={event =>
                      setFilters(value => ({
                        ...value,
                        subject: event.target.value,
                      }))
                    }
                    placeholder="الموضوع"
                    className="rounded-lg border border-[#dce6dc] bg-white px-2.5 py-2 text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      aria-label="تاريخ البداية"
                      type="date"
                      value={filters.from}
                      onChange={event =>
                        setFilters(value => ({
                          ...value,
                          from: event.target.value,
                        }))
                      }
                      className="rounded-lg border border-[#dce6dc] bg-white px-2 py-1.5 text-xs"
                    />
                    <input
                      aria-label="تاريخ النهاية"
                      type="date"
                      value={filters.to}
                      onChange={event =>
                        setFilters(value => ({
                          ...value,
                          to: event.target.value,
                        }))
                      }
                      className="rounded-lg border border-[#dce6dc] bg-white px-2 py-1.5 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
            <nav
              className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-6 lg:block lg:space-y-1"
              aria-label="صناديق بريد ركيزة"
            >
              {folders.map(item => {
                const Icon = item.icon;
                const active = folder === item.id;
                const count = (counts.data?.counts as any)?.[item.id] ?? 0;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setFolder(item.id);
                      setCategory("");
                    }}
                    onDragOver={event => {
                      if (item.action) {
                        event.preventDefault();
                        setDropTarget(item.id);
                      }
                    }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={event => {
                      event.preventDefault();
                      moveMessage(item.id, item.action);
                    }}
                    className={`flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-right text-xs font-bold ${active ? "bg-[#dcefe0] text-[#145b39]" : "text-[#5d7167] hover:bg-[#edf5ee]"} ${dropTarget === item.id ? "ring-2 ring-[#46a66f] ring-offset-1" : ""}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.id === "inbox" &&
                    Number(counts.data?.unread ?? 0) > 0 ? (
                      <span className="mr-auto rounded-full bg-[#c14136] px-1.5 py-0.5 text-[10px] text-white">
                        {counts.data?.unread}
                      </span>
                    ) : count > 0 ? (
                      <span className="mr-auto text-[10px] text-[#72857a]">
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
            <div className="mt-4 border-t border-[#e3ebe3] pt-4">
              <p className="px-2 text-[10px] font-black tracking-[0.1em] text-[#809187]">
                علامات ملونة
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 px-2">
                {categories.map(item => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setCategory(category === item ? "" : item)}
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${category === item ? categoryColors[item] : "bg-white text-[#547064] ring-1 ring-[#dbe7dc]"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </aside>
          <section className="border-b border-[#e6ece5] lg:border-b-0 lg:border-l">
            <div className="border-b border-[#e8eee8] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black text-[#315c4a]">
                  قائمة الرسائل
                </p>
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="فرز الرسائل"
                    value={sortBy}
                    onChange={event =>
                      setSortBy(event.target.value as typeof sortBy)
                    }
                    className="h-8 rounded-lg border border-[#dce6dc] bg-white px-2 text-[11px] font-bold text-[#315c4a]"
                  >
                    <option value="date">الأحدث أولاً</option>
                    <option value="sender">حسب المرسل</option>
                    <option value="subject">حسب الموضوع</option>
                    <option value="importance">حسب الأهمية</option>
                  </select>
                  <button
                    type="button"
                    aria-label="اتجاه الفرز"
                    title="اتجاه الفرز"
                    onClick={() =>
                      setSortDir(value => (value === "desc" ? "asc" : "desc"))
                    }
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[#dce6dc] bg-white text-[#547064]"
                  >
                    {sortDir === "desc" ? "↓" : "↑"}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-[10px] text-[#718279]">
                استخدم البحث من القائمة اليمنى
              </p>
            </div>
            <div className="max-h-[475px] overflow-y-auto lg:max-h-[610px]">
              {list.isLoading ? (
                <p className="p-5 text-center text-xs text-[#788980]">
                  جارٍ تحميل البريد…
                </p>
              ) : list.error ? (
                <p className="p-8 text-center text-xs font-bold text-[#52675b]">
                  يتطلب بريد ركيزة ملف موظف أو حساب قسم مرتبطاً.
                </p>
              ) : list.data?.length ? (
                list.data.map((row: any) => {
                  const isUnread = !row.entry?.isRead;
                  return (
                    <div
                      key={row.message.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${row.senderName}: ${row.message.subject}${isUnread ? " — غير مقروءة" : ""}`}
                      draggable
                      onDragStart={() => setDraggingId(row.message.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => setSelectedId(row.message.id)}
                      onKeyDown={event => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(row.message.id);
                        }
                      }}
                      className={`group relative w-full cursor-pointer border-b border-[#edf1ec] p-3 text-right transition ${selectedId === row.message.id ? "bg-[#edf7ee] ring-1 ring-inset ring-[#b9d9bf]" : isUnread ? "bg-[#fbfdf9] hover:bg-[#f2f8f1]" : "hover:bg-[#fafcf9]"}`}
                    >
                      {isUnread ? (
                        <span
                          aria-hidden="true"
                          data-testid={`mail-unread-dot-${row.message.id}`}
                          className="absolute right-1.5 top-4 h-2 w-2 rounded-full bg-[#0e6a40]"
                        />
                      ) : null}
                      <div className="flex items-start gap-2">
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-black ${isUnread ? "bg-[#dcefe1] text-[#14603c] ring-1 ring-[#a9d3b5]" : "bg-[#e7f0e8] text-[#27704d]"}`}
                        >
                          {initials(row.senderName)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1">
                            <span
                              className={`truncate text-xs ${isUnread ? "font-black text-[#0f3428]" : "font-bold text-[#365548]"}`}
                            >
                              {row.senderName}
                            </span>
                            {row.message.importance === "high" && (
                              <span className="shrink-0 rounded-full bg-[#fff0ed] px-1.5 py-0.5 text-[9px] font-black text-[#ae4438]">
                                عاجل
                              </span>
                            )}
                            {row.entry.category && (
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${categoryColors[row.entry.category] || "bg-[#f2f5f2] text-[#5a6f62]"}`}
                              >
                                {row.entry.category}
                              </span>
                            )}
                            <span className="mr-auto shrink-0 text-[9px] tabular-nums text-[#829289]">
                              {formatDate(
                                row.message.sentAt || row.message.updatedAt
                              )}
                            </span>
                          </span>
                          <span
                            className={`mt-1 block truncate text-xs ${isUnread ? "font-black text-[#12352f]" : "font-bold text-[#446155]"}`}
                          >
                            {row.message.subject}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-5 text-[#7b8c83]">
                            {row.message.body || "لا يوجد نص"}
                          </span>
                          {Number(row.attachmentCount) > 0 && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#f2f6f1] px-2 py-0.5 text-[9px] font-bold text-[#5d7267]">
                              <Paperclip
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                              {Number(row.attachmentCount)} مرفق
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="absolute bottom-2 left-2 hidden items-center gap-1 group-hover:flex group-focus-within:flex">
                        <button
                          type="button"
                          title="إضافة إلى المفضلة"
                          aria-label={`إضافة رسالة ${row.message.subject} إلى المفضلة`}
                          onClick={event => {
                            event.stopPropagation();
                            updateEntry.mutate({
                              messageId: row.message.id,
                              action: "star",
                            });
                          }}
                          className="grid h-6 w-6 place-items-center rounded-md bg-white text-[#426457] shadow ring-1 ring-[#dbe7dc] hover:bg-[#eaf3ea]"
                        >
                          <Star className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          title="أرشفة"
                          aria-label={`أرشفة رسالة ${row.message.subject}`}
                          onClick={event => {
                            event.stopPropagation();
                            updateEntry.mutate({
                              messageId: row.message.id,
                              action: "archive",
                            });
                          }}
                          className="grid h-6 w-6 place-items-center rounded-md bg-white text-[#426457] shadow ring-1 ring-[#dbe7dc] hover:bg-[#eaf3ea]"
                        >
                          <Archive className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          title="حذف"
                          aria-label={`حذف رسالة ${row.message.subject}`}
                          onClick={event => {
                            event.stopPropagation();
                            updateEntry.mutate({
                              messageId: row.message.id,
                              action: "trash",
                            });
                          }}
                          className="grid h-6 w-6 place-items-center rounded-md bg-white text-[#a8493b] shadow ring-1 ring-[#f0d3cc] hover:bg-[#fdeeeb]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center">
                  <MailOpen className="mx-auto h-8 w-8 text-[#b5c5b9]" />
                  <p className="mt-3 text-xs text-[#718279]">
                    لا توجد رسائل في هذا الصندوق.
                  </p>
                </div>
              )}
            </div>
          </section>
          <section>
            {selected.isLoading ? (
              <p className="p-8 text-sm text-[#718279]">جارٍ فتح الرسالة…</p>
            ) : (
              <>
                <MailMessageDetailPanel
                  detail={detail}
                  summary={summary}
                  isSummarizing={summarize.isPending}
                  onSummarize={() =>
                    selectedId && summarize.mutate({ messageId: selectedId })
                  }
                  onReply={() => openCompose("reply")}
                  onForward={() => openCompose("forward")}
                  onArchive={() =>
                    selectedId &&
                    updateEntry.mutate({
                      messageId: selectedId,
                      action: "archive",
                    })
                  }
                  onTrash={() =>
                    selectedId &&
                    updateEntry.mutate({
                      messageId: selectedId,
                      action: "trash",
                    })
                  }
                  onCategory={value =>
                    selectedId &&
                    updateEntry.mutate({
                      messageId: selectedId,
                      action: "category",
                      category: value || null,
                    })
                  }
                  onPreview={setPreview}
                />
                {detail?.message?.body && (
                  <div className="m-4 rounded-xl border border-[#d7e8d9] bg-[#f6fbf6] p-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#247348]" />
                      <p className="text-xs font-black text-[#285940]">
                        مساعد ركيزة للرد والتحرير
                      </p>
                      {assistant.isPending && (
                        <span className="text-[10px] text-[#6a8071]">
                          يُحضّر اقتراحات…
                        </span>
                      )}
                    </div>
                    {aiResult?.replies.length ? (
                      <div className="mt-2 grid gap-2">
                        {aiResult.replies.map((reply, index) => (
                          <button
                            type="button"
                            key={index}
                            onClick={() => useSuggestedReply(reply)}
                            className="rounded-lg border border-[#d8e8da] bg-white p-2 text-right text-xs leading-6 text-[#365848] hover:bg-[#edf7ee]"
                          >
                            {reply}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          selectedId &&
                          assistant.mutate({
                            messageId: selectedId,
                            mode: "reply",
                          })
                        }
                        className="rounded-lg border border-[#d4e1d5] px-2.5 py-1.5 text-[10px] font-black text-[#315f49]"
                      >
                        تحديث الردود
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          selectedId &&
                          assistant.mutate({
                            messageId: selectedId,
                            mode: "proofread",
                          })
                        }
                        className="rounded-lg border border-[#d4e1d5] px-2.5 py-1.5 text-[10px] font-black text-[#315f49]"
                      >
                        مراجعة لغوية
                      </button>
                    </div>
                    {aiResult?.correctedText ? (
                      <div className="mt-2 rounded-lg bg-white p-2 text-xs leading-6 text-[#365848]">
                        {aiResult.correctedText}
                        {aiResult.notes.length ? (
                          <p className="mt-1 text-[10px] text-[#708278]">
                            {aiResult.notes.join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
        <MailComposeWindow
          open={composeOpen}
          onOpenChange={open => {
            if (!open) {
              setComposeOpen(false);
              setCompose(emptyCompose());
              setDraftStatus("idle");
            }
          }}
          title={compose.messageId ? "تحرير مسودة" : "رسالة بريد ركيزة جديدة"}
          subtitle="الرسائل تُرسل داخل المنصة للمستخدمين المصرح لهم فقط."
          onSend={() => persist(true)}
          onSaveDraft={() => persist(false)}
          onSaveTemplate={persistTemplate}
          isSending={send.isPending || saveDraft.isPending}
          isSaving={saveDraft.isPending}
          canSend={
            compose.toProfileIds.length > 0 && Boolean(compose.subject.trim())
          }
          sendHint="أضف مستلماً وموضوعاً قبل الإرسال"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 rounded-xl bg-[#f7faf7] p-2">
              <BookTemplate className="mt-1 h-4 w-4 text-[#547064]" />
              <select
                aria-label="اختيار قالب رسالة"
                defaultValue=""
                onChange={event => {
                  const template = preferences.data?.templates?.find(
                    (item: any) => String(item.id) === event.target.value
                  );
                  if (template)
                    setCompose(value => ({
                      ...value,
                      subject: template.subject,
                      body: template.body,
                      bodyHtml:
                        template.bodyHtml ||
                        `<p>${template.body.replace(/\n/g, "<br>")}</p>`,
                    }));
                }}
                className="min-w-48 flex-1 rounded-lg border border-[#d9e5da] bg-white px-2 py-2 text-xs"
              >
                <option value="">استخدام قالب جاهز…</option>
                {preferences.data?.templates?.map((template: any) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <input
                aria-label="اسم القالب"
                value={templateName}
                onChange={event => setTemplateName(event.target.value)}
                placeholder="اسم لحفظ الرسالة قالباً"
                className="min-w-44 flex-1 rounded-lg border border-[#d9e5da] px-2 py-2 text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-[#476358]">إلى</span>
              <input
                value={recipientSearch}
                onChange={event => setRecipientSearch(event.target.value)}
                placeholder="ابحث بالاسم أو البريد"
                className="min-w-[12rem] flex-1 rounded-lg border border-[#d9e5da] px-3 py-2 text-xs"
              />
              <select
                value={recipientMode}
                onChange={event =>
                  setRecipientMode(event.target.value as RecipientType)
                }
                className="rounded-lg border border-[#d9e5da] bg-white px-2 py-2 text-xs"
              >
                <option value="to">إلى</option>
                <option value="cc">نسخة</option>
                <option value="bcc">نسخة مخفية</option>
              </select>
            </div>
            {recipientSearch.trim().length >= 2 && (
              <div className="max-h-36 overflow-y-auto rounded-xl border border-[#e0e9e1] bg-[#fbfdfb] p-1">
                {people.data?.map((item: any) => (
                  <button
                    type="button"
                    key={item.profile.id}
                    onClick={() => toggleRecipient(item.profile.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs hover:bg-[#eef6ef]"
                  >
                    <UsersRound className="h-3.5 w-3.5" />
                    {item.profile.fullName}
                    <span className="mr-auto text-[10px] text-[#7b8c83]">
                      {item.unitName || ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {recipients.map(id => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    setCompose(value => ({
                      ...value,
                      toProfileIds: value.toProfileIds.filter(
                        item => item !== id
                      ),
                      ccProfileIds: value.ccProfileIds.filter(
                        item => item !== id
                      ),
                      bccProfileIds: value.bccProfileIds.filter(
                        item => item !== id
                      ),
                    }))
                  }
                  className="rounded-full bg-[#e2f0e4] px-2 py-1 text-[10px] font-bold text-[#246444]"
                >
                  مستلم {id} <X className="inline h-3 w-3" />
                </button>
              ))}
            </div>
            <input
              value={compose.subject}
              onChange={event =>
                setCompose(value => ({
                  ...value,
                  subject: event.target.value,
                }))
              }
              placeholder="الموضوع"
              className="w-full rounded-xl border border-[#d9e5da] px-3 py-2.5 text-sm font-bold"
            />
            <RichTextMailEditor
              value={compose.bodyHtml}
              onChange={(bodyHtml, body) =>
                setCompose(value => ({ ...value, bodyHtml, body }))
              }
              onFilesDropped={attachFiles}
              disabled={saveDraft.isPending || send.isPending}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#d7e4d8] px-3 py-2 text-xs font-black text-[#315f49]">
                <Paperclip className="h-3.5 w-3.5" />
                مرفق
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={event => attachFiles(event.target.files)}
                />
              </label>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#60766a]">
                <Save className="h-3.5 w-3.5" />
                {draftStatus === "saving"
                  ? "جارٍ الحفظ التلقائي…"
                  : draftStatus === "saved"
                    ? "تم الحفظ تلقائياً"
                    : draftStatus === "error"
                      ? "تعذر الحفظ التلقائي"
                      : "سيُحفظ تلقائياً أثناء الكتابة"}
              </span>
            </div>
            {compose.attachments.length ? (
              <div className="flex flex-wrap gap-1">
                {compose.attachments.map((file, index) => (
                  <button
                    type="button"
                    key={`${file.originalName}-${index}`}
                    onClick={() =>
                      setCompose(value => ({
                        ...value,
                        attachments: value.attachments.filter(
                          (_, item) => item !== index
                        ),
                      }))
                    }
                    className="rounded-full bg-[#edf4ed] px-2 py-1 text-[10px] font-bold text-[#3d6952]"
                  >
                    {file.originalName} ×
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f7faf7] p-2">
            {compose.messageId ? (
              <MailScheduleButton
                messageId={compose.messageId}
                status="draft"
                onScheduled={() => {
                  setComposeOpen(false);
                  setCompose(emptyCompose());
                  setFolder("sent");
                  refresh();
                }}
              />
            ) : (
              <span className="text-[10px] font-bold text-[#72857a]">
                احفظ المسودة لإتاحة جدولة تاريخ ووقت الإرسال
              </span>
            )}
          </div>
        </MailComposeWindow>
        {preview ? (
          <MailAttachmentPreviewDialog
            attachment={preview}
            onClose={() => setPreview(null)}
          />
        ) : null}
        <MailSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      </section>
    </DashboardLayout>
  );
}
