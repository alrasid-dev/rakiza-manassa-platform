#!/usr/bin/env node
/**
 * scripts/generate-attendance-policy-pdf.ts
 * توليد PDF سياسة الحضور والانصراف من policy-content.ts وحفظه في docs/policies_pdf/.
 * الاستخدام: npx tsx scripts/generate-attendance-policy-pdf.ts
 */
import fs from "node:fs";
import path from "node:path";
import { POLICY_SECTIONS } from "../server/policies/policy-content";
import { generatePoliciesPdf } from "../server/policies/policy-pdf";

async function main() {
  const sections = POLICY_SECTIONS.filter(s => s.id === "attendance" || s.id === "leave_permission");
  const pdf = await generatePoliciesPdf("سياسة الحضور والانصراف", sections);
  const dir = path.resolve("docs/policies_pdf");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "attendance-policy.pdf");
  fs.writeFileSync(target, pdf);
  console.log("Generated " + target + " (" + pdf.length + " bytes)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
