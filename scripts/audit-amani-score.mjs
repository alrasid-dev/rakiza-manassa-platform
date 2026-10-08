// scripts/audit-amani-score.mjs
// تدقيق أرقام الموظف (افتراضياً profileId=30003) لشهر هجري معيّن (افتراضياً 1448-04):
// يعرض أحداث score_events (نقاط + أسباب) ويقارنها بـ monthly_balances.
// قراءة فقط — لا يعدّل أي بيانات. يقرأ DATABASE_URL من .env.production.local دون طباعة أسرار.

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const PROFILE_ID = Number(process.env.PROFILE_ID || 30003);
const HIJRI_MONTH = process.env.HIJRI_MONTH || "1448-04";

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

function hijriMonthKey(date) {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "numeric" }).formatToParts(date);
  const year = parts.find(p => p.type === "year")?.value ?? "0";
  const month = (parts.find(p => p.type === "month")?.value ?? "0").padStart(2, "0");
  return `${year}-${month}`;
}

function redact(rawUrl, message) {
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
  const rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
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

  try {
    const [events] = await connection.query(
      "SELECT id, taskId, delayRecordId, points, reason, createdByUserId, createdAt FROM score_events WHERE profileId = ? ORDER BY createdAt ASC",
      [PROFILE_ID],
    );

    const [balances] = await connection.query(
      "SELECT hijriMonthKey, positiveMinutes, negativeMinutes, excuseMinutes, penaltyMinutes, netMinutes, isSettled FROM monthly_balances WHERE profileId = ? AND hijriMonthKey = ?",
      [PROFILE_ID, HIJRI_MONTH],
    );

    const monthEvents = events.filter(e => hijriMonthKey(new Date(e.createdAt)) === HIJRI_MONTH);
    let positive = 0;
    let negative = 0;
    for (const e of monthEvents) {
      if (Number(e.points) > 0) positive += Number(e.points);
      else negative += Number(e.points);
    }

    console.log(`\n=== تدقيق نقاط profileId=${PROFILE_ID} لشهر ${HIJRI_MONTH} ===\n`);

    console.log(`أحداث score_events ضمن الشهر: ${monthEvents.length}`);
    for (const e of monthEvents) {
      const pts = Number(e.points);
      const sign = pts >= 0 ? "+" : "";
      console.log(
        `  ${sign}${pts}  |  ${e.reason}  |  ${new Date(e.createdAt).toISOString()}  |  taskId=${e.taskId ?? "—"} delayRecordId=${e.delayRecordId ?? "—"}`,
      );
    }

    console.log(`\nالمجاميع:`);
    console.log(`  موجب (إنجازات): +${positive}`);
    console.log(`  سالب (تأخيرات/خصومات): ${negative}`);
    console.log(`  الصافي (أحداث النقاط): ${positive + negative}`);

    console.log(`\nmonthly_balances (${HIJRI_MONTH}):`);
    if (balances.length === 0) {
      console.log("  لا يوجد سجل رصيد شهري لهذا الشهر.");
    } else {
      for (const b of balances) {
        console.log(
          `  netMinutes=${b.netMinutes}  positiveMinutes=${b.positiveMinutes}  negativeMinutes=${b.negativeMinutes}  penaltyMinutes=${b.penaltyMinutes}  excuseMinutes=${b.excuseMinutes}  isSettled=${b.isSettled}`,
        );
      }
    }

    console.log("\nملاحظة: نقاط score_events تُحسب بالنقاط، بينما monthly_balances تُخزَّن بالدقائق — وحدتان مختلفتان.");
  } finally {
    await connection.end();
  }
}

main().catch(err => {
  console.error("audit failed: " + redact("", err && err.message ? err.message : String(err)));
  process.exit(1);
});
