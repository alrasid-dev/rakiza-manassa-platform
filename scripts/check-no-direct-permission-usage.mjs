// scripts/check-no-direct-permission-usage.mjs
// يمنع الاستخدام المباشر لـ permission.data / roles.data في الواجهة،
// ويوجّه المطوّر إلى usePermissionsSnapshot() بدلاً منها (لتفادي تذبذب الأزرار).
//
// التشغيل: node scripts/check-no-direct-permission-usage.mjs
// (مربوط أيضاً بسكربت `npm run check` في package.json)

import fs from "node:fs";
import path from "node:path";

const SRC_DIR = path.resolve("client/src");

// الملف الوحيد المسموح له بقراءة .data مباشرة (لأنه مصدر الـ snapshot نفسه).
const EXCLUDED_FILES = new Set([
  path.resolve("client/src/hooks/usePermissionsSnapshot.ts"),
]);

const PATTERN = /(permission|roles)\.data/g;

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

const files = collectFiles(SRC_DIR).filter((file) => !EXCLUDED_FILES.has(file));

let violations = 0;

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.match(PATTERN)) return;
    violations += 1;
    console.log(`${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
    console.log("   ❌ استخدام مباشر لـ permission.data/roles.data. استخدم usePermissionsSnapshot() بدلاً منها.");
  });
}

if (violations > 0) {
  console.log(`\n⚠️ وُجد ${violations} استخدام مباشر لـ permission.data/roles.data.`);
  process.exit(1);
}

console.log("✅ لا توجد استخدامات مباشرة — كل شيء يستخدم usePermissionsSnapshot.");
process.exit(0);
