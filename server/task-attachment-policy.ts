import { Buffer } from "buffer";
import { TRPCError } from "@trpc/server";

export type TaskAttachmentInput = { originalName: string; mimeType: string; contentBase64: string };

const MAX_TASK_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const allowedExtensionsByMimeType: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

function isPdf(bytes: Buffer) {
  return bytes.subarray(0, 8).toString("ascii").startsWith("%PDF-");
}

function isPng(bytes: Buffer) {
  return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isJpeg(bytes: Buffer) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function validateTaskAttachment(input: TaskAttachmentInput) {
  const originalName = input.originalName.trim();
  if (!originalName || /[\\/\0]/.test(originalName) || originalName.length > 255) throw new TRPCError({ code: "BAD_REQUEST", message: "اسم المرفق غير صالح." });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.contentBase64) || input.contentBase64.length % 4 !== 0) throw new TRPCError({ code: "BAD_REQUEST", message: "صيغة المرفق غير صالحة." });
  const bytes = Buffer.from(input.contentBase64, "base64");
  if (!bytes.byteLength) throw new TRPCError({ code: "BAD_REQUEST", message: "الملف فارغ." });
  if (bytes.byteLength > MAX_TASK_ATTACHMENT_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "حجم الملف كبير جداً. الحد الأقصى 8 ميجابايت." });
  const mimeType = input.mimeType === "application/octet-stream" && isPdf(bytes) ? "application/pdf" : input.mimeType;
  if (!allowedMimeTypes.has(mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "نوع الملف غير مدعوم. المسموح: PDF وWord وExcel والصور PNG/JPEG." });
  const lowerCaseName = originalName.toLowerCase();
  if (!allowedExtensionsByMimeType[mimeType]?.some(extension => lowerCaseName.endsWith(extension))) throw new TRPCError({ code: "BAD_REQUEST", message: "امتداد المرفق لا يطابق نوعه المعلن." });
  if ((mimeType === "application/pdf" && !isPdf(bytes)) || (mimeType === "image/png" && !isPng(bytes)) || (mimeType === "image/jpeg" && !isJpeg(bytes))) throw new TRPCError({ code: "BAD_REQUEST", message: "محتوى الملف لا يطابق نوع المرفق المعلن." });
  return { bytes, mimeType };
}
