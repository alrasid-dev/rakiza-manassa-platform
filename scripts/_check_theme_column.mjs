// scripts/_check_theme_column.mjs
// فحص (قراءة فقط) لعمود theme في جدول user_work_preferences.
// يقرأ DATABASE_URL من .env.production.local دون طباعة أي أسرار، ولا يعدّل شيئاً.

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

let rawUrl = "";

function env(key) {
  const filePath = path.resolve(".env.production.local");
  if (!fs.existsSync(filePath)) return null;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("=");
    if (e === -1) continue;
    if (t.slice(0, e).trim() !== key) continue;
    let v = t.slice(e + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

// يزيل أي كلمة مرور أو رابط كامل من رسائل الأخطاء قبل طباعتها.
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

async function main() {
  rawUrl = env("DATABASE_URL") || "";
  if (!rawUrl) {
    console.error("DATABASE_URL غير موجود في .env.production.local");
    process.exit(1);
  }

  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";
  const db = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  console.log("متصل بـ " + database + " @ " + url.hostname + ":" + (url.port || 4000));
  console.log("");

  // 1) هيكل الجدول
  const [cols] = await db.query("SHOW COLUMNS FROM user_work_preferences");
  const colNames = cols.map((r) => r.Field);
  const hasTheme = colNames.includes("theme");
  console.log("أعمدة user_work_preferences (" + colNames.length + "): " + colNames.join(", "));
  console.log(hasTheme ? "العمود theme موجود ✅" : "العمود theme مفقود ❌");
  console.log("");

  // 2) إجمالي الصفوف
  const [totalRows] = await db.query("SELECT COUNT(*) AS c FROM user_work_preferences");
  const total = Number(totalRows[0].c);
  console.log("إجمالي الصفوف: " + total);

  // 3) توزيع القيم (فقط إن وُجد العمود)
  if (hasTheme) {
    const [dist] = await db.query("SELECT theme, COUNT(*) AS c FROM user_work_preferences GROUP BY theme");
    const counts = { NULL: 0, light: 0, dark: 0 };
    const others = {};
    for (const row of dist) {
      const key = row.theme == null ? "NULL" : String(row.theme);
      const n = Number(row.c);
      if (key === "NULL" || key === "light" || key === "dark") counts[key] = n;
      else others[key] = (others[key] || 0) + n;
    }
    console.log("التوزيع: NULL: " + counts.NULL + ", light: " + counts.light + ", dark: " + counts.dark);
    const otherKeys = Object.keys(others);
    if (otherKeys.length) {
      console.log("قيم أخرى: " + JSON.stringify(others));
    }
  }

  await db.end();
}

main().catch((err) => {
  console.error("فشل الفحص: " + redact(err && err.message ? err.message : String(err)));
  process.exit(1);
});
