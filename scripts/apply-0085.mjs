// scripts/apply-0085.mjs
// إعادة تطبيق migration 0085 (assistant_secretary enum + capabilities + targetUserId)
// على أي بيئة. يقرأ drizzle/0085_*.sql ويطبّقه يدويًا (لا drizzle-kit).
// الاستخدام:
//   node scripts/apply-0085.mjs          (dry-run — افتراضي، لا تغيير)
//   node scripts/apply-0085.mjs --apply  (تنفيذ فعلي)
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

const apply = process.argv.includes("--apply");
const rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || readEnvValue(path.resolve(".env"), "DATABASE_URL");
if (!rawUrl) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}
const url = new URL(rawUrl);
const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "rakiza";

const conn = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database,
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
  supportBigNumbers: true,
  bigNumberStrings: true,
});

const dir = path.resolve("drizzle");
const file = fs.readdirSync(dir).find((f) => f.startsWith("0085") && f.endsWith(".sql"));
if (!file) {
  console.error("لم يُعثر على ملف 0085_*.sql في drizzle/");
  await conn.end();
  process.exit(1);
}

const sql = fs.readFileSync(path.join(dir, file), "utf8");
const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

console.log("الملف:", file, "| عدد العبارات:", statements.length, "| الوضع:", apply ? "تنفيذ (--apply)" : "dry-run");

async function verify(label) {
  const [cols] = await conn.execute(
    "SELECT TABLE_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('court_role_assignments','permission_delegations') AND COLUMN_NAME = 'role' ORDER BY TABLE_NAME"
  );
  const [extra] = await conn.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'permission_delegations' AND COLUMN_NAME IN ('capabilities','targetUserId')"
  );
  const [ca] = await conn.execute("SELECT COUNT(*) AS c FROM court_role_assignments");
  const [pd] = await conn.execute("SELECT COUNT(*) AS c FROM permission_delegations");
  console.log("[" + label + "] role:", JSON.stringify(cols.map((c) => ({ t: c.TABLE_NAME, type: c.COLUMN_TYPE, nullable: c.IS_NULLABLE }))));
  console.log("[" + label + "] أعمدة إضافية:", extra.map((c) => c.COLUMN_NAME).join(",") || "(لا شيء)");
  console.log("[" + label + "] الصفوف: court_role_assignments=" + ca[0].c + ", permission_delegations=" + pd[0].c);
}

if (!apply) {
  console.log("\nعبارات ستُنفَّذ:");
  statements.forEach((s, i) => console.log("  [" + (i + 1) + "]", s.slice(0, 140) + (s.length > 140 ? "…" : "")));
  console.log("\nالحالة الحالية على DB:");
  await verify("dry-run");
  console.log("\n(لم يُنفَّذ شيء — شغّل مع --apply للتنفيذ.)");
  await conn.end();
  process.exit(0);
}

for (let i = 0; i < statements.length; i++) {
  try {
    await conn.execute(statements[i]);
    console.log("  ✓ عبارة", i + 1, "نُفِّذت");
  } catch (e) {
    console.error("  ✗ عبارة", i + 1, "فشلت:", e.code || "", e.message);
    console.error("توقّف — لم يُنفَّذ rollback.");
    await conn.end();
    process.exit(1);
  }
}
console.log("\nالحالة بعد التنفيذ:");
await verify("after");
await conn.end();
console.log("تم تطبيق", file, "بنجاح.");
