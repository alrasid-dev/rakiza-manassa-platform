/**
 * server/policies/policy-pdf.ts
 * توليد PDF للسياسات بالعربية (RTL) باستخدام Puppeteer-core + @sparticuz/chromium
 * (يعمل على Vercel ويدعم النص العربي).
 */
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type { PolicySection } from "./policy-content";
import { readFileSync } from "fs";
import { join } from "path";

function loadFontBase64(filename: string): string {
  try {
    const fontPath = join(
      process.cwd(),
      "node_modules/@fontsource/noto-sans-arabic/files",
      filename,
    );
    return readFileSync(fontPath).toString("base64");
  } catch (err) {
    console.error(`[pdf] خط ${filename} غير موجود:`, err);
    return "";
  }
}

const fontRegular = loadFontBase64("noto-sans-arabic-arabic-400-normal.woff2");
const fontBold = loadFontBase64("noto-sans-arabic-arabic-700-normal.woff2");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderPoliciesHtml(title: string, sections: PolicySection[]): string {
  const items = sections
    .map(section => `<section class="policy"><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.content)}</p></section>`)
    .join("");
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8" /><style>
    @page { size: A4; margin: 1.8cm; }
    @font-face { font-family: "Noto Sans Arabic"; src: url(data:font/woff2;base64,${fontRegular}) format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }
    @font-face { font-family: "Noto Sans Arabic"; src: url(data:font/woff2;base64,${fontBold}) format("woff2"); font-weight: 700; font-style: normal; font-display: swap; }
    * { box-sizing: border-box; }
    body { font-family: "Noto Sans Arabic", "Noto Naskh Arabic", "Segoe UI", "Tahoma", sans-serif; direction: rtl; color: #12352f; line-height: 2; margin: 0; }
    h1 { color: #0f2e27; border-bottom: 3px solid #b18448; padding-bottom: 10px; margin-bottom: 24px; font-size: 1.6rem; font-weight: 700; }
    .policy { margin-bottom: 20px; page-break-inside: avoid; border-right: 4px solid #d8cbaa; padding-right: 12px; }
    .policy h2 { color: #1f5a47; font-size: 1.05rem; margin: 0 0 4px; font-weight: 700; }
    .policy p { color: #44584e; font-size: 0.88rem; margin: 0; white-space: pre-wrap; }
  </style></head><body><h1>${escapeHtml(title)}</h1>${items}</body></html>`;
}

export async function generatePoliciesPdf(title: string, sections: PolicySection[]): Promise<Buffer> {
  const html = renderPoliciesHtml(title, sections);
  const browser = await puppeteer.launch({
    args: [...chromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
