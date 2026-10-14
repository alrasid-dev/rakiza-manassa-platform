// توحيد recordDate في attendance_records إلى توقيت الرياض (21:00Z)
// الاستخدام: node scripts/attendance-recorddate-unify.mjs inspect|conflicts|update|verify|audit
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function readDbUrl() {
  for (const name of [".env.local", ".env"]) {
    const p = path.resolve(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (m) {
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (v) return v;
      }
    }
  }
  return process.env.DATABASE_URL || "";
}

const url = readDbUrl();
if (!url) {
  console.error("لم يتم العثور على DATABASE_URL");
  process.exit(1);
}

const conn = await mysql.createConnection({ uri: url, timezone: "Z" });
// توحيد جلسة SQL على UTC (مطابق لسلوك التطبيق timezone: "Z")
await conn.query("SET time_zone = '+00:00'");

const mode = process.argv[2] || "inspect";

function show(value) {
  console.log(JSON.stringify(value, null, 2));
}
async function q(sql, params = []) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

try {
  if (mode === "inspect") {
    console.log("=== أ. توزيع HOUR(recordDate) ===");
    show(await q(
      "SELECT HOUR(recordDate) AS h, COUNT(*) AS cnt FROM attendance_records GROUP BY HOUR(recordDate) ORDER BY h"
    ));
    console.log("=== ب. عدد السجلات القديمة (HOUR=0) ===");
    show(await q(
      "SELECT COUNT(*) AS cnt FROM attendance_records WHERE HOUR(recordDate) = 0"
    ));
    console.log("=== ج. فحص التعارضات (profileId + DATE) ===");
    show(await q(
      "SELECT profileId, DATE(recordDate) AS d, COUNT(*) AS cnt FROM attendance_records GROUP BY profileId, DATE(recordDate) HAVING COUNT(*) > 1 ORDER BY cnt DESC, profileId, d LIMIT 200"
    ));
    console.log("=== ج2. تعارض فريد فِعلي (قديم سيتصادم مع موجود بعد -3h) ===");
    show(await q(
      "SELECT a.id AS old_id, a.profileId, a.recordDate AS old_recordDate, DATE_SUB(a.recordDate, INTERVAL 3 HOUR) AS new_recordDate, b.id AS colliding_id FROM attendance_records a JOIN attendance_records b ON b.profileId = a.profileId AND b.recordDate = DATE_SUB(a.recordDate, INTERVAL 3 HOUR) WHERE HOUR(a.recordDate) = 0 LIMIT 200"
    ));
    console.log("=== د. عينات من السجلات القديمة ===");
    show(await q(
      "SELECT id, profileId, recordDate FROM attendance_records WHERE HOUR(recordDate) = 0 ORDER BY id LIMIT 10"
    ));
  } else if (mode === "conflicts") {
    const conflicts = await q(
      "SELECT profileId, DATE(recordDate) AS d, COUNT(*) AS cnt FROM attendance_records GROUP BY profileId, DATE(recordDate) HAVING COUNT(*) > 1"
    );
    const real = await q(
      "SELECT a.id AS old_id, a.profileId, a.recordDate AS old_recordDate, b.id AS colliding_id FROM attendance_records a JOIN attendance_records b ON b.profileId = a.profileId AND b.recordDate = DATE_SUB(a.recordDate, INTERVAL 3 HOUR) WHERE HOUR(a.recordDate) = 0"
    );
    show({ conflicts, realCollisions: real });
  } else if (mode === "update") {
    const result = await q(
      "UPDATE attendance_records SET recordDate = DATE_SUB(recordDate, INTERVAL 3 HOUR), updatedAt = NOW() WHERE HOUR(recordDate) = 0 AND recordDate < '2026-10-14T00:00:00Z'"
    );
    show({ affectedRows: result.affectedRows, changedRows: result.changedRows });
  } else if (mode === "weird") {
    show(await q(
      "SELECT id, profileId, recordDate, status, checkInAt, checkOutAt, createdByUserId, createdAt FROM attendance_records WHERE HOUR(recordDate) NOT IN (0, 21) ORDER BY recordDate, id"
    ));
  } else if (mode === "oldbreakdown") {
    console.log("=== توزيع تواريخ السجلات القديمة (HOUR=0) ===");
    show(await q(
      "SELECT DATE(recordDate) AS d, COUNT(*) AS cnt, MIN(id) AS min_id, MAX(id) AS max_id FROM attendance_records WHERE HOUR(recordDate) = 0 GROUP BY DATE(recordDate) ORDER BY d"
    ));
    console.log("=== أقصى recordDate للسجلات القديمة ===");
    show(await q(
      "SELECT MAX(recordDate) AS max_recordDate, MIN(recordDate) AS min_recordDate FROM attendance_records WHERE HOUR(recordDate) = 0"
    ));
    console.log("=== عدد القديمة عند/بعد القطع 2026-10-14 ===");
    show(await q(
      "SELECT COUNT(*) AS cnt FROM attendance_records WHERE HOUR(recordDate) = 0 AND recordDate >= '2026-10-14T00:00:00Z'"
    ));
  } else if (mode === "detail") {
    // تفاصيل التعارضات: كل أعمدة سجلات الموظفين الذين لهم أكثر من سجل في نفس اليوم
    show(await q(
      "SELECT * FROM attendance_records WHERE (profileId, DATE(recordDate)) IN (SELECT profileId, DATE(recordDate) FROM attendance_records GROUP BY profileId, DATE(recordDate) HAVING COUNT(*) > 1) ORDER BY profileId, recordDate"
    ));
  } else if (mode === "verify") {
    console.log("=== توزيع HOUR بعد ===");
    show(await q(
      "SELECT HOUR(recordDate) AS h, COUNT(*) AS cnt FROM attendance_records GROUP BY HOUR(recordDate) ORDER BY h"
    ));
    console.log("=== عينات ===");
    show(await q(
      "SELECT id, profileId, recordDate FROM attendance_records WHERE id IN (330001, 360007, 390005, 390007)"
    ));
  } else if (mode === "fix-legacy") {
    const ids = "30001, 30002, 30005, 30006, 30007, 30010, 30013, 30028";

    console.log("=== قبل: السجلات الثمانية ===");
    show(await q(`SELECT id, profileId, recordDate FROM attendance_records WHERE id IN (${ids}) ORDER BY id`));

    const result = await q(
      `UPDATE attendance_records SET recordDate = '2026-09-30T21:00:00Z', updatedAt = NOW() WHERE id IN (${ids})`
    );
    console.log("=== UPDATE: affectedRows ===");
    show({ affectedRows: result.affectedRows, changedRows: result.changedRows });

    console.log("=== بعد: السجلات الثمانية ===");
    show(await q(`SELECT id, profileId, recordDate FROM attendance_records WHERE id IN (${ids}) ORDER BY id`));

    console.log("=== تحقق: هل كلها 21:00Z؟ ===");
    show(await q(
      `SELECT COUNT(*) AS total, SUM(recordDate = '2026-09-30T21:00:00Z') AS at_21z FROM attendance_records WHERE id IN (${ids})`
    ));

    if (result.affectedRows === 8) {
      const metadata = JSON.stringify({ affectedRows: result.affectedRows, reason: "fix legacy 1 Oct records" });
      const ins = await q(
        "INSERT INTO audit_logs (actorUserId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, ?, ?, ?, NOW())",
        [1, "attendance.recordDate_unified_legacy", "attendance_records", 0, metadata]
      );
      console.log("=== audit log ===");
      show({ insertId: ins.insertId, metadata: JSON.parse(metadata) });
    } else {
      console.log(`WARNING: affectedRows != 8 (الفعلية ${result.affectedRows}) — لم يُكتب audit log`);
    }
  } else if (mode === "review-weird") {
    console.log("=== 9 سجلات شاذة (مع الاسم) ===");
    show(await q(
      "SELECT a.id, a.profileId, p.fullName, a.recordDate, a.checkInAt, a.checkOutAt, a.status, a.createdByUserId, a.createdAt FROM attendance_records a LEFT JOIN person_profiles p ON p.id = a.profileId WHERE HOUR(a.recordDate) NOT IN (0, 21) ORDER BY a.recordDate DESC"
    ));
    console.log("=== فحص التكرار (سجل مرساة لنفس اليوم السعودي) ===");
    show(await q(
      "SELECT w.id AS weird_id, w.profileId, w.recordDate AS weird_recordDate, d.id AS dup_id, d.recordDate AS dup_recordDate, d.status AS dup_status FROM attendance_records w LEFT JOIN attendance_records d ON d.profileId = w.profileId AND HOUR(d.recordDate) IN (0, 21) AND DATE(d.recordDate) = DATE_SUB(DATE(w.recordDate), INTERVAL 1 DAY) WHERE HOUR(w.recordDate) NOT IN (0, 21) ORDER BY w.recordDate DESC, d.recordDate"
    ));
  } else if (mode === "run") {
    console.log("=== قبل: توزيع HOUR(recordDate) ===");
    show(await q("SELECT HOUR(recordDate) AS h, COUNT(*) AS cnt FROM attendance_records GROUP BY HOUR(recordDate) ORDER BY h"));

    const result = await q(
      "UPDATE attendance_records SET recordDate = DATE_SUB(recordDate, INTERVAL 3 HOUR), updatedAt = NOW() WHERE HOUR(recordDate) = 0 AND recordDate < '2026-10-14T00:00:00Z'"
    );
    console.log("=== UPDATE: affectedRows ===");
    show({ affectedRows: result.affectedRows, changedRows: result.changedRows });

    console.log("=== بعد: توزيع HOUR(recordDate) ===");
    show(await q("SELECT HOUR(recordDate) AS h, COUNT(*) AS cnt FROM attendance_records GROUP BY HOUR(recordDate) ORDER BY h"));

    console.log("=== تحقق: سجلات الحالات الست (قديم -> 12-10 21:00Z، جديد -> 13-10 21:00Z) ===");
    show(await q(
      "SELECT id, profileId, recordDate FROM attendance_records WHERE id IN (360007,360008,360006,360002,360005,360003,390005,420001,390003,390002,390006,390001) ORDER BY profileId, recordDate"
    ));

    console.log("=== تحقق: هل بقي أي تعارض (profileId + DATE)؟ ===");
    show(await q(
      "SELECT profileId, DATE(recordDate) AS d, COUNT(*) AS cnt FROM attendance_records GROUP BY profileId, DATE(recordDate) HAVING COUNT(*) > 1"
    ));

    if (result.affectedRows === 61) {
      const metadata = JSON.stringify({ affectedRows: result.affectedRows, reason: "unify UTC to Riyadh midnight", conflicts_resolved: 6 });
      const ins = await q(
        "INSERT INTO audit_logs (actorUserId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, ?, ?, ?, NOW())",
        [1, "attendance.recordDate_unified", "attendance_records", 0, metadata]
      );
      console.log("=== audit log ===");
      show({ insertId: ins.insertId, metadata: JSON.parse(metadata) });
    } else {
      console.log(`WARNING: affectedRows != 61 (الفعلية ${result.affectedRows}) — لم يُكتب audit log`);
    }
  } else if (mode === "audit") {
    const metadata = JSON.stringify({ affectedRows: Number(process.env.AFFECTED_ROWS || 0), reason: "توحيد recordDate إلى توقيت الرياض (00:00Z -> 21:00Z)" });
    const result = await q(
      "INSERT INTO audit_logs (actorUserId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, ?, ?, ?, NOW())",
      [1, "attendance.recordDate_unified", "attendance_records", 0, metadata]
    );
    show({ insertId: result.insertId });
  } else {
    console.error("وضع غير معروف:", mode);
  }
} finally {
  await conn.end();
}
