import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  autoDistributeWorkflowSteps,
  buildWorkflowDiagram,
  extractWorkflowStepsFromText,
  normalizeWorkflowMap,
  normalizeWorkflowMimeType,
  workflowOwnerUnitHintFromText,
  workflowSlaDaysFromText,
  workflowTextFromDocument,
  type WorkflowStep,
} from "./workflow-map-service";

const step = (order: number, title: string, extra: Partial<WorkflowStep> = {}): WorkflowStep => ({ order, title, description: "", ownerUnitHint: "", deliverable: "", slaDays: 3, dependsOnOrder: order > 1 ? order - 1 : null, ...extra });

describe("مخطط سير العمل: استخراج الخطوات من النص", () => {
  it("يستخرج البنود المرقمة والأفعال الإجرائية ويستبعد الترويسات والتوقيع", () => {
    const text = [
      "التاريخ: 1447/03/12",
      "الموضوع: إجراءات معالجة الخطابات الواردة",
      "١- استلام الخطاب الوارد وتقييده في السجل الإلكتروني.",
      "2) مراجعة المرفقات والتحقق من اكتمالها.",
      "- إحالة الخطاب إلى قسم شؤون الملازمين خلال ٣ أيام.",
      "ثم اعتماد الرد النهائي من رئيس المحكمة خلال أسبوع.",
      "التوقيع: مدير الإدارة",
    ].join("\n");
    const steps = extractWorkflowStepsFromText(text);
    expect(steps.map(item => item.title)).toEqual([
      "استلام الخطاب الوارد وتقييده في السجل الإلكتروني",
      "مراجعة المرفقات والتحقق من اكتمالها",
      "إحالة الخطاب إلى قسم شؤون الملازمين خلال ٣ أيام",
      "اعتماد الرد النهائي من رئيس المحكمة خلال أسبوع",
    ]);
    expect(steps.map(item => item.order)).toEqual([1, 2, 3, 4]);
    expect(steps[0]!.dependsOnOrder).toBeNull();
    expect(steps[3]!.dependsOnOrder).toBe(3);
    expect(steps[2]!.ownerUnitHint).toBe("قسم شؤون الملازمين");
    expect(steps[2]!.slaDays).toBe(3);
    expect(steps[3]!.slaDays).toBe(7);
  });

  it("يزيل التكرار ويحترم الحد الأقصى للخطوات ويتجاهل النص بلا خطوات", () => {
    const repeated = ["1- مراجعة الطلب الوارد", "٢- مراجعة الطلب الوارد", "3- اعتماد الطلب النهائي خلال يومين"].join("\n");
    const steps = extractWorkflowStepsFromText(repeated);
    expect(steps).toHaveLength(2);
    expect(steps[1]!.slaDays).toBe(2);
    expect(extractWorkflowStepsFromText(repeated, { maxSteps: 1 })).toHaveLength(1);
    expect(extractWorkflowStepsFromText("لا توجد أي إجراءات هنا")).toEqual([]);
    expect(extractWorkflowStepsFromText("")).toEqual([]);
  });

  it("يحسب المدة المقترحة ويستخرج الوحدة المسؤولة من عبارات شائعة", () => {
    expect(workflowSlaDaysFromText("خلال يوم واحد")).toBe(1);
    expect(workflowSlaDaysFromText("خلال يومين")).toBe(2);
    expect(workflowSlaDaysFromText("خلال أسبوعين")).toBe(14);
    expect(workflowSlaDaysFromText("خلال شهرين")).toBe(60);
    expect(workflowSlaDaysFromText("خلال ١٢ يوماً")).toBe(12);
    expect(workflowSlaDaysFromText("بلا مدة محددة")).toBe(3);
    expect(workflowOwnerUnitHintFromText("إحالة المعاملة إلى إدارة الخدمات المشتركة خلال ٥ أيام")).toBe("إدارة الخدمات المشتركة");
    expect(workflowOwnerUnitHintFromText("مراجعة عادية")).toBe("");
  });
});

describe("مخطط سير العمل: تنظيف مخرجات التحليل والمخطط المرئي", () => {
  it("ينظف مخرجات الذكاء الاصطناعي ويرقّم الخطوات ويزيل المكرر", () => {
    const map = normalizeWorkflowMap({
      title: "  إجراءات معالجة الطلبات  ",
      summary: "  ملخص الإجراء  ",
      steps: [
        { title: "استلام الطلب وتسجيله", slaDays: 2, ownerUnitHint: "قسم القيد" },
        { title: "استلام الطلب وتسجيله" },
        { title: "أ" },
        { title: "اعتماد الطلب النهائي", description: "يُعتمد خلال أسبوعين" },
      ],
    });
    expect(map.title).toBe("إجراءات معالجة الطلبات");
    expect(map.summary).toBe("ملخص الإجراء");
    expect(map.steps.map(item => item.order)).toEqual([1, 2]);
    expect(map.steps[0]!.slaDays).toBe(2);
    expect(map.steps[0]!.ownerUnitHint).toBe("قسم القيد");
    expect(map.steps[1]!.title).toBe("اعتماد الطلب النهائي");
    expect(map.steps[1]!.slaDays).toBe(14);
    expect(map.steps[1]!.dependsOnOrder).toBe(1);
    expect(normalizeWorkflowMap(null, "مخطط القسم").title).toBe("مخطط القسم");
    expect(normalizeWorkflowMap({ steps: [] }).steps).toEqual([]);
    expect(normalizeWorkflowMap("نص غير صالح").steps).toEqual([]);
  });

  it("يبني مخططاً متسلسلاً من اليمين إلى اليسار بترتيب ثعباني مع وصلات صحيحة", () => {
    const diagram = buildWorkflowDiagram([1, 2, 3, 4, 5].map(order => step(order, `الخطوة ${order}`)));
    expect(diagram.lanes).toBe(2);
    expect(diagram.nodes).toHaveLength(5);
    expect(diagram.nodes[0]!.x).toBe(24 + 2 * (220 + 56));
    expect(diagram.nodes[1]!.x).toBe(24 + 1 * (220 + 56));
    expect(diagram.nodes[2]!.x).toBe(24);
    expect(diagram.nodes[3]!.x).toBe(24);
    expect(diagram.nodes[3]!.y).toBe(24 + 88 + 44);
    expect(diagram.edges).toHaveLength(4);
    expect(diagram.edges[0]).toMatchObject({ from: 1, to: 2, y1: diagram.nodes[0]!.centerY, y2: diagram.nodes[1]!.centerY });
    expect(diagram.edges[0]!.x1).toBe(diagram.nodes[0]!.x);
    expect(diagram.edges[2]).toMatchObject({ from: 3, to: 4 });
    expect(diagram.edges[2]!.x1).toBe(diagram.nodes[2]!.centerX);
    expect(diagram.edges[2]!.x2).toBe(diagram.nodes[3]!.centerX);
    expect(diagram.edges[2]!.y1).toBe(diagram.nodes[2]!.y + diagram.nodes[2]!.height);
    expect(diagram.edges[2]!.y2).toBe(diagram.nodes[3]!.y);
    expect(buildWorkflowDiagram([]).nodes).toEqual([]);
    expect(buildWorkflowDiagram([step(1, "خطوة واحدة")]).edges).toEqual([]);
  });

  it("يوزع الخطوات بالاسم ثم بالوحدة ثم بالأقل حملاً دون تجاوز الموظفين المتاحين", () => {
    const staff = [
      { id: 1, fullName: "سعد المطيري", unitId: 10, unitName: "قسم شؤون الملازمين", openWorkload: 2 },
      { id: 2, fullName: "نورة العتيبي", unitId: 11, unitName: "إدارة الخدمات المشتركة", openWorkload: 0 },
    ];
    const assignments = autoDistributeWorkflowSteps({
      steps: [
        { order: 1, title: "مراجعة تقرير سعد المطيري", ownerUnitHint: "" },
        { order: 2, title: "تجهيز ملف الصيانة", ownerUnitHint: "إدارة الخدمات المشتركة" },
        { order: 3, title: "خطوة بلا مالك محدد", ownerUnitHint: "" },
      ],
      staff,
    });
    expect(assignments).toEqual([
      { order: 1, assigneeProfileId: 1, matchReason: "name" },
      { order: 2, assigneeProfileId: 2, matchReason: "unit" },
      { order: 3, assigneeProfileId: 2, matchReason: "balanced" },
    ]);
    expect(assignments.every(item => [1, 2].includes(item.assigneeProfileId))).toBe(true);
    expect(autoDistributeWorkflowSteps({ steps: [{ order: 1, title: "أي خطوة" }], staff: [] })).toEqual([]);
  });
});

describe("مخطط سير العمل: قراءة ملفات Word وExcel والنصوص وتحديد مسار PDF", () => {
  it("يقرأ ملف XLSX ويحوّل صفوفه إلى نص خطوات", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["البند", "المسؤول"], ["استلام الطلب الوارد وتقييده", "قسم القيد"], ["اعتماد الرد النهائي خلال أسبوع", "رئيس المحكمة"]]), "الإجراءات");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = await workflowTextFromDocument({ originalName: "خطة.xlsx", mimeType: "", buffer });
    expect(result.method).toBe("sheet");
    expect(result.text).toContain("استلام الطلب الوارد وتقييده");
    expect(extractWorkflowStepsFromText(result.text).map(item => item.title)).toEqual(["اعتماد الرد النهائي خلال أسبوع"]);
  });

  it("يقرأ النصوص وCSV محلياً ويحيل PDF والصور إلى القراءة الذكية", async () => {
    const text = await workflowTextFromDocument({ originalName: "خطة.txt", mimeType: "text/plain", buffer: Buffer.from("1- استلام الطلب\n2- اعتماد الطلب خلال يومين", "utf8") });
    expect(text.method).toBe("text");
    expect(extractWorkflowStepsFromText(text.text)).toHaveLength(2);
    const csv = await workflowTextFromDocument({ originalName: "خطة.csv", mimeType: "", buffer: Buffer.from("البند\nمراجعة الطلب الوارد", "utf8") });
    expect(csv.method).toBe("sheet");
    expect(csv.text).toContain("مراجعة الطلب الوارد");
    const pdf = await workflowTextFromDocument({ originalName: "خطة.pdf", mimeType: "", buffer: Buffer.from("%PDF-1.4 محتوى") });
    expect(pdf).toEqual({ text: "", method: "ocr" });
    const image = await workflowTextFromDocument({ originalName: "صورة.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50]) });
    expect(image.method).toBe("ocr");
  });

  it("يستنتج نوع الملف من الامتداد عند غياب نوع MIME", () => {
    expect(normalizeWorkflowMimeType("خطة.docx", "")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(normalizeWorkflowMimeType("خطة.xlsx", "")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(normalizeWorkflowMimeType("خطة.pdf", "")).toBe("application/pdf");
    expect(normalizeWorkflowMimeType("خطة.jpeg", "")).toBe("image/jpeg");
    expect(normalizeWorkflowMimeType("خطة.csv", "")).toBe("text/csv");
    expect(normalizeWorkflowMimeType("خطة.غريب", "")).toBe("text/plain");
    expect(normalizeWorkflowMimeType("خطة.غريب", "image/png")).toBe("image/png");
  });
});


