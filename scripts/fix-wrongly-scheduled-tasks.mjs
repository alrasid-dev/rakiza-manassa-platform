// scripts/fix-wrongly-scheduled-tasks.mjs
// فحص/عرض فقط (لا ينفّذ أي تعديل): يعرض المهام المولّدة من القوالب التي أُنشئت في يومٍ ما
// وجُدولت لليوم التالي — نتيجةً لقطع 07:00 القديم (الذي أُزيل من server/court-service.ts).
//
// الاستخدام:
//   node scripts/fix-wrongly-scheduled-tasks.mjs [createdDate] [scheduledDate]
//   الافتراضي: createdDate = 2026-10-08 ، scheduledDate = 2026-10-09
//
// يقرأ DATABASE_URL من .env.production.local دون طباعة أي أسرار.

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

let rawUrl = "";

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    if (t.slice(0, eq).trim() !== key) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return null;
}

// يزيل أي كلمة مرور أو رابط كامل من رسائل الأخطاء قبل طباعتها.
function redact(message) {
  let out = String(message);
  try {
    if (rawUrl) {
      const url = new URL(rawUrl);
      if (url.password) out = out.split(url.password).join("***");
      out = out.split(rawUrl).join("[REDACTED]");
    }
  } catch {
    /* ignore */
  }
  return out;
}

// يعرض تاريخاً بصيغة ISO (UTC) مع التوقيت السعودي للوضوح.
function fmt(d) {
  if (!d) return "-";
  const dt = new Date(d);
  const iso = dt.toISOString().replace("T", " ").slice(0, 19) + "Z";
  const riyadh = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
  return `${iso} (الرياض ${riyadh})`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const createdDate = process.argv[2] || "2026-10-08";
  const scheduledDate = process.argv[3] || "2026-10-09";

  rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
  if (!rawUrl) {
    console.error("DATABASE_URL not found in .env.production.local");
    process.exit(1);
  }

  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";

  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    timezone: "Z",
  });

  const [rows] = await connection.query(
    `SELECT t.id, t.title, t.templateId, t.assigneeProfileId, p.fullName,
            t.scheduledFor, t.dueAt, t.createdAt
     FROM tasks t
     LEFT JOIN person_profiles p ON p.id = t.assigneeProfileId
     WHERE DATE(t.createdAt) = ? AND DATE(t.scheduledFor) = ?
     ORDER BY t.id`,
    [createdDate, scheduledDate],
  );

  console.log("═══════════════════════════════════════════════════════════");
  console.log(`المهام المولّدة يوم ${createdDate} والمجدولة يوم ${scheduledDate}`);
  console.log(`العدد: ${rows.length}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (rows.length === 0) {
    console.log("لا توجد مهام بهذا النمط.");
    await connection.end();
    return;
  }

  for (const r of rows) {
    console.log(`#${r.id} | ${r.title}`);
    console.log(`   الموظف: ${r.fullName || "-"} (#${r.assigneeProfileId}) | قالب: ${r.templateId ?? "-"}`);
    console.log(`   أُنشئت: ${fmt(r.createdAt)}`);
    console.log(`   مجدولة حالياً: ${fmt(r.scheduledFor)}`);
    console.log(`   الاستحقاق حالياً: ${fmt(r.dueAt)}`);
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("الاقتراح (لم يُنفَّذ — للمراجعة فقط):");
  console.log("إعادة الجدولة لليوم الصحيح (خصم 24 ساعة من scheduledFor وdueAt).");
  console.log("═══════════════════════════════════════════════════════════\n");

  for (const r of rows) {
    const newScheduled = new Date(new Date(r.scheduledFor).getTime() - DAY_MS);
    const newDue = r.dueAt ? new Date(new Date(r.dueAt).getTime() - DAY_MS) : null;
    console.log(`UPDATE tasks SET scheduledFor = '${newScheduled.toISOString().slice(0, 19).replace("T", " ")}'${newDue ? `, dueAt = '${newDue.toISOString().slice(0, 19).replace("T", " ")}'` : ""} WHERE id = ${r.id};  -- ${r.title}`);
  }

  console.log("\n⚠️  هذا السكربت للعرض فقط. لم يتم تعديل أي صف في قاعدة البيانات.");

  await connection.end();
}

main().catch((err) => {
  console.error("Failed: " + redact(err && err.message ? err.message : String(err)));
  process.exit(1);
});
