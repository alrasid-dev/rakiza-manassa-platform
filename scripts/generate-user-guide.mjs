#!/usr/bin/env node
/**
 * Generates Rakiza_User_Guide.pdf (interactive first-time user guide).
 * Uses Chrome (HTML-to-PDF) for correct Arabic RTL rendering.
 * Usage: node scripts/generate-user-guide.mjs
 */
import fs from "node:fs";
import QRCode from "qrcode";
import puppeteer from "puppeteer-core";

const LOGIN_URL = process.env.RAKIZA_BASE_URL || "https://rakiza-manassa-platform.vercel.app/login";
const CHROME_PATH = process.env.RAKIZA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const html = (qrDataUrl) => `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; background: #12352f; color: #f3efe4; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 16mm; position: relative; }
  .band { position: absolute; top: 0; right: 0; left: 0; height: 3mm; background: #c8a24b; }
  h1 { text-align: center; font-size: 27pt; color: #f3efe4; font-weight: 800; }
  .subtitle { text-align: center; color: #c8a24b; font-size: 13pt; margin-top: 4mm; font-weight: 700; }
  .card { background: #1a3a30; border-radius: 6mm; padding: 6mm 7mm; margin-top: 8mm; }
  .summary { font-size: 11.5pt; line-height: 1.8; }
  .summary b { color: #c8a24b; }
  .muted { color: #c9d4c7; }
  h2 { text-align: center; color: #c8a24b; font-size: 16pt; margin-top: 11mm; }
  .step { background: #1a3a30; border-radius: 5mm; padding: 5mm 6mm; margin-top: 5mm; display: flex; align-items: flex-start; gap: 5mm; }
  .num { width: 10mm; height: 10mm; border-radius: 50%; background: #c8a24b; color: #12352f; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 14pt; flex-shrink: 0; }
  .step h3 { color: #f3efe4; font-size: 12.5pt; }
  .step p { color: #c9d4c7; font-size: 10.5pt; line-height: 1.7; margin-top: 2mm; }
   .step ul { margin-top: 2mm; padding-right: 5mm; }
   .step li { color: #c9d4c7; font-size: 10pt; line-height: 1.7; margin-top: 1.5mm; }
   .step li b { color: #c8a24b; }

  .qr-wrap { text-align: center; margin-top: 14mm; }
  .qr { background: #fff; padding: 4mm; border-radius: 5mm; display: inline-block; }
  .qr img { width: 44mm; height: 44mm; display: block; }
  .qr-hint { color: #f3efe4; font-size: 11pt; margin-top: 4mm; }
  .url { color: #c8a24b; font-size: 10pt; margin-top: 2mm; direction: ltr; }
  .footer { position: absolute; bottom: 10mm; right: 0; left: 0; text-align: center; color: #c9d4c7; font-size: 9pt; }
</style>
</head>
<body>
  <div class="page">
    <div class="band"></div>
    <h1>دليل استخدام منصة ركيزة</h1>
    <div class="subtitle">المرجع الرسمي للمستخدم لأول مرة</div>
    <div class="card">
      <p class="summary"><b>منصة ركيزة:</b> منصة إدارية وقضائية مؤتمتة لتنظيم وتتبع سائر المعاملات والتكاليف بين جميع القيادات والوحدات التنظيمية بالمحكمة العمالية بالرياض.</p>
      <p class="summary muted" style="margin-top: 4mm;"><b>الهدف:</b> أتمتة تدفق العمليات، حوكمة تسلسل الصلاحيات والهيكل التنظيمي، وتسريع إنجاز المهام مع رفع الشفافية ومراقبة الأداء.</p>
    </div>
    <h2>دليل الاستخدام لأول مرة</h2>
    <div class="step"><div class="num">١</div><div><h3>تسجيل الدخول — الرمز الموحد</h3><p>عبر البريد المؤسسي الرسمي (@moj.gov.sa) للوصول التلقائي للوحدة التنظيمية التابعة لك.</p><ul><li><b>الدخول الأول:</b> بعد إدخال بريدك الرسمي، يُطلب منك إنشاء «رمز المرور» — وهو <b>الرقم الموحد</b> من 6 أرقام الذي ستدخل به يومياً. أدخله ثم أكّده، واضغط «حفظ الرمز ومتابعة الدخول».</li><li><b>الدخول اليومي:</b> أدخل بريدك الرسمي ثم رمز المرور الموحد (6 أرقام) واضغط «دخول».</li><li><b>تغيير الرمز:</b> اطلب من مالك المنصة إعادة تعيين رمزك، ثم أنشئ رمزاً جديداً في الدخول التالي عبر «أول دخول».</li></ul></div></div>
    <div class="step"><div class="num">٢</div><div><h3>استكشاف لوحة التحكم والهيكل</h3><p>الاطلاع على مساحة العمل، المهام المسندة، والوحدة التنظيمية الخاصة بك.</p></div></div>
    <div class="step"><div class="num">٣</div><div><h3>إدارة المهام والتكاليف</h3><p>إسناد التكاليف بين الموظفين، متابعة حالات الإنجاز، وتحديث التنبيهات.</p></div></div>
    <div class="step"><div class="num">٤</div><div><h3>قائمة إدارة القسم</h3><p>للمدراء ورؤساء الأقسام: متابعة أداء الموظفين، إدارة الصلاحيات، واستعراض التقارير الدورية.</p></div></div>
    <div class="qr-wrap">
      <div class="qr"><img src="${qrDataUrl}" alt="QR"></div>
      <p class="qr-hint">امسح الباركود للدخول المباشر</p>
      <p class="url">${LOGIN_URL}</p>
    </div>
    <div class="footer">منصة ركيزة — المحكمة العمالية بالرياض</div>
  </div>
</body>
</html>`;

async function main() {
  const qrDataUrl = await QRCode.toDataURL(LOGIN_URL, { margin: 1, width: 512, color: { dark: "#12352f", light: "#ffffff" } });
  const content = html(qrDataUrl);

  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setContent(content, { waitUntil: "networkidle0" });
    const buffer = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    const target = "Rakiza_User_Guide.pdf";
    const tmp = target + ".tmp";
    fs.writeFileSync(tmp, buffer);
    try {
      fs.renameSync(tmp, target);
      console.log("Generated " + target);
    } catch {
      fs.renameSync(tmp, "Rakiza_User_Guide_v2.pdf");
      console.log("Saved as Rakiza_User_Guide_v2.pdf — close the open PDF and re-run to restore the standard name.");
    }
  } finally {
    await browser.close();
  }
  console.log("Generated Rakiza_User_Guide.pdf");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
