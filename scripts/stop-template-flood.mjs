// scripts/stop-template-flood.mjs — المهمة 1: إيقاف فيضان القوالب + محاولة التصنيف
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function env(key) {
  for (const line of fs.readFileSync(path.resolve(".env.production.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("=");
    if (e === -1) continue;
    if (t.slice(0, e).trim() !== key) continue;
    let v = t.slice(e + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

// التصنيف المقترح من المستخدم (كلمات مفتاحية)
const CLASSIFICATION = [
  ["daily", "1", ["تدوين الإحاطة", "تسجيل مباشرة الملازمين", "التحقق من صلاحية يوزرات", "متابعة حضور وانصراف", "ارسال بريد افادة", "تحديث قاعدة بيانات", "متابعة طلبات اجازات"]],
  ["weekly", "1", ["إعداد تقرير اسبوعي", "متابعة مستهدفات", "تقييم القضاة المدربين", "متابعة طلبات العمل عن بعد", "حصر أسماء الملازمين", "متابعة استئذانات", "طلب الاعتمادات"]],
  ["monthly", "1", ["رفع مباشرة وتكليف", "اعداد تقييم شهري", "تنسيق اجتماعات مع الرئيس", "استلام بطاقات عمل", "اعداد خطة تدريب", "تهيئة محطات العمل"]],
  ["quarterly", "1", ["اعداد مسودة التكريم", "اعداد العرض بالعهد", "حصر قرارات الايفاد", "اعداد مقترح لتشكيل", "تنسيق مواقف"]],
  ["yearly", "1", ["اعداد العرض الخاص بتقييم الملازم"]],
  ["custom", "3", ["الملازمين المعينين حديثا"]],
];

const norm = (s) => String(s).replace(/\s+/g, " ").trim();

const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
});

const [templates] = await db.query("SELECT id, unitId, title FROM task_templates");
console.log(`إجمالي القوالب: ${templates.length}`);

// 1) إيقاف الكل
await db.query("UPDATE task_templates SET isActive = 0");
console.log("تم إيقاف كل القوالب (isActive = 0).");

// 2) محاولة التصنيف (مطابقة الكلمات المفتاحية بالعنوان)
const summary = [];
for (const [frequency, intervalDays, keywords] of CLASSIFICATION) {
  const matched = templates.filter((tpl) => keywords.some((kw) => norm(tpl.title).includes(norm(kw))));
  summary.push({ frequency, intervalDays, count: matched.length, titles: matched.map((m) => m.title) });
  for (const m of matched) {
    await db.query("UPDATE task_templates SET frequency = ?, intervalDays = ?, isActive = 1 WHERE id = ?", [frequency, Number(intervalDays), m.id]);
  }
}

// 3) عرض الجدول
console.log("\n=== جدول التصنيف ===");
console.log("| التصنيف | العدد | الأسماء |");
console.log("|---|---|---|");
for (const s of summary) {
  const names = s.count ? s.titles.join("، ") : "—";
  console.log(`| ${s.frequency} (interval=${s.intervalDays}) | ${s.count} | ${names} |`);
}
const activated = summary.reduce((sum, s) => sum + s.count, 0);
console.log(`\nالناتج: أُعيد تفعيل ${activated} قالبًا (المطابق للكلمات المفتاحية)، وبقي ${templates.length - activated} معطّلًا.`);

await db.end();
