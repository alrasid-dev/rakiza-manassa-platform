/**
 * server/policies/policy-pdf.ts
 * توليد PDF للسياسات بالعربية (RTL) باستخدام jsPDF + arabic-reshaper
 * (بدون Puppeteer/Chromium لتجنّب تجاوز حد حجم دالة Vercel).
 */
import { jsPDF } from "jspdf";
// @ts-ignore - arabic-reshaper لا يملك تعريفات TypeScript
import arabicReshaper from "arabic-reshaper";
import type { PolicySection } from "./policy-content";
import { readFileSync } from "fs";
import { inflateSync } from "zlib";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

type ArabicReshaper = {
  convertArabic(text: string): string;
  convertArabicBack(text: string): string;
};
const reshaper = arabicReshaper as ArabicReshaper;

const FONT_REGULAR = "noto-sans-arabic-arabic-400-normal.woff";
const FONT_BOLD = "noto-sans-arabic-arabic-700-normal.woff";
const REGULAR_ID = "NotoArabic";
const BOLD_ID = "NotoArabicBold";

/** يحوّل خط WOFF1 إلى TTF صالح لاستخدام jsPDF (إزالة غلاف WOFF وفك ضغط الجداول). */
function woffToTtf(woff: Buffer): Buffer {
  const numTables = woff.readUInt16BE(12);
  const flavor = woff.readUInt32BE(4);
  const entries: { tag: number; checksum: number; origLength: number; data: Buffer }[] = [];
  let p = 44;
  for (let i = 0; i < numTables; i++) {
    const tag = woff.readUInt32BE(p);
    const offset = woff.readUInt32BE(p + 4);
    const compLength = woff.readUInt32BE(p + 8);
    const origLength = woff.readUInt32BE(p + 12);
    const checksum = woff.readUInt32BE(p + 16);
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength === origLength ? Buffer.from(raw) : Buffer.from(inflateSync(raw));
    entries.push({ tag, checksum, origLength, data });
    p += 20;
  }
  entries.sort((a, b) => a.tag - b.tag);
  let maxPow2 = 1;
  while (maxPow2 <= numTables) maxPow2 <<= 1;
  maxPow2 >>= 1;
  const searchRange = maxPow2 * 16;
  const entrySelector = Math.floor(Math.log2(maxPow2));
  const rangeShift = numTables * 16 - searchRange;
  const headerSize = 12 + 16 * numTables;
  let dataOffset = headerSize;
  const records: Buffer[] = [];
  const datas: Buffer[] = [];
  for (const e of entries) {
    const padded = (e.data.length + 3) & ~3;
    const rec = Buffer.alloc(16);
    rec.writeUInt32BE(e.tag, 0);
    rec.writeUInt32BE(e.checksum, 4);
    rec.writeUInt32BE(dataOffset, 8);
    rec.writeUInt32BE(e.origLength, 12);
    records.push(rec);
    const pd = Buffer.alloc(padded);
    e.data.copy(pd);
    datas.push(pd);
    dataOffset += padded;
  }
  const header = Buffer.alloc(12);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(rangeShift, 10);
  return Buffer.concat([header, ...records, ...datas]);
}

function loadFontTtf(filename: string): Buffer {
  const candidates = [
    join(process.cwd(), "node_modules/@fontsource/noto-sans-arabic/files", filename),
    join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules/@fontsource/noto-sans-arabic/files", filename),
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules/@fontsource/noto-sans-arabic/files", filename),
  ];
  for (const fontPath of candidates) {
    try {
      return woffToTtf(readFileSync(fontPath));
    } catch {
      // جرّب المسار التالي
    }
  }
  console.error(`[pdf] الخط ${filename} غير موجود في أي من المسارات المتوقعة.`);
  return Buffer.alloc(0);
}

const ttfRegular = loadFontTtf(FONT_REGULAR);
const ttfBold = loadFontTtf(FONT_BOLD);

function reshape(text: string): string {
  return reshaper.convertArabic(text);
}

function wrapLines(doc: jsPDF, text: string, maxWidth: number, fontId: string, size: number): string[] {
  doc.setFont(fontId, "normal");
  doc.setFontSize(size);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (doc.getTextWidth(reshape(candidate)) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function generatePoliciesPdf(title: string, sections: PolicySection[]): Promise<Buffer> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setR2L(true);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 50;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  if (ttfRegular.length) {
    doc.addFileToVFS("NotoArabic.ttf", ttfRegular.toString("base64"));
    doc.addFont("NotoArabic.ttf", REGULAR_ID, "normal");
  }
  if (ttfBold.length) {
    doc.addFileToVFS("NotoArabicBold.ttf", ttfBold.toString("base64"));
    doc.addFont("NotoArabicBold.ttf", BOLD_ID, "normal");
  }

  const renderBlock = (text: string, size: number, bold: boolean) => {
    const fontId = bold && ttfBold.length ? BOLD_ID : REGULAR_ID;
    for (const line of wrapLines(doc, text, maxWidth, fontId, size)) {
      if (y > pageHeight - margin) { doc.addPage(); y = margin; }
      doc.setFont(fontId, "normal");
      doc.setFontSize(size);
      doc.text(reshape(line), pageWidth - margin, y, { align: "right" });
      y += size + 5;
    }
    y += 6;
  };

  renderBlock(title, 18, true);
  y += 6;

  for (const section of sections) {
    renderBlock(section.title, 13, true);
    renderBlock(section.content, 11, false);
    y += 4;
  }

  return Buffer.from(doc.output("arraybuffer"));
}

