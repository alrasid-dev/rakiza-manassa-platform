import { useEffect, useMemo, useState } from "react";
import { Ban, Bot, Clipboard, GitBranch, ShieldCheck, Sparkles, Zap } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { IS_PREVIEW_MODE } from "@/const";
import { fallbackAssistants } from "./assistant-catalog";

type AssistantKey = "department" | "leadership" | "trainee_affairs" | "judicial_affairs" | "performance_monitoring" | "technical_support";
type CatalogAssistant = { key: AssistantKey; label: string; description: string; canManageAutomation?: boolean };

async function copyOutput(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    return label;
  } catch {
    return "تعذر النسخ؛ حدّد النص وانسخه يدوياً.";
  }
}

export function AssistantsPage() {
  const catalog = trpc.court.assistants.catalog.useQuery(undefined, { enabled: !IS_PREVIEW_MODE });
  const chat = trpc.court.assistants.chat.useMutation();
  const prediction = trpc.court.assistants.predict.useMutation();
  const recordDecision = trpc.court.assistants.recordManagerDecision.useMutation();
  const revokeAutomation = trpc.court.assistants.revokeAutomation.useMutation();
  const autoApprovalPrefs = trpc.court.settings.getAutoApproval.useQuery();
  const setAutoApproval = trpc.court.settings.setAutoApproval.useMutation();
  const [automationChoiceNotice, setAutomationChoiceNotice] = useState("");
  const [decisionMode, setDecisionMode] = useState<"disabled" | "partial" | "full">("disabled");
  useEffect(() => {
    if (autoApprovalPrefs.data?.mode) {
      setDecisionMode(autoApprovalPrefs.data.mode === "half" ? "partial" : autoApprovalPrefs.data.mode === "full" ? "full" : "disabled");
    }
  }, [autoApprovalPrefs.data?.mode]);
  const [taskSnapshot, setTaskSnapshot] = useState("");
  const [predictionResult, setPredictionResult] = useState<Awaited<ReturnType<typeof prediction.mutateAsync>> | null>(null);
  const [copyNotice, setCopyNotice] = useState("");
  const available = (catalog.data?.length ? catalog.data : fallbackAssistants) as CatalogAssistant[];
  const [selectedKey, setSelectedKey] = useState<AssistantKey>((available[0]?.key as AssistantKey) || "department");
  const [messages, setMessages] = useState<Message[]>([]);
  const selected = useMemo(() => available.find(item => item.key === selectedKey) ?? available[0], [available, selectedKey]);
  const canManageAutomation = selected?.canManageAutomation === true;

  if (!catalog.isLoading && !available.length) return <DashboardLayout><section className="mx-auto max-w-3xl rounded-[1.5rem] border border-[#e7e0d4] bg-white p-8 text-center"><h1 className="text-2xl font-bold text-[#12352f]">لا يوجد مساعد مخصص لقسمك حالياً</h1><p className="mt-3 text-sm leading-7 text-[#65766d]">سيظهر مساعد القسم بعد ربط الحساب بوحدة تنظيمية مناسبة. يمكنك استخدام المهام والمراسلات والدعم التقني من القائمة اليومية.</p></section></DashboardLayout>;

  const sendMessage = (content: string) => {
    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    chat.mutate({ assistant: selectedKey, message: content, pageContext: `صفحة المساعدين: ${selected?.label ?? "مساعد القسم"}` }, {
      onSuccess: result => setMessages(current => [...current, { role: "assistant", content: result.answer }]),
      onError: error => setMessages(current => [...current, { role: "assistant", content: `تعذر تشغيل المساعد: ${error.message}` }]),
    });
  };

  const chooseAutomation = (mode: "full" | "partial" | "disabled") => {
    setDecisionMode(mode);
    const autoMode = mode === "disabled" ? "off" : mode === "partial" ? "half" : "full";
    const modeLabel = mode === "disabled" ? "بدون آلي" : mode === "partial" ? "نصف آلي" : "آلي — بموافقة المسؤول";
    setAutoApproval.mutate({ mode: autoMode, scope: ["tasks", "requests", "disciplinary", "leaves"] }, { onSuccess: () => setAutomationChoiceNotice(`تم حفظ وضع المعالجة «${modeLabel}» بنجاح.`), onError: error => setAutomationChoiceNotice(`تعذر حفظ الاختيار: ${error.message}`) });
    recordDecision.mutate({ assistant: selectedKey, decisionType: mode === "disabled" ? "recommendation_reject" : "recommendation_accept", decision: mode === "disabled" ? "rejected" : "accepted", contextLabel: `اختيار وضع المعالجة: ${mode}`, automationMode: mode, rationale: "اختيار صريح من المدير؛ لا ينفذ هذا الزر أي مهمة تلقائياً." });
  };

  const revokeCurrentAutomation = () => {
    revokeAutomation.mutate({ assistant: selectedKey, decisionType: "priority", contextLabel: `إلغاء فوري للموافقة الآلية: ${selected?.label ?? selectedKey}`, rationale: "إيقاف فوري بناءً على قرار المدير" }, { onSuccess: () => setAutomationChoiceNotice("تم إلغاء الموافقة الآلية فوراً، وسُجل الإجراء ونُبّه المسؤول."), onError: error => setAutomationChoiceNotice(`تعذر إلغاء الموافقة الآلية: ${error.message}`) });
  };

  const selectAssistant = (key: AssistantKey) => {
    setSelectedKey(key);
    setMessages([]);
  };

  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-6">
        <section className="rounded-[2rem] bg-[#12352f] p-6 text-white shadow-[0_20px_50px_rgba(18,53,47,0.18)] sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="mb-4 flex items-center gap-3 text-[#f0cc76]"><Bot className="h-6 w-6" /><span className="text-xs font-bold tracking-[0.16em]">مساعدو رَكيزة</span></div>
              <h1 className="text-2xl font-bold sm:text-3xl">مساعد متخصص لكل قسم</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#d9e5dd]">يساعدك المساعد على فهم العمل واقتراح الخطوات المناسبة، مع إبقاء الاعتماد النهائي بيد المسؤول المختص وعدم تنفيذ أي إجراء تلقائياً.</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-xs text-[#e6efe8]"><ShieldCheck className="h-4 w-4 text-[#f0cc76]" /> نطاق القسم والصلاحية مطبقان</div>
          </div>
        </section>

        {canManageAutomation && <section aria-labelledby="decision-mode-title" className="rounded-[1.5rem] border border-[#dfe8df] bg-white p-5 shadow-[0_10px_30px_rgba(35,55,47,0.05)]"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eaf4ec] text-[#12683e]"><GitBranch className="h-5 w-5" /></div><div><h2 id="decision-mode-title" className="text-lg font-bold text-[#12352f]">وضع اتخاذ القرار</h2><p className="mt-1 text-xs leading-6 text-[#6d7d74]">حدد مستوى المساعدة للمساعد «{selected?.label ?? "المحدد"}». الاختيار يسجل تفضيل المسؤول ولا يعتمد قراراً حساساً تلقائياً.</p></div></div><span role="status" className={`rounded-full px-3 py-1.5 text-xs font-bold ${decisionMode === "disabled" ? "bg-[#f1f2ef] text-[#667168]" : decisionMode === "partial" ? "bg-[#fff4d8] text-[#806329]" : "bg-[#e5f5e8] text-[#176b3a]"}`}>{decisionMode === "disabled" ? "بدون آلي" : decisionMode === "partial" ? "نصف آلي" : "آلي — بموافقة المسؤول"}</span></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><button type="button" aria-pressed={decisionMode === "disabled"} onClick={() => chooseAutomation("disabled")} disabled={recordDecision.isPending} className={`flex items-center gap-3 rounded-xl border p-3 text-right min-h-[44px] min-w-[44px] ${decisionMode === "disabled" ? "border-[#7c8c82] bg-[#f4f6f3]" : "border-[#e8ece8] bg-white hover:bg-[#fafcf9]"}`}><Ban className="h-5 w-5 shrink-0 text-[#667168]" /><span><strong className="block text-sm text-[#294239]">بدون آلي</strong><small className="mt-1 block text-[11px] leading-5 text-[#788980]">اقتراحات فقط، ولا معالجة آلية.</small></span></button><button type="button" aria-pressed={decisionMode === "partial"} onClick={() => chooseAutomation("partial")} disabled={recordDecision.isPending} className={`flex items-center gap-3 rounded-xl border p-3 text-right min-h-[44px] min-w-[44px] ${decisionMode === "partial" ? "border-[#c79b43] bg-[#fff9e9]" : "border-[#e8ece8] bg-white hover:bg-[#fafcf9]"}`}><GitBranch className="h-5 w-5 shrink-0 text-[#9c762e]" /><span><strong className="block text-sm text-[#294239]">نصف آلي</strong><small className="mt-1 block text-[11px] leading-5 text-[#788980]">اقتراح وتجهيز، مع تأكيد بشري.</small></span></button><button type="button" aria-pressed={decisionMode === "full"} onClick={() => chooseAutomation("full")} disabled={recordDecision.isPending} className={`flex items-center gap-3 rounded-xl border p-3 text-right min-h-[44px] min-w-[44px] ${decisionMode === "full" ? "border-[#23814c] bg-[#edf8ef]" : "border-[#e8ece8] bg-white hover:bg-[#fafcf9]"}`}><Zap className="h-5 w-5 shrink-0 text-[#08733d]" /><span><strong className="block text-sm text-[#294239]">آلي</strong><small className="mt-1 block text-[11px] leading-5 text-[#788980]">مسموح مبدئياً فقط ضمن السياسة وباعتماد المسؤول.</small></span></button></div>{automationChoiceNotice && <p className="mt-3 text-xs font-semibold text-[#365a49]" aria-live="polite">{automationChoiceNotice}</p>}</section>}

        <section className="rounded-[1.5rem] border border-[#eadfc9] bg-[#fffaf0] p-5 shadow-[0_10px_30px_rgba(35,55,47,0.05)]">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-[#12352f]">رؤى المدير والتنبؤات</h2><p className="mt-1 text-xs leading-6 text-[#6d5b3b]">أدخل ملخصاً مصرحاً للمهام ليقترح المساعد توقعات وخيارات مرتبة. هذه الميزة للمديرين فقط ولا تعتمد القرارات الحساسة آلياً.</p></div><Sparkles className="h-5 w-5 text-[#b4935a]" /></div>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <textarea value={taskSnapshot} onChange={event => setTaskSnapshot(event.target.value)} className="min-h-24 rounded-xl border border-[#e4d8c0] bg-white p-3 text-sm text-[#243b32] outline-none focus:border-[#006c35]" placeholder="مثال: ثلاث مهام متعثرة، اثنتان تجاوزتا المهلة، وموعد استحقاق مهمة خلال يومين..." />
            <button type="button" disabled={prediction.isPending || taskSnapshot.trim().length < 2} onClick={() => prediction.mutate({ assistant: selectedKey, taskSnapshot, actionType: "priority" }, { onSuccess: setPredictionResult })} className="rounded-xl bg-[#006c35] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{prediction.isPending ? "جارٍ التحليل..." : "حلّل وتنبأ"}</button>
          </div>
          {prediction.error && <p className="mt-3 text-xs font-semibold text-red-700">{prediction.error.message}</p>}
          {predictionResult && <div className="mt-5 grid gap-4 lg:grid-cols-3"><div className="flex flex-wrap items-center gap-2 lg:col-span-3"><button type="button" className="inline-flex items-center gap-1 rounded-lg border border-[#bfd3c2] px-3 py-2 text-xs font-bold text-[#246047] hover:bg-[#edf6ee]" onClick={async () => setCopyNotice(await copyOutput(predictionResult.summary, "تم نسخ الملخص."))}><Clipboard className="h-3.5 w-3.5" />نسخ الملخص</button><button type="button" className="inline-flex items-center gap-1 rounded-lg border border-[#bfd3c2] px-3 py-2 text-xs font-bold text-[#246047] hover:bg-[#edf6ee]" onClick={async () => setCopyNotice(await copyOutput(predictionResult.forecasts.map(item => `${item.label}: ${item.value} — ${item.horizon}`).join("\n"), "تم نسخ التوقعات."))}><Clipboard className="h-3.5 w-3.5" />نسخ التوقعات</button><button type="button" className="inline-flex items-center gap-1 rounded-lg border border-[#bfd3c2] px-3 py-2 text-xs font-bold text-[#246047] hover:bg-[#edf6ee]" onClick={async () => setCopyNotice(await copyOutput(predictionResult.rankedOptions.map((item, index) => `${index + 1}. ${item.option} — ${item.rationale}`).join("\n"), "تم نسخ جدول الخيارات."))}><Clipboard className="h-3.5 w-3.5" />نسخ جدول الخيارات</button>{copyNotice && <span className="text-xs font-bold text-[#386048]">{copyNotice}</span>}</div>
            <div className="rounded-xl bg-white p-4 lg:col-span-3"><h3 className="text-sm font-bold text-[#12352f]">الملخص</h3><p className="mt-2 text-sm leading-7 text-[#486056]">{predictionResult.summary}</p></div>
            <div className="rounded-xl bg-white p-4"><h3 className="text-sm font-bold text-[#12352f]">التوقعات</h3>{predictionResult.forecasts.length ? predictionResult.forecasts.map((item, index) => <div key={`${item.label}-${index}`} className="mt-3 border-b border-[#eee8de] pb-2 text-xs"><strong>{item.label}: {item.value}</strong><span className="block mt-1 text-[#788980]">الثقة {Math.round(item.confidence * 100)}% · {item.horizon}</span></div>) : <div className="mt-3 text-center"><span className="text-2xl font-black text-[#b4935a]">0</span><p className="mt-1 text-xs text-[#788980]">لا توجد توقعات بعد</p></div>}</div>
            <div className="rounded-xl bg-white p-4"><h3 className="text-sm font-bold text-[#12352f]">الخيارات الأنسب</h3>{predictionResult.rankedOptions.length ? predictionResult.rankedOptions.map((item, index) => <div key={`${item.option}-${index}`} className="mt-3 border-b border-[#eee8de] pb-2 text-xs"><strong>{index + 1}. {item.option} ({item.score}/100)</strong><span className="block mt-1 text-[#788980]">{item.rationale}</span></div>) : <div className="mt-3 text-center"><span className="text-2xl font-black text-[#b4935a]">0</span><p className="mt-1 text-xs text-[#788980]">لا توجد خيارات مرتبة بعد</p></div>}</div>
            <div className={`rounded-xl p-4 ${predictionResult.autoApproval.eligible ? "bg-[#eaf6ec] text-[#176b3a]" : "bg-[#fbeceb] text-[#9a302b]"}`}><h3 className="text-sm font-bold">الموافقة الآلية</h3><p className="mt-2 text-xs leading-6">{predictionResult.autoApproval.eligible ? "مؤهل مبدئياً ضمن السياسة" : "تتطلب اعتماداً بشرياً"}</p><p className="mt-1 text-xs leading-6">{predictionResult.autoApproval.reason}</p></div>
            <div className="rounded-xl bg-[#eef3f8] p-4 text-[#29465d] lg:col-span-3"><h3 className="text-sm font-bold">اقتراح المعالجة المستقبلية</h3><p className="mt-2 text-xs leading-6">{predictionResult.automationSuggestion.suggested ? `يقترح المساعد وضع «${predictionResult.automationSuggestion.mode === "full" ? "معالجة كاملة" : "معالجة نصفية"}» بعد تراكم البيانات، لكن لا يُفعّل دون اعتماد صريح.` : "لا يقترح المساعد تفعيل الأتمتة حالياً."}</p><p className="mt-1 text-xs leading-6">{predictionResult.automationSuggestion.reason}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => chooseAutomation("full")} disabled={recordDecision.isPending} className="rounded-lg border border-[#9eb2c2] px-3 py-2 text-xs font-bold hover:bg-white disabled:opacity-50">معالجة كاملة</button><button type="button" onClick={() => chooseAutomation("partial")} disabled={recordDecision.isPending} className="rounded-lg border border-[#9eb2c2] px-3 py-2 text-xs font-bold hover:bg-white disabled:opacity-50">معالجة نصفية</button><button type="button" onClick={() => chooseAutomation("disabled")} disabled={recordDecision.isPending} className="rounded-lg border border-[#9eb2c2] px-3 py-2 text-xs font-bold hover:bg-white disabled:opacity-50">تعطيل الاقتراح</button><button type="button" onClick={revokeCurrentAutomation} disabled={revokeAutomation.isPending} className="rounded-lg border border-[#b94b3b] px-3 py-2 text-xs font-bold text-[#9a302b] hover:bg-[#fff5f2] disabled:opacity-50">إلغاء فوري للموافقة الآلية</button></div></div>{automationChoiceNotice && <p className="mt-3 text-xs font-semibold text-[#365a49]">{automationChoiceNotice}</p>}
          </div>}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="order-2 space-y-4 xl:order-1">
            <div className="rounded-[1.5rem] border border-[#ebe5d9] bg-white p-4 shadow-[0_10px_30px_rgba(35,55,47,0.05)] sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-[#12352f]">{selected?.label ?? "المساعد"}</h2><p className="mt-1 text-xs text-[#788980]">{selected?.description}</p></div><Sparkles className="h-5 w-5 text-[#b4935a]" /></div>
              <AIChatBox messages={messages} onSendMessage={sendMessage} isLoading={chat.isPending} height="min(60vh, 620px)" placeholder="اكتب سؤالك أو اطلب شرح إجراء..." emptyStateMessage="ابدأ بسؤال المساعد عن إجراءات قسمك" suggestedPrompts={["اشرح لي خطوات معالجة مهمة متعثرة", "ما المعلومات التي أحتاجها قبل رفع طلب؟", "اقترح قائمة تحقق للمراجعة"]} />
              <p className="mt-3 text-[11px] leading-5 text-[#788980]">المخرجات إرشادية وتحتاج مراجعة بشرية قبل إنشاء مهمة أو مراسلة أو اعتماد قرار.</p>
            </div>
          </section>

          <aside className="order-1 space-y-3 xl:order-2">
            <div className="rounded-[1.5rem] border border-[#ebe5d9] bg-white p-4 shadow-[0_10px_30px_rgba(35,55,47,0.05)]"><h2 className="mb-3 text-sm font-bold text-[#12352f]">المساعدون المتاحون</h2><div className="space-y-2">{available.map(item => <button key={item.key} type="button" onClick={() => selectAssistant(item.key as AssistantKey)} className={`w-full rounded-xl border px-3 py-3 text-right transition ${selectedKey === item.key ? "border-[#006c35] bg-[#edf5ee]" : "border-[#eee8de] hover:bg-[#faf8f2]"}`}><span className="block text-sm font-bold text-[#284239]">{item.label}</span><span className="mt-1 block text-[11px] leading-5 text-[#788980]">{item.description}</span></button>)}</div></div>
            <div className="rounded-[1.5rem] border border-[#eadfc9] bg-[#fffaf0] p-4 text-xs leading-6 text-[#6d5b3b]"><strong className="block text-[#4d3e29]">ضابط الاستخدام</strong>لا يعرض المساعد إلا ما تسمح به صلاحيتك، ولا يعتمد الطلبات بدلاً عن المسؤول. تجنب إدخال كلمات المرور أو رموز التحقق أو بيانات لا تخص سياق العمل.</div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AssistantsPage;
