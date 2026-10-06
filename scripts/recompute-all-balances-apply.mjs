// scripts/recompute-all-balances-apply.mjs
// تطبيق إعادة حساب الرصيد (النمط التاريخي) — UPDATE + audit_log لكل صف، في transaction.
// المعادلة: net = positive − negative − penalty + excuse؛ remote (أو بصمة دخول + in_person) معفى.
import fs from "node:fs";
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

function hijriMonthKey(date) {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "numeric" }).formatToParts(date);
  const year = parts.find(p => p.type === "year")?.value ?? "0";
  const month = (parts.find(p => p.type === "month")?.value ?? "0").padStart(2, "0");
  return `${year}-${month}`;
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

const [balances] = await db.query(
  `SELECT mb.id, mb.profileId, mb.hijriMonthKey, mb.positiveMinutes, mb.negativeMinutes,
          mb.excuseMinutes, COALESCE(mb.penaltyMinutes, 0) AS penaltyMinutes, mb.netMinutes,
          p.attendanceMode
   FROM monthly_balances mb LEFT JOIN person_profiles p ON p.id = mb.profileId
   ORDER BY mb.profileId, mb.hijriMonthKey`
);

console.log("=== snapshot قبل التعديل ===");
for (const b of balances) console.log(`id=${b.id} profileId=${b.profileId} month=${b.hijriMonthKey} net=${b.netMinutes}`);

let updated = 0, skipped = 0, failed = 0;
for (const b of balances) {
  const mode = b.attendanceMode ?? "in_person";
  const [att] = await db.query(
    "SELECT recordDate, checkInAt, positiveMinutes, negativeMinutes, COALESCE(penaltyMinutes, 0) AS penaltyMinutes FROM attendance_records WHERE profileId = ?",
    [b.profileId],
  );
  const monthAtt = att.filter(r => hijriMonthKey(new Date(r.recordDate)) === b.hijriMonthKey);
  let positive = 0, negative = 0, penalty = 0;
  for (const r of monthAtt) {
    positive += Number(r.positiveMinutes || 0);
    const histMode = (mode === "in_person" && r.checkInAt) ? "remote" : mode;
    if (histMode !== "remote") {
      negative += Number(r.negativeMinutes || 0);
      penalty += Number(r.penaltyMinutes || 0);
    }
  }
  const [lv] = await db.query(
    "SELECT id FROM leave_requests WHERE profileId = ? AND hijriMonthKey = ? AND requestType = 'permission' AND status = 'approved'",
    [b.profileId, b.hijriMonthKey],
  );
  const excuse = lv.length * 240;
  const netNew = positive - negative - penalty + excuse;

  const oldNet = Number(b.netMinutes || 0);
  if (netNew === oldNet && Number(b.negativeMinutes||0) === negative && Number(b.penaltyMinutes||0) === penalty && Number(b.positiveMinutes||0) === positive && Number(b.excuseMinutes||0) === excuse) {
    console.log(`[SKIP] profileId=${b.profileId} month=${b.hijriMonthKey} net=${oldNet}`);
    skipped++;
    continue;
  }

  const oldVals = { positive: Number(b.positiveMinutes||0), negative: Number(b.negativeMinutes||0), penalty: Number(b.penaltyMinutes||0), excuse: Number(b.excuseMinutes||0), net: oldNet };
  const newVals = { positive, negative, penalty, excuse, net: netNew };

  try {
    await db.beginTransaction();
    await db.query(
      "UPDATE monthly_balances SET positiveMinutes=?, negativeMinutes=?, excuseMinutes=?, penaltyMinutes=?, netMinutes=?, lastComputedAt=NOW() WHERE id=?",
      [positive, negative, excuse, penalty, netNew, b.id],
    );
    await db.query(
      "INSERT INTO audit_logs (actorUserId, action, entityType, entityId, metadata, createdAt) VALUES (0, 'balance.recomputed', 'monthly_balance', ?, ?, NOW())",
      [b.id, JSON.stringify({ profileId: b.profileId, month: b.hijriMonthKey, old: oldVals, new: newVals, reason: "historical_mode_recompute" })],
    );
    await db.commit();
    console.log(`[OK] profileId=${b.profileId} month=${b.hijriMonthKey}: net ${oldNet} -> ${netNew}`);
    updated++;
  } catch (e) {
    await db.rollback();
    console.log(`[FAIL] profileId=${b.profileId} month=${b.hijriMonthKey}: ${e.message}`);
    failed++;
  }
}

console.log(`\n=== النتيجة: updated=${updated} skipped=${skipped} failed=${failed} ===`);
await db.end();
