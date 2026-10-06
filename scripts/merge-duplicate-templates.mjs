// scripts/merge-duplicate-templates.mjs — دمج القوالب المكررة (نفس العنوان+الوحدة) — وضع المعاينة افتراضياً.
// الاستخدام:
//   node scripts/merge-duplicate-templates.mjs           → معاينة فقط (لا تعديل)
//   node scripts/merge-duplicate-templates.mjs --apply   → تنفيذ الدمج الفعلي
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");

function env(key) {
  for (const line of fs.readFileSync(path.resolve(".env.production.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("="); if (e === -1) continue;
    if (t.slice(0, e).trim() !== key) continue;
    let v = t.slice(e + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

function normalizeArabic(s) {
  return String(s)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/(^|\s)ال/g, "$1") // إسقاط أداة التعريف «ال» لدمج "استقبال مستفيدات" و"استقبال المستفيدات"
    .replace(/\s+/g, " ")
    .trim();
}

const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true, bigNumberStrings: true,
  timezone: "Z",
});

// كل القوالب + عدد مهامها المرتبطة
const [templates] = await db.query(`
  SELECT t.id, t.unitId, t.title, t.isActive, t.defaultAssigneeProfileId,
         COUNT(tk.id) AS taskCount
  FROM task_templates t
  LEFT JOIN tasks tk ON tk.templateId = t.id
  GROUP BY t.id, t.unitId, t.title, t.isActive, t.defaultAssigneeProfileId
  ORDER BY t.id
`);

// تجميع حسب (العنوان الموحّد + الوحدة)
const groups = new Map();
for (const t of templates) {
  const key = `${normalizeArabic(t.title)}|${t.unitId ?? "null"}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(t);
}

const dupGroups = [...groups.values()].filter(g => g.length > 1);

console.log(`\n=== القوالب المكررة (${dupGroups.length} مجموعة) — ${APPLY ? "تنفيذ" : "معاينة"} ===\n`);

let totalArchived = 0;
let totalReassigned = 0;
const rows = ["group,primaryId,duplicateIds,unitId,taskCountPrimary,taskCountDupes,title"];

for (const group of dupGroups) {
  // القالب الرئيسي = الأقدم (أصغر id)؛ ثم الأكثر استخداماً
  const primary = [...group].sort((a, b) => a.id - b.id)[0];
  const dupes = group.filter(t => t.id !== primary.id);
  const dupTaskCount = dupes.reduce((s, d) => s + Number(d.taskCount), 0);

  console.log(`▸ المجموعة: "${group[0].title.slice(0, 45)}" (unitId=${group[0].unitId})`);
  console.log(`    القالب الرئيسي: id=${primary.id} (مهام=${primary.taskCount}, active=${primary.isActive ? 1 : 0})`);
  console.log(`    القوالب المكررة: ${dupes.map(d => `id=${d.id}(مهام=${d.taskCount})`).join(" ، ")}`);
  if (dupTaskCount > 0) console.log(`    ⚠️ سيُنقل ${dupTaskCount} مهمة إلى القالب الرئيسي ${primary.id}`);
  console.log("");

  rows.push(`${group.length},${primary.id},"${dupes.map(d => d.id).join(";")}",${group[0].unitId ?? ""},${primary.taskCount},${dupTaskCount},"${String(group[0].title).replace(/"/g, '""')}"`);

  if (APPLY) {
    for (const d of dupes) {
      // نقل المهام إلى القالب الرئيسي
      const [upd] = await db.query("UPDATE tasks SET templateId = ? WHERE templateId = ?", [primary.id, d.id]);
      if (upd.affectedRows > 0) totalReassigned += upd.affectedRows;
      // أرشفة القالب المكرر (تعطيل لا حذف)
      await db.query("UPDATE task_templates SET isActive = 0 WHERE id = ?", [d.id]);
      totalArchived += 1;
    }
  }
}

const dateStr = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.resolve("reports", `template-merge-preview-${dateStr}.csv`), "\ufeff" + rows.join("\n"), "utf8");

console.log(`\n=== الملخص ===`);
console.log(`مجموعات مكررة: ${dupGroups.length}`);
console.log(`قوالب سيتم أرشفتها (تعطيل): ${dupGroups.reduce((s, g) => s + g.length - 1, 0)}`);
console.log(`مهام سيتم نقلها: ${dupGroups.reduce((s, g) => { const p = [...g].sort((a, b) => a.id - b.id)[0]; return s + g.filter(t => t.id !== p.id).reduce((x, d) => x + Number(d.taskCount), 0); }, 0)}`);
if (APPLY) {
  console.log(`\n✅ نُفِّذ: أُرشف ${totalArchived} قالبًا، نُقلت ${totalReassigned} مهمة.`);
} else {
  console.log(`\n⛔ وضع المعاينة — لم يُنفَّذ أي تعديل. للتفيذ: node scripts/merge-duplicate-templates.mjs --apply`);
}
console.log(`حُفظ: reports/template-merge-preview-${dateStr}.csv`);

await db.end();
