#!/usr/bin/env node
/**
 * scripts/reclassify-task-templates.mjs
 * يصنّف قوالب المهام الـ29 بحسب كلمة التكرار في العنوان.
 *   يومي → daily | أسبوعي/اسبوعي وشهري → weekly | شهري → monthly
 *   ربع سنوي → quarterly | غير واضح → custom (يُترك كما هو).
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) return null;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

function classify(title) {
  const t = (title || "");
  if (/ربع سنوي|ربع سنة|quarterly|كل ثلاثة أشهر/.test(t)) return "quarterly";
  if (/اسبوعي وشهري|أسبوعي وشهري|اسبوعي شهري|أسبوعي شهري/.test(t)) return "weekly";
  if (/شهري|monthly/.test(t)) return "monthly";
  if (/اسبوعي|أسبوعي|weekly/.test(t)) return "weekly";
  if (/يومي|يوميا|يومياً|daily/.test(t)) return "daily";
  return "custom";
}

const raw = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || process.env.DATABASE_URL;
if (!raw) { console.error("DATABASE_URL غير موجود"); process.exit(1); }
const url = new URL(raw);
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
});

const [rows] = await db.query("SELECT id, title, frequency FROM task_templates ORDER BY id");
const changes = [];
for (const r of rows) {
  const next = classify(r.title);
  if (next !== r.frequency) {
    await db.query("UPDATE task_templates SET frequency=? WHERE id=?", [next, r.id]);
    changes.push({ id: r.id, title: r.title, from: r.frequency, to: next });
  }
}

const [summaryRows] = await db.query("SELECT frequency, COUNT(*) AS n FROM task_templates GROUP BY frequency ORDER BY frequency");
const summary = {};
for (const s of summaryRows) summary[s.frequency] = Number(s.n);

console.log(JSON.stringify({ summary, changed: changes.length, changes }, null, 2));
await db.end();
