// scripts/audit-duplication-pattern.mjs — تحليل نمط تكرار المهام المولّدة من القوالب (قراءة فقط).
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function env(key) {
  for (const line of fs.readFileSync(".env.production.local", "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("="); if (e === -1) continue;
    if (t.slice(0, e).trim() !== key) continue;
    let v = t.slice(e + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

function categoryOf(title) {
  const s = title || "";
  if (/استقبال|مستفيد/.test(s)) return "استقبال";
  if (/فرز/.test(s)) return "فرز";
  if (/تقرير|اعداد/.test(s)) return "تقارير";
  if (/اشراف|متابعه|متابعة/.test(s)) return "إشراف/متابعة";
  if (/بريد/.test(s)) return "بريد";
  if (/ملازم|تشكيل/.test(s)) return "ملازمين/تشكيلات";
  if (/قضايا|تهيئة/.test(s)) return "قضايا";
  return "أخرى";
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

const since = new Date(Date.now() - 180 * 24 * 3600 * 1000);
const [tasks] = await db.query(`
  SELECT t.id, t.title, t.templateId, t.scheduledFor, t.createdAt, t.status,
         t.assigneeProfileId, p.fullName AS assigneeName, t.unitId, u.name AS unitName,
         tt.frequency, tt.defaultAssigneeProfileId
  FROM tasks t
  LEFT JOIN person_profiles p ON p.id = t.assigneeProfileId
  LEFT JOIN organization_units u ON u.id = t.unitId
  LEFT JOIN task_templates tt ON tt.id = t.templateId
  WHERE t.templateId IS NOT NULL AND t.createdAt >= ?
  ORDER BY t.templateId, t.scheduledFor
`, [since]);

// تجميع "مجموعات مكررة": نفس templateId + scheduledFor date + نفس العنوان → أكثر من مهمة.
const dupKey = {};
for (const t of tasks) {
  const day = t.scheduledFor ? t.scheduledFor.toISOString().slice(0, 10) : "?";
  const k = `${t.templateId}|${day}|${t.title}`;
  (dupKey[k] = dupKey[k] || []).push(t);
}
const dupGroups = Object.entries(dupKey).filter(([, arr]) => arr.length > 1);

console.log("=== الملخص ===");
console.log("مهام القوالب (آخر 180 يوم):", tasks.length);
console.log("مجموعات مكررة (نفس القالب+اليوم+العنوان):", dupGroups.length);
console.log("مهام زائدة (تكرار):", dupGroups.reduce((s, [, a]) => s + a.length - 1, 0));

// بُعد 1: حسب اليوم
console.log("\n=== بُعد 1: التكرار حسب اليوم ===");
const byDay = {};
for (const [k, arr] of dupGroups) {
  const day = arr[0].scheduledFor?.toISOString?.().slice(0, 10) ?? "?";
  byDay[day] = (byDay[day] || 0) + 1;
}
for (const [d, c] of Object.entries(byDay).sort()) console.log(`  ${d}: ${c} مجموعة مكررة`);

// بُعد 2: حسب نوع القالب (frequency)
console.log("\n=== بُعد 2: التكرار حسب frequency ===");
const byFreq = {};
const totalFreq = {};
for (const t of tasks) totalFreq[t.frequency] = (totalFreq[t.frequency] || 0) + 1;
for (const [k, arr] of dupGroups) byFreq[arr[0].frequency] = (byFreq[arr[0].frequency] || 0) + 1;
for (const f of Object.keys(totalFreq)) console.log(`  ${f}: ${byFreq[f] || 0} مجموعة مكررة / ${totalFreq[f]} مهمة`);

// بُعد 3: حسب التصنيف (مشتق من العنوان)
console.log("\n=== بُعد 3: التكرار حسب التصنيف (مشتق من العنوان) ===");
const byCat = {};
for (const [k, arr] of dupGroups) byCat[categoryOf(arr[0].title)] = (byCat[categoryOf(arr[0].title)] || 0) + 1;
for (const [c, n] of Object.entries(byCat)) console.log(`  ${c}: ${n}`);

// بُعد 4: حسب الوحدة
console.log("\n=== بُعد 4: التكرار حسب الوحدة ===");
const byUnit = {};
for (const [k, arr] of dupGroups) { const un = arr[0].unitName || "بلا وحدة"; byUnit[un] = (byUnit[un] || 0) + 1; }
for (const [un, n] of Object.entries(byUnit)) console.log(`  ${un}: ${n}`);

// بُعد 5: حسب وقت الإنشاء (cron)
console.log("\n=== بُعد 5: فروق وقت الإنشاء داخل المجموعة المكررة ===");
const sameMinute = dupGroups.filter(([, arr]) => {
  const ts = new Set(arr.map(a => a.createdAt?.toISOString?.().slice(0, 16)));
  return ts.size === 1;
}).length;
const diffMinute = dupGroups.length - sameMinute;
console.log(`  نُسخ أُنشئت في نفس الدقيقة: ${sameMinute} مجموعة`);
console.log(`  نُسخ أُنشئت في دقائق مختلفة: ${diffMinute} مجموعة`);

// بُعد 6: حسب المُسند (نفس الموظف مرتين أم round-robin)
console.log("\n=== بُعد 6: التكرار حسب المُسند ===");
const sameAssignee = dupGroups.filter(([, arr]) => new Set(arr.map(a => a.assigneeProfileId).filter(Boolean)).size <= 1).length;
const diffAssignee = dupGroups.length - sameAssignee;
console.log(`  تكرار لنفس الموظف: ${sameAssignee} مجموعة`);
console.log(`  تكرار لموظفين مختلفين (round-robin): ${diffAssignee} مجموعة`);

// بُعد 7: حسب القالب
console.log("\n=== بُعد 7: القوالب الأكثر تكراراً (أعلى 15) ===");
const byTpl = {};
for (const [k, arr] of dupGroups) {
  const cur = byTpl[arr[0].templateId] || { title: arr[0].title, freq: arr[0].frequency, count: 0, copies: 0 };
  byTpl[arr[0].templateId] = { title: arr[0].title, freq: arr[0].frequency, count: cur.count + 1, copies: cur.copies + arr.length };
}
for (const [tid, v] of Object.entries(byTpl).sort((a, b) => b[1].copies - a[1].copies).slice(0, 15)) {
  console.log(`  templateId=${tid} freq=${v.freq} copies=${v.copies} title=${(v.title || "").slice(0, 35)}`);
}

// قوالب مكررة بنفس العنوان (عنوان واحد لعدة templateId)
console.log("\n=== قوالب لها نفس العنوان (templateId مختلف) ===");
const tplByTitle = {};
for (const t of tasks) { (tplByTitle[t.title] = tplByTitle[t.title] || new Set()).add(t.templateId); }
for (const [title, ids] of Object.entries(tplByTitle)) if (ids.size > 1) console.log(`  "${(title || "").slice(0, 40)}": templateIds=${[...ids].join(",")}`);

// حفظ JSON
const dateStr = new Date().toISOString().slice(0, 10);
const dir = path.resolve("reports");
fs.mkdirSync(dir, { recursive: true });
const report = { generatedAt: new Date().toISOString(), totalTemplateTasks: tasks.length, dupGroups: dupGroups.length, extraTasks: dupGroups.reduce((s, [, a]) => s + a.length - 1, 0), byDay, byFreq, byCat, byUnit, sameMinute, diffMinute, sameAssignee, diffAssignee, byTpl };
fs.writeFileSync(path.join(dir, `duplication-pattern-audit-${dateStr}.json`), JSON.stringify(report, null, 2), "utf8");
console.log(`\nحُفظ: reports/duplication-pattern-audit-${dateStr}.json`);

// CSV تفصيلي: مجموعة مكررة لكل سطر
const csvRows = ["templateId,title,day,frequency,unit,copies,assignees,createdTimes"];
for (const [k, arr] of dupGroups) {
  const a = arr[0];
  const day = a.scheduledFor?.toISOString?.().slice(0, 10) ?? "?";
  const assignees = [...new Set(arr.map(x => x.assigneeName || x.assigneeProfileId || "null"))].join(" ; ");
  const created = arr.map(x => x.createdAt?.toISOString?.().slice(11, 16)).join(" ; ");
  csvRows.push(`${a.templateId},"${(a.title || "").replace(/"/g, '""')}",${day},${a.frequency || ""},${(a.unitName || "").replace(/,/g, " ")},${arr.length},"${assignees.replace(/"/g, '""')}",${created}`);
}
fs.writeFileSync(path.join(dir, `duplication-pattern-audit-${dateStr}.csv`), "\ufeff" + csvRows.join("\n"), "utf8");
console.log(`حُفظ: reports/duplication-pattern-audit-${dateStr}.csv (${csvRows.length - 1} صف)`);

await db.end();
