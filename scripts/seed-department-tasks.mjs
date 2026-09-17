#!/usr/bin/env node
/**
 * بذر مهام الأقسام (من ملف «المهام بالدليل التنظيمي والأعمال الفعلية للأقسام.xlsx»)
 * على شكل قوالب مهام (task_templates) مربوطة بأقسامها، لتسهيل تفعيلها لاحقاً من مدير القسم.
 *
 * - frequency = "custom" حتى لا تُنشئ مهاماً تلقائياً يومياً؛ تُفعّل يدوياً من المدير عند الحاجة.
 * - isActive = true لتظهر مباشرة ضمن قائمة قوالب القسم.
 *
 * Usage: node --env-file=.env.prod scripts/seed-department-tasks.mjs
 */
import mysql from "mysql2/promise";

const SYSTEM_USER_ID = Number(process.env.SYSTEM_ACTOR_ID || 1);

const DEPARTMENT_TASKS = [
  {
    dept: "خدمات المستفيدين",
    tasks: [
      "استقبال المستفيدين للاقسام ومعالجة الطلبات اليدوية ممن تعثر عليهم استخدام الخدمات الإلكترونية",
      "استقبال الاستفسارات و الشكاوى والرد عليها وحلها واقتراح معالجة الأسباب الناتجة لها",
      "استلام طلبات الاعتراض اليدوية على الاحكام الصادرة للمستفيدين وإحالتها إلى القسم المختص وفق القواعد المقررة لذلك",
      "متابعة تنفيذ طلبات المستفيدين واشعارهم بذلك",
      "استلام طلبات البريد الوارد و الرفع للاختصاص والمتابعة",
      "متابعة تذاكر CRM والرد عليها وتوجيهها",
      "الرفع للاشكاليات التقنية لدى داعم ومتابعتها",
    ],
  },
  {
    dept: "تسليم الاحكام",
    tasks: [
      "تسليم الأحكام المذيلة بالصيغة التنفيذية للمستفيد والجهات المختصة",
      "استقبال طلبات المفقود للصكوك والأحكام وتحضيرها من القسم المختص وتسليمها للمستفيد",
      "تدقيق طلبات الاستئناف والتحقق من استيفاء المتطلبات النظامية والوثائق المرفقة قبل تحويل ملف القضية إلى محكمة الاستئناف",
      "تدوين الضبوط بما يفيد اكتساب الاحكام الصفة النهائية أو نقضها أو تنفيذها ونحوه",
      "تذييل الصكوك بما يفيد بنقض الحكم أو اكتسابه الصفة النهائية أو تصحيحه",
      "استقبال طلبات وشكاوى المستفيدين للمعالجة التقنية (أخطاء تقنية)",
      "مشروع تدقيق الأحكام بعد صدورها",
      "فتح التذاكر التقنية للمعالجة وتعديل الأخطاء التقنية",
    ],
  },
  {
    dept: "الوثائق والمحفوظات",
    tasks: [
      "حفظ ملفات القضايا المنتهية المحالة إلى القسم وفقا للإجراءات المتبعة ولائحة الوثائق القضائية",
      "حفظ وتنظيم وتصنيف وترميز وفهرست الوثائق والمحفوظات وفقا للإجراءات المتبعة",
      "تأمين أماكن حفظ الوثائق والمحفوظات وحمايتها وفقا للأنظمة والتعليمات",
      "حفظ جميع الوثائق والقرارات المتعلقة بمنسوبي المحكمة",
      "حفظ الشهادات والتقارير والمحاضر المتعلقة بأعمال المحكمة",
      "حفظ جمع صور الخطابات والمراسلات الرسمية الصادرة من المحكمة",
      "توفير وتزويد الأقسام ذات العلاقة بالوثائق والمعلومات المطلوبة ونسخ بدل المفقود وفقاً للاجراءات المتبعة",
      "فرز الوثائق والمحفوظات المطلوب إتلافها وترحيلها وفقاً للإجراءات المتبعة",
      "تنظيم أوراق المعاملات ووضعها داخل دوسيات مخصصة للحفظ",
      "حفظ بيانات المعاملات المؤرشفة وادخالها في ملف إكسل",
    ],
  },
  {
    dept: "قسم الدعاوى",
    tasks: [
      "استقبال الدعاوى و القضايا المحالة",
      "تدقيق الدعاوى والقضايا المرفوعة للمحكمة والتحقق من استيفاء المتطلبات النظامية والوثائق المرفقة",
      "قيد الدعاوى موفية المتطلبات والمرفقات وإنشاء ملف خاص للقضية",
      "إحالة الدعاوى المقيدة إلى الجهة المختصة",
    ],
  },
];

const normalize = value => String(value ?? "").trim().replace(/\s+/g, " ");

async function ensureUnit(connection, name) {
  const normalized = normalize(name);
  const [byName] = await connection.query("SELECT id FROM organization_units WHERE name = ? LIMIT 1", [normalized]);
  if (byName[0]) return byName[0].id;
  const code = `dept-${Buffer.from(normalized).toString("base64url").slice(0, 40)}`;
  await connection.query(
    "INSERT INTO organization_units (name, code, isActive) VALUES (?, ?, true) ON DUPLICATE KEY UPDATE name = VALUES(name), isActive = true",
    [normalized, code],
  );
  const [created] = await connection.query("SELECT id FROM organization_units WHERE code = ? OR name = ? LIMIT 1", [code, normalized]);
  return created[0]?.id ?? null;
}

async function main() {
  const raw = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
  if (!raw) {
    console.log(JSON.stringify({ skipped: true, reason: "DATABASE_URL missing" }, null, 2));
    process.exit(0);
  }
  const url = new URL(raw);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "") || "rakiza",
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  });

  const report = { ok: true, departments: [], created: 0, existing: 0 };
  try {
    for (const group of DEPARTMENT_TASKS) {
      const unitId = await ensureUnit(connection, group.dept);
      const deptReport = { dept: group.dept, unitId, tasks: 0 };
      for (const title of group.tasks) {
        const normalizedTitle = normalize(title);
        const [existing] = await connection.query("SELECT id FROM task_templates WHERE unitId = ? AND title = ? LIMIT 1", [unitId, normalizedTitle]);
        if (existing[0]) { report.existing += 1; deptReport.tasks += 1; continue; }
        await connection.query(
          `INSERT INTO task_templates (unitId, title, frequency, workdayOnly, dueHourLocal, requiredApprovals, isActive, createdByUserId)
           VALUES (?, ?, 'custom', true, 13, 1, true, ?)`,
          [unitId, normalizedTitle, SYSTEM_USER_ID],
        );
        report.created += 1;
        deptReport.tasks += 1;
      }
      report.departments.push(deptReport);
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
