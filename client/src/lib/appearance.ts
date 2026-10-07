export const RAKIZA_FONTS = [
  { id: "tajawal", label: "تجوال", family: "Tajawal, \"Noto Naskh Arabic\", sans-serif", sample: "رَكيزة — وضوح رسمي" },
  { id: "cairo", label: "القاهرة", family: "Cairo, Tajawal, sans-serif", sample: "رَكيزة — وضوح رسمي" },
  { id: "noto-naskh", label: "نوتو نسخ", family: "\"Noto Naskh Arabic\", Amiri, serif", sample: "رَكيزة — وضوح رسمي" },
  { id: "noto-kufi", label: "نوتو كوفي", family: "\"Noto Kufi Arabic\", Cairo, sans-serif", sample: "رَكيزة — وضوح رسمي" },
  { id: "amiri", label: "أميري", family: "Amiri, \"Noto Naskh Arabic\", serif", sample: "رَكيزة — وضوح رسمي" },
  { id: "alyamama", label: "عليامة", family: "\"Alyamama\", Tajawal, sans-serif", sample: "رَكيزة — وضوح رسمي" },
  { id: "ibm-plex", label: "آي بي إم بلكس", family: "\"IBM Plex Sans Arabic\", Tajawal, sans-serif", sample: "رَكيزة — وضوح رسمي" },
] as const;

export const RAKIZA_FONT_SIZES = [
  { id: "sm", label: "صغير", scale: "0.92" },
  { id: "md", label: "متوسط", scale: "1" },
  { id: "lg", label: "كبير", scale: "1.08" },
  { id: "xl", label: "أكبر", scale: "1.16" },
] as const;

export type RakizaFontId = typeof RAKIZA_FONTS[number]["id"];
export type RakizaFontSizeId = typeof RAKIZA_FONT_SIZES[number]["id"];

const FONT_KEY = "rakiza:font-family";
const SIZE_KEY = "rakiza:font-size";

export function readAppearancePreferences(): { fontId: RakizaFontId; sizeId: RakizaFontSizeId } {
  if (typeof window === "undefined") return { fontId: "tajawal", sizeId: "md" };
  const fontId = (window.localStorage.getItem(FONT_KEY) as RakizaFontId | null) ?? "tajawal";
  const sizeId = (window.localStorage.getItem(SIZE_KEY) as RakizaFontSizeId | null) ?? "md";
  return {
    fontId: RAKIZA_FONTS.some(font => font.id === fontId) ? fontId : "tajawal",
    sizeId: RAKIZA_FONT_SIZES.some(size => size.id === sizeId) ? sizeId : "md",
  };
}

export function applyAppearancePreferences(fontId: RakizaFontId, sizeId: RakizaFontSizeId) {
  if (typeof document === "undefined") return;
  const font = RAKIZA_FONTS.find(item => item.id === fontId) ?? RAKIZA_FONTS[0];
  const size = RAKIZA_FONT_SIZES.find(item => item.id === sizeId) ?? RAKIZA_FONT_SIZES[1];
  const root = document.documentElement;
  root.style.setProperty("--rakiza-font-family", font.family);
  root.style.setProperty("--rakiza-font-scale", size.scale);
  root.dataset.rakizaFont = font.id;
  root.dataset.rakizaFontSize = size.id;
}

export function persistAppearancePreferences(fontId: RakizaFontId, sizeId: RakizaFontSizeId) {
  window.localStorage.setItem(FONT_KEY, fontId);
  window.localStorage.setItem(SIZE_KEY, sizeId);
  applyAppearancePreferences(fontId, sizeId);
}

export function sortCourtStructureUnits<T extends { name: string; code?: string | null }>(units: T[]): T[] {
  const priority = (unit: T) => {
    const text = `${unit.name} ${unit.code ?? ""}`.toLowerCase();
    if (/رئاسة|presidency|court-presidency|رئيس/.test(text)) return 0;
    if (/ملازم|trainee/.test(text)) return 1;
    if (/موارد بشر|human.?resource|hr\b|الموارد البشرية/.test(text)) return 2;
    return 50;
  };
  return [...units].sort((a, b) => {
    const diff = priority(a) - priority(b);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "ar");
  });
}
