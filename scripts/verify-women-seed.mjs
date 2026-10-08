import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
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
const u = new URL(env("DATABASE_URL"));
const db = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true,
});
const [active] = await db.query("SELECT COUNT(*) AS c FROM task_templates WHERE unitId=5 AND isActive=1");
const [inactive] = await db.query("SELECT COUNT(*) AS c FROM task_templates WHERE unitId=5 AND isActive=0");
console.log(`نشط (متوقع 37): ${active[0].c} | معطَّل (متوقع 82): ${inactive[0].c}`);
const [dist] = await db.query(`SELECT p.fullName, COUNT(*) AS c FROM task_templates t JOIN person_profiles p ON p.id = t.defaultAssigneeProfileId WHERE t.unitId=5 AND t.isActive=1 GROUP BY p.id, p.fullName ORDER BY c DESC`);
console.log("\nتوزيع القوالب النشطة لكل موظفة:");
for (const r of dist) console.log(`${r.c} | ${r.fullName}`);
const [withStart] = await db.query("SELECT COUNT(*) AS c FROM task_templates WHERE unitId=5 AND isActive=1 AND startDate IS NOT NULL");
const [withEnd] = await db.query("SELECT COUNT(*) AS c FROM task_templates WHERE unitId=5 AND isActive=1 AND endDate IS NOT NULL");
const [specDays] = await db.query("SELECT COUNT(*) AS c FROM task_templates WHERE unitId=5 AND isActive=1 AND specificDays IS NOT NULL");
console.log(`\nبها startDate: ${withStart[0].c} | بها endDate: ${withEnd[0].c} | بها specificDays: ${specDays[0].c}`);
await db.end();
