// scripts/migrate-delegation-capabilities.mjs
// المرحلة 8-ب: تعبئة عمود capabilities لصفوف permission_delegations الحالية.
// لكل صف capabilities = NULL و role موجود: capabilities = {mode:"specific", capabilities: ROLE_CAPABILITIES[role]} و targetUserId = NULL.
// الاستخدام (يتطلب tsx لاستيراد shared/role-capabilities.ts — مصدر الحقيقة الوحيد):
//   npx tsx scripts/migrate-delegation-capabilities.mjs          (dry-run — افتراضي)
//   npx tsx scripts/migrate-delegation-capabilities.mjs --apply  (تنفيذ فعلي)
// ⚠️ لا تُشغَّل قبل تطبيق migration المرحلة 8 (عمود capabilities غير موجود بعد).
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
import { ROLE_CAPABILITIES } from "../shared/role-capabilities.ts";

function env(name) {
  for (const f of [".env.production.local", ".env"]) {
    try {
      const m = readFileSync(f, "utf8").match(new RegExp("^" + name + "=(.*)$", "m"));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch {}
  }
  return undefined;
}

const apply = process.argv.includes("--apply");
const url = env("DATABASE_URL");
if (!url) {
  console.error("DATABASE_URL غير مضبوط");
  process.exit(1);
}

const conn = await mysql.createConnection(url);
const [rows] = await conn.execute("SELECT id, role, capabilities FROM permission_delegations");

let toUpdate = 0;
let roleNull = 0;
let unknownRole = 0;
const updates = [];

for (const row of rows) {
  if (row.capabilities !== null && row.capabilities !== undefined) continue; // معبّأ سابقًا
  if (row.role === null || row.role === undefined) { roleNull++; continue; } // لا دور مصدر
  const caps = ROLE_CAPABILITIES[row.role];
  if (!caps) { unknownRole++; console.warn("دور غير معروف:", row.id, row.role); continue; }
  toUpdate++;
  updates.push({ id: row.id, role: row.role, capabilities: JSON.stringify({ mode: "specific", capabilities: caps }) });
}

console.log("الوضع:", apply ? "تنفيذ فعلي (--apply)" : "dry-run");
console.log("إجمالي الصفوف:", rows.length);
console.log("صفوف ستُحدَّث (capabilities NULL + role موجود):", toUpdate);
console.log("صفوف role NULL (تُتجاهل — لا دور مصدر):", roleNull);
console.log("صفوف بدور غير معروف:", unknownRole);

if (!apply) {
  console.log("\nمعاينة التحديثات:");
  for (const u of updates) {
    console.log(`  id=${u.id} role=${u.role} -> ${u.capabilities}`);
  }
  console.log("\n(لم يُنفَّذ شيء — شغّل مع --apply للتنفيذ.)");
  await conn.end();
  process.exit(0);
}

for (const u of updates) {
  await conn.execute("UPDATE permission_delegations SET capabilities = ?, targetUserId = NULL WHERE id = ?", [u.capabilities, u.id]);
}
console.log("تم تحديث الصفوف:", toUpdate);
await conn.end();
