// scripts/add-disciplinary-team-category.mjs
// إضافة قيمة "disciplinary_team" إلى enum notifications.category.
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
  await c.query("ALTER TABLE notifications MODIFY COLUMN category ENUM('trainee_due_soon','task_due','delay_alert','access_request','support_ticket','attendance_confirmation','security_alert','performance_recommendation','chat_message','report_review','correspondence_update','disciplinary_team') NOT NULL");
  console.log("ALTER OK");
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
