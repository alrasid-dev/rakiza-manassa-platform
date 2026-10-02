// scripts/notify-pending-team-disciplinary.mjs
// إنشاء إشعارات للمدير المباشر بالمساءلات المعلقة (بدون نقل currentRole).
// الوضع الافتراضي: dry-run. للتنفيذ: node scripts/notify-pending-team-disciplinary.mjs --apply

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

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

const APPLY = process.argv.includes("--apply");

async function main() {
  const rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || "";
  if (!rawUrl) { console.error("DATABASE_URL not found"); process.exit(1); }
  const url = new URL(rawUrl);
  const db = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";
  const c = await mysql.createConnection({
    host: url.hostname, port: Number(url.port || 4000), user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password), database: db,
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  });

  const [rows] = await c.query(
    `SELECT ar.id, p.fullName AS employee, p.directManagerProfileId, ar.requestNote
     FROM approval_requests ar JOIN person_profiles p ON p.id = ar.entityId
     WHERE ar.entityType = 'disciplinary_action' AND ar.status = 'pending'`
  );

  const notifications = rows
    .filter(r => r.directManagerProfileId != null)
    .map(r => ({
      profileId: r.directManagerProfileId,
      category: "disciplinary_team",
      title: "مساءلة معلقة لموظفة في قسمك",
      body: `${r.employee}: ${r.requestNote}`,
      dedupeKey: `disciplinary-team-pending-${r.id}`,
    }));

  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", count: notifications.length, notifications }, null, 2));

  if (APPLY) {
    let created = 0;
    for (const n of notifications) {
      await c.query(
        "INSERT INTO notifications (profileId, category, title, body, dedupeKey, sentAt) VALUES (?, ?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body)",
        [n.profileId, n.category, n.title, n.body, n.dedupeKey]
      );
      created += 1;
    }
    console.log(JSON.stringify({ applied: true, created }));
  }

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
