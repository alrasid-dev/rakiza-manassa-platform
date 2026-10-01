// scripts/clean-duplicate-attendance.mjs
// يبحث عن سجلات حضور مكررة (نفس profileId + نفس اليوم UTC)، يحتفظ بالأقدم (أصغر id)،
// يدمج checkOutAt/positiveMinutes/negativeMinutes المفقودة في الأقدم، ثم يؤرشف الباقي في
// attendance_records_archive ويحذفها من attendance_records (لا حذف دائم — أرشفة فقط).
//
// الاستخدام:
//   node scripts/clean-duplicate-attendance.mjs            -> معاينة فقط (DRY-RUN)
//   node scripts/clean-duplicate-attendance.mjs --apply    -> تنفيذ الأرشفة والدمج والحذف
//
// يقرأ DATABASE_URL من .env.production.local دون طباعة أي أسرار.

import fs from "node:fs";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

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

// مفتاح اليوم UTC مطابق لاصطلاح الكود (Date.UTC(y, m, d)).
function utcDayKey(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

let rawUrl = "";

async function main() {
  rawUrl = readEnvValue(".env.production.local", "DATABASE_URL");
  if (!rawUrl) {
    console.error("DATABASE_URL not found in .env.production.local");
    process.exit(1);
  }

  const u = new URL(rawUrl);
  const database = decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza";
  const conn = await mysql.createConnection({
    host: u.hostname,
    port: Number(u.port || 4000),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    ssl: { rejectUnauthorized: false },
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  try {
    // 1) إنشاء جدول الأرشيف (لا تُلمس بنية جدول الحضور الأصلي).
    await conn.query("CREATE TABLE IF NOT EXISTS attendance_records_archive LIKE attendance_records");
    for (const [col, ddl] of [
      ["archivedAt", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
      ["archiveReason", "VARCHAR(100)"],
    ]) {
      try {
        await conn.query(`ALTER TABLE attendance_records_archive ADD COLUMN \`${col}\` ${ddl}`);
      } catch (err) {
        if (!/duplicate column/i.test(err && err.message ? err.message : String(err))) throw err;
      }
    }

    // 2) جلب كل السجلات وتجميعها حسب (profileId + اليوم UTC) في JS لتفادي اختلاف منطقة زمن الجلسة.
    const [allRows] = await conn.query("SELECT * FROM attendance_records ORDER BY id ASC");
    const groups = new Map();
    for (const row of allRows) {
      const key = `${row.profileId}|${utcDayKey(row.recordDate)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const duplicateGroups = [...groups.values()].filter(rows => rows.length > 1);

    // 3) تجهيز القرار: الاحتفاظ بالأقدم + دمج الحقول المفقودة + تجميع ما سيؤرشف.
    const keepPlans = [];   // { keepId, checkOutAt, positiveMinutes, negativeMinutes }
    const archiveIds = [];  // ids المراد أرشفتها وحذفها
    for (const rows of duplicateGroups) {
      const keep = rows[0]; // مرتبة تصاعدياً، الأقدم = أصغر id
      let checkOutAt = keep.checkOutAt;
      let positiveMinutes = Number(keep.positiveMinutes ?? 0);
      let negativeMinutes = Number(keep.negativeMinutes ?? 0);
      for (const dup of rows.slice(1)) {
        if (!checkOutAt && dup.checkOutAt) checkOutAt = dup.checkOutAt;
        if (!positiveMinutes && Number(dup.positiveMinutes ?? 0)) positiveMinutes = Number(dup.positiveMinutes);
        if (!negativeMinutes && Number(dup.negativeMinutes ?? 0)) negativeMinutes = Number(dup.negativeMinutes);
        archiveIds.push(dup.id);
      }
      keepPlans.push({ keepId: keep.id, checkOutAt, positiveMinutes, negativeMinutes });
    }

    const totalRowsInGroups = duplicateGroups.reduce((s, rows) => s + rows.length, 0);
    const keptRows = duplicateGroups.length;

    console.log("=====================================================");
    console.log(`مجموعات مكررة: ${duplicateGroups.length}`);
    console.log(`إجمالي الصفوف داخل المجموعات: ${totalRowsInGroups}`);
    console.log(`الصفوف المبقاة (الأقدم): ${keptRows}`);
    console.log(`الصفوف المراد أرشفتها وحذفها: ${archiveIds.length}`);
    console.log("-----------------------------------------------------");
    for (const rows of duplicateGroups) {
      console.log(`  profileId=${rows[0].profileId}  اليوم=${utcDayKey(rows[0].recordDate)}  العدد=${rows.length}  الأقدم(id)=${rows[0].id}  ids=${rows.map(r => r.id).join(",")}`);
    }
    console.log("=====================================================");

    if (!APPLY) {
      console.log("\n[DRY-RUN] لم يُنفَّذ أي تغيير. أعد التشغيل مع --apply للأرشفة والحذف.");
      return;
    }

    // 4) التنفيذ ضمن معاملة واحدة: دمج -> أرشفة -> حذف.
    await conn.beginTransaction();
    try {
      for (const p of keepPlans) {
        await conn.query(
          "UPDATE attendance_records SET checkOutAt = ?, positiveMinutes = ?, negativeMinutes = ?, updatedAt = NOW() WHERE id = ?",
          [p.checkOutAt, p.positiveMinutes, p.negativeMinutes, p.keepId]
        );
      }
      for (const id of archiveIds) {
        await conn.query(
          "INSERT INTO attendance_records_archive SELECT t.*, NOW(), ? FROM attendance_records t WHERE t.id = ?",
          ["duplicate_attendance_record", id]
        );
        await conn.query("DELETE FROM attendance_records WHERE id = ?", [id]);
      }
      await conn.commit();
      console.log(`\nتمت الأرشفة بنجاح: أُرشف ${archiveIds.length} سجلاً مكرراً وحُذف من الجدول الأصلي.`);
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Cleanup failed: " + redact(err && err.message ? err.message : String(err)));
  process.exit(1);
});
