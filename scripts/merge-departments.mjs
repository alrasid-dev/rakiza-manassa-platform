#!/usr/bin/env node
/**
 * scripts/merge-departments.mjs
 * دمج الأقسام التنظيمية المكررة (#4) — المرحلة 2.1.
 *
 * ينقل الموظفين والأدوار والمحادثات من الأقسام المكررة إلى الأقسام الأصلية،
 * ثم يحذف الأقسام المكررة. كل ذلك داخل معاملة (Transaction) واحدة:
 *   - إن فشل أي استعلام، يُتراجع تلقائياً ولا يتغير أي شيء.
 *
 * الاستخدام:
 *   node scripts/merge-departments.mjs            # تنفيذ فعلي (commit)
 *   node scripts/merge-departments.mjs --dry-run  # معاينة فقط (rollback، لا يُحفظ شيء)
 *
 * يقرأ DATABASE_URL من .env.production.local دون طباعة أي أسرار.
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const DRY_RUN = process.argv.includes("--dry-run");

// كل زوج: قسم مكرر (يُحذف) → قسم أصلي (يُبقى).
const MERGES = [
  { from: 60019, to: 60006, label: "التبليغ الالكتروني" },
  { from: 90004, to: 60007, label: "إدارة الإسناد القضائي" },
  { from: 90008, to: 60011, label: "إدارة الدعاوى والأحكام" },
  { from: 60022, to: 60010, label: "الباحثين" },
  { from: 90007, to: 60010, label: "الباحثين" },
  { from: 90009, to: 3,      label: "تسليم الأحكام" },
  { from: 150001, to: 3,     label: "تسليم الأحكام" },
  { from: 60020, to: 30002,  label: "الوثائق والمحفوظات" },
];

// الجداول التي تحمل عمود unitId ويُعاد توجيهها إلى القسم الأصلي.
const UPDATE_TABLES = ["person_profiles", "court_role_assignments", "internal_conversations"];
const DELETE_IDS = MERGES.map((m) => m.from);

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

async function main() {
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
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  console.log("Connected to " + database + " @ " + url.hostname + ":" + (url.port || 4000));
  if (DRY_RUN) console.log("*** DRY-RUN: سيُتراجع تلقائياً ولن يُحفظ أي تغيير ***");

  // تحقق أولي: الأقسام الأصلية موجودة فعلاً.
  const keepIds = [...new Set(MERGES.map((m) => m.to))];
  const [keepUnits] = await connection.query(
    "SELECT id, name FROM organization_units WHERE id IN (" + keepIds.map(() => "?").join(",") + ")",
    keepIds,
  );
  if (keepUnits.length !== keepIds.length) {
    console.error("خطأ: بعض الأقسام الأصلية غير موجودة في قاعدة البيانات. توقف.");
    process.exit(1);
  }
  console.log("\nالأقسام الأصلية (ستُبقى):");
  for (const u of keepUnits) console.log(`  - ${u.id} | ${u.name}`);

  await connection.beginTransaction();
  const report = { profiles: 0, roles: 0, conversations: 0, deleted: 0 };

  try {
    console.log("\n--- النقل ---");
    for (const merge of MERGES) {
      for (const table of UPDATE_TABLES) {
        const [res] = await connection.query(
          `UPDATE \`${table}\` SET unitId = ? WHERE unitId = ?`,
          [merge.to, merge.from],
        );
        if (res.affectedRows > 0) {
          console.log(`  ${table}: ${merge.from} → ${merge.to} (${res.affectedRows} صف) [${merge.label}]`);
          if (table === "person_profiles") report.profiles += res.affectedRows;
          else if (table === "court_role_assignments") report.roles += res.affectedRows;
          else if (table === "internal_conversations") report.conversations += res.affectedRows;
        }
      }
    }

    // حذف الأقسام المكررة.
    const [del] = await connection.query(
      "DELETE FROM organization_units WHERE id IN (" + DELETE_IDS.map(() => "?").join(",") + ")",
      DELETE_IDS,
    );
    report.deleted = del.affectedRows;
    console.log(`\nحذف الأقسام المكررة: ${del.affectedRows} قسم.`);

    if (DRY_RUN) {
      await connection.rollback();
      console.log("\n[DRY-RUN] تم التراجع — لم يُحفظ أي تغيير.");
    } else {
      await connection.commit();
      console.log("\nتم الالتزام (commit) بنجاح.");
    }

    console.log("\n=== التقرير ===");
    console.log(`نقل موظفين: ${report.profiles}`);
    console.log(`نقل أدوار: ${report.roles}`);
    console.log(`نقل محادثات: ${report.conversations}`);
    console.log(`حذف أقسام: ${report.deleted}`);
  } catch (err) {
    await connection.rollback();
    console.error("فشل التنفيذ — تم التراجع تلقائياً: " + redact(err && err.message ? err.message : String(err)));
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("خطأ: " + redact(err && err.message ? err.message : String(err)));
  process.exit(1);
});
