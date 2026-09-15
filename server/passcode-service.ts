import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { accessGrants, personProfiles, users } from "../drizzle/schema";
import { findDepartmentAccountByLoginEmail, isAllowedLoginEmail } from "./court-service";
import { getDb } from "./db";
import { mockGetUserByEmail, mockLinkPasscodeIdentity, mockSetUserPasscode } from "./mock-store";

/** رمز المرور: ستة أرقام يُنشئها الموظف أول مرة ويُدخلها في الدخول اليومي. */
export const PASSCODE_PATTERN = /^\d{6}$/;

export function hashPasscode(passcode: string, salt = randomBytes(16).toString("hex")) {
  const digest = scryptSync(passcode, salt, 32).toString("hex");
  return `${salt}:${digest}`;
}

export function verifyPasscode(passcode: string, stored: string) {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const actual = scryptSync(passcode, salt, 32);
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function passcodeOpenId(email: string) {
  return `passcode:${createHash("sha256").update(email).digest("hex").slice(0, 55)}`;
}

/** يضمن وجود حساب موظف شخصي لهذا البريد (دون الاعتماد على Firebase). */
async function ensurePasscodeUser(email: string) {
  const db = await getDb();
  if (!db) return mockLinkPasscodeIdentity(email).user;

  const [existing] = await db.select().from(users).where(sql`LOWER(${users.email}) = ${email}`).limit(1);
  if (existing) return existing;

  const departmentAccount = await findDepartmentAccountByLoginEmail(email);
  if (departmentAccount?.isActive) throw new Error("حساب القسم لا يسجل الدخول برمز مرور مباشرة. ادخل ببريدك الشخصي ثم بدّل إلى هوية القسم عند التكليف.");

  const [grant] = await db.select().from(accessGrants).where(and(sql`LOWER(${accessGrants.officialEmail}) = ${email}`, eq(accessGrants.isActive, true))).limit(1);
  if (!grant) throw new Error("لا يوجد ملف موظف شخصي نشط مرتبط بهذا البريد الرسمي.");

  const openId = passcodeOpenId(email);
  const accountName = grant.fullName ?? email;
  const notificationEmail = grant.notificationEmail ?? email;
  const inserted = await db.insert(users).values({ openId, name: accountName, email, backupEmail: notificationEmail, loginMethod: "passcode", role: "user" });
  const id = Number(inserted[0].insertId);
  const created = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!created) throw new Error("تعذر إنشاء حساب رمز المرور.");
  await db.update(accessGrants).set({ userId: created.id, updatedAt: new Date() }).where(eq(accessGrants.id, grant.id));
  await db.update(personProfiles).set({ userId: created.id, updatedAt: new Date() }).where(and(sql`LOWER(${personProfiles.email}) = ${email}`, isNull(personProfiles.userId)));
  return created;
}

/** إنشاء رمز المرور أول مرة. */
export async function setupPasscode(input: { officialEmail: string; passcode: string }) {
  const email = input.officialEmail.trim().toLowerCase();
  if (!isAllowedLoginEmail(email)) throw new Error("استخدم البريد الرسمي المنتهي بـ @moj.gov.sa أو بريد مالك رَكيزة.");
  if (!PASSCODE_PATTERN.test(input.passcode)) throw new Error("رمز المرور يجب أن يكون 6 أرقام.");

  const db = await getDb();
  if (!db) {
    const user = mockLinkPasscodeIdentity(email).user;
    if (user.passcodeHash) throw new Error("رمز المرور مُنشأ مسبقاً. استخدم «دخول» لإدخاله.");
    mockSetUserPasscode(email, hashPasscode(input.passcode));
    return user;
  }

  const user = await ensurePasscodeUser(email);
  if (user.passcodeHash) throw new Error("رمز المرور مُنشأ مسبقاً. استخدم «دخول» لإدخاله.");
  const passcodeHash = hashPasscode(input.passcode);
  await db.update(users).set({ passcodeHash, loginMethod: "passcode", updatedAt: new Date() }).where(eq(users.id, user.id));
  return user;
}

/** الدخول اليومي برمز المرور. */
export async function loginWithPasscode(input: { officialEmail: string; passcode: string }) {
  const email = input.officialEmail.trim().toLowerCase();
  if (!isAllowedLoginEmail(email)) throw new Error("استخدم البريد الرسمي المنتهي بـ @moj.gov.sa أو بريد مالك رَكيزة.");
  if (!PASSCODE_PATTERN.test(input.passcode)) throw new Error("رمز المرور يجب أن يكون 6 أرقام.");

  const db = await getDb();
  if (!db) {
    const user = mockGetUserByEmail(email);
    if (!user?.passcodeHash) throw new Error("لا يوجد رمز مرور لهذا البريد. أنشئه أول مرة عبر «أول دخول».");
    if (!verifyPasscode(input.passcode, user.passcodeHash)) throw new Error("رمز المرور غير صحيح.");
    user.lastSignedIn = new Date();
    user.updatedAt = new Date();
    return user;
  }

  const [user] = await db.select().from(users).where(sql`LOWER(${users.email}) = ${email}`).limit(1);
  if (!user?.passcodeHash) throw new Error("لا يوجد رمز مرور لهذا البريد. أنشئه أول مرة عبر «أول دخول».");
  if (!verifyPasscode(input.passcode, user.passcodeHash)) throw new Error("رمز المرور غير صحيح.");
  await db.update(users).set({ lastSignedIn: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
  return user;
}

/** يتحقق هل أنشأ هذا البريد رمز مرور سابقاً (ليقرر الواجهة «أول دخول» أم «دخول»). */
export async function passcodeConfigured(input: { officialEmail: string }) {
  const email = input.officialEmail.trim().toLowerCase();
  if (!isAllowedLoginEmail(email)) return { configured: false };
  const db = await getDb();
  if (!db) return { configured: Boolean(mockGetUserByEmail(email)?.passcodeHash) };
  const [user] = await db.select({ passcodeHash: users.passcodeHash }).from(users).where(sql`LOWER(${users.email}) = ${email}`).limit(1);
  return { configured: Boolean(user?.passcodeHash) };
}
