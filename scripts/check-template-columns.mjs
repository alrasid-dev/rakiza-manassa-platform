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
const [cols] = await db.query("SHOW COLUMNS FROM task_templates");
console.log("أعمدة task_templates: " + cols.map(r => r.Field).join(", "));
const [cnt] = await db.query("SELECT isActive, COUNT(*) AS c FROM task_templates WHERE unitId = 5 GROUP BY isActive");
console.log("unitId=5 عدّادات: " + JSON.stringify(cnt));
await db.end();
