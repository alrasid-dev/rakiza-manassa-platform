#!/usr/bin/env node
/**
 * Generates Rakiza_User_Guide.pdf (interactive first-time user guide).
 * Dark theme + gold accents + RTL Arabic + QR code.
 * Usage: node scripts/generate-user-guide.mjs
 */
import { jsPDF } from "jspdf";
import fs from "node:fs";
import QRCode from "qrcode";
import arabicReshaper from "arabic-reshaper";

const LOGIN_URL = process.env.RAKIZA_BASE_URL || "https://rakiza-manassa-platform.vercel.app/login";
const FONT_PATH = process.env.RAKIZA_PDF_FONT || "C:/Windows/Fonts/tahoma.ttf";

// Shape + reverse Arabic for correct RTL rendering in jsPDF.
const ar = (text) => arabicReshaper.convertArabic(String(text)).split("").reverse().join("");

const W = 210, H = 297, M = 16;
const BG = "#12352f";
const BG_CARD = "#1a3a30";
const GOLD = "#c8a24b";
const GOLD_SOFT = "#b18448";
const WHITE = "#f3efe4";
const MUTED = "#c9d4c7";

async function main() {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const font = fs.readFileSync(FONT_PATH).toString("base64");
  doc.addFileToVFS("Tahoma.ttf", font);
  doc.addFont("Tahoma.ttf", "Tahoma", "normal");
  doc.setFont("Tahoma", "normal");

  // Background
  doc.setFillColor(BG);
  doc.rect(0, 0, W, H, "F");
  // Gold top band
  doc.setFillColor(GOLD);
  doc.rect(0, 0, W, 2.5, "F");

  let y = 20;

  const center = (text, size, color, yy) => {
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.text(ar(text), W / 2, yy, { align: "center" });
  };

  const block = (lines, size, color, yy, lineH, align = "right") => {
    doc.setFontSize(size);
    doc.setTextColor(color);
    lines.forEach((line, i) => {
      const x = align === "right" ? W - M : M;
      doc.text(ar(line), x, yy + i * lineH, { align });
    });
  };

  // Title
  center("دليل استخدام منصة ركيزة", 26, WHITE, y);
  y += 8;
  center("المرجع الرسمي للمستخدم لأول مرة", 13, GOLD, y);
  y += 14;

  // Summary card
  doc.setFillColor(BG_CARD);
  doc.roundedRect(M, y - 6, W - 2 * M, 34, 2, 2, "F");
  block(["منصة ركيزة: منصة إدارية وقضائية مؤتمتة لتنظيم وتتبع سائر المعاملات", "والتكاليف بين جميع القيادات والوحدات التنظيمية بالمحكمة العمالية بالرياض."], 11, WHITE, y, 6);
  block(["الهدف: أتمتة تدفق العمليات، حوكمة تسلسل الصلاحيات والهيكل التنظيمي،", "وتسريع إنجاز المهام مع رفع الشفافية ومراقبة الأداء."], 11, MUTED, y + 14, 6);
  y += 44;

  // Steps heading
  center("دليل الاستخدام لأول مرة", 17, GOLD, y);
  y += 12;

  const steps = [
    ["١", "تسجيل الدخول", "عبر البريد المؤسسي الرسمي (@moj.gov.sa) للوصول التلقائي للوحدة التنظيمية التابعة لك."],
    ["٢", "استكشاف لوحة التحكم والهيكل", "الاطلاع على مساحة العمل، المهام المسندة، والوحدة التنظيمية الخاصة بك."],
    ["٣", "إدارة المهام والتكاليف", "إسناد التكاليف بين الموظفين، متابعة حالات الإنجاز، وتحديث التنبيهات."],
    ["٤", "قائمة إدارة القسم", "للمدراء ورؤساء الأقسام: متابعة أداء الموظفين، إدارة الصلاحيات، واستعراض التقارير الدورية."],
  ];

  for (const [num, title, desc] of steps) {
    doc.setFillColor(BG_CARD);
    doc.roundedRect(M, y - 6, W - 2 * M, 20, 2, 2, "F");
    doc.setFillColor(GOLD);
    doc.circle(M + 9, y + 4, 5, "F");
    doc.setTextColor(BG);
    doc.setFontSize(12);
    doc.text(num, M + 9, y + 4.5, { align: "center" });
    block([title], 12, WHITE, y, 6);
    block([desc], 10, MUTED, y + 8, 6);
    y += 26;
  }

  y += 8;

  // QR code + link
  const qrSize = 46;
  const qrX = W / 2 - qrSize / 2;
  const qrData = await QRCode.toDataURL(LOGIN_URL, { margin: 1, width: 512, color: { dark: BG, light: "#ffffff" } });
  doc.setFillColor("#ffffff");
  doc.roundedRect(qrX - 4, y - 4, qrSize + 8, qrSize + 8, 2, 2, "F");
  doc.addImage(qrData, "PNG", qrX, y, qrSize, qrSize);
  y += qrSize + 8;
  center("امسح الباركود للدخول المباشر", 11, WHITE, y);
  y += 7;
  center(LOGIN_URL, 10, GOLD_SOFT, y);

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(ar("منصة ركيزة — المحكمة العمالية بالرياض"), W / 2, H - 12, { align: "center" });

  doc.save("Rakiza_User_Guide.pdf");
  console.log("Generated Rakiza_User_Guide.pdf");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
