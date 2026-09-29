// scripts/finalize-henadi-daily.mjs — إكمال حساب هنادي + تحويل مهام القسم النسائي (14) إلى يومية
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
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 4000), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "rakiza", ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" }, supportBigNumbers: true, bigNumberStrings: true });

// 1) تصحيح هنادي
const [hen] = await db.query("UPDATE person_profiles SET jobTitle = 'موظف', unitId = 5, status = 'active', personType = 'administrative' WHERE email = 'haldosary@moj.gov.sa'");
console.log("هنادي person_profiles updated:", hen.affectedRows);

// 2) تحويل المهام الـ14 (غير المؤرشفة) إلى يومية
const [t] = await db.query("UPDATE tasks SET recurrence = 'daily', recurrenceInterval = 1 WHERE unitId = 5 AND archivedAt IS NULL");
console.log("tasks -> daily:", t.affectedRows);

// 3) تحويل القوالب الـ14 الجديدة فقط (60001+) إلى يومية
const [tp] = await db.query("UPDATE task_templates SET frequency = 'daily', intervalDays = 1, workdayOnly = 1, isActive = 1 WHERE unitId = 5 AND id >= 60001");
console.log("task_templates -> daily (60001+):", tp.affectedRows);

await db.end();
