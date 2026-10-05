// scripts/sync-all-direct-managers.mjs
// مزامنة لمرة واحدة: ربط جميع موظفي الأقسام بمدرائهم المباشرين النشطين (department_manager / trainee_affairs_manager).
// يقرأ DATABASE_URL من .env.production.local دون طباعة أي أسرار. آمن: يحدّث فقط من لا مدير له أو من تغيّر مديره، ولا يحذف.
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
  const rawUrl = readEnvValue(path.resolve(".env.production.local"), "DATABASE_URL") || process.env.DATABASE_URL;
  if (!rawUrl) {
    console.error("DATABASE_URL غير موجود (لا في .env.production.local ولا في البيئة)");
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
  console.log("Connected to " + database + " @ " + url.hostname);

  // 1) المدراء النشطون فقط، لكل قسم مدير واحد (الأول عند التكرار).
  const [managers] = await conn.query(`
    SELECT cra.unitId, p.id as managerProfileId, p.fullName as manager_name, cra.role
    FROM court_role_assignments cra
    JOIN users u ON u.id = cra.userId
    JOIN person_profiles p ON p.userId = u.id
    WHERE cra.role IN ('department_manager', 'trainee_affairs_manager')
      AND cra.unitId IS NOT NULL
      AND cra.isActive = 1
    ORDER BY cra.unitId, cra.createdAt
  `);
  const byUnit = new Map();
  for (const m of managers) {
    if (!byUnit.has(m.unitId)) byUnit.set(m.unitId, m);
  }
  console.log("عدد الأقسام ذات مدير نشط: " + byUnit.size);

  // 2) تحديث موظفي كل قسم.
  let totalUpdated = 0;
  for (const m of byUnit.values()) {
    const [result] = await conn.execute(
      `UPDATE person_profiles
       SET directManagerProfileId = ?, updatedAt = NOW()
       WHERE unitId = ?
         AND id != ?
         AND (directManagerProfileId IS NULL OR directManagerProfileId != ?)`,
      [m.managerProfileId, m.unitId, m.managerProfileId, m.managerProfileId],
    );
    totalUpdated += result.affectedRows;
    console.log(`القسم ${m.unitId}: رُبط ${result.affectedRows} موظف → المدير ${m.manager_name} (${m.role})`);
  }

  console.log("\nإجمالي المحدَّث: " + totalUpdated);

  // 3) تحقق.
  const [remaining] = await conn.query(
    `SELECT COUNT(*) as cnt FROM person_profiles WHERE status = 'active' AND directManagerProfileId IS NULL`,
  );
  const [withMgr] = await conn.query(
    `SELECT COUNT(*) as cnt FROM person_profiles WHERE directManagerProfileId IS NOT NULL`,
  );
  console.log("المتبقي بدون مدير (نشط): " + remaining[0].cnt);
  console.log("المربوطون بمدير: " + withMgr[0].cnt);

  await conn.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
