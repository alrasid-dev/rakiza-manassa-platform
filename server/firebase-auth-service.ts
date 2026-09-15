import { createHash } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { decodeProtectedHeader, importPKCS8, importX509, jwtVerify, SignJWT } from "jose";
import { accessGrants, personProfiles, users } from "../drizzle/schema";
import { findDepartmentAccountByLoginEmail, isAllowedLoginEmail } from "./court-service";
import { getDb } from "./db";
import { mockClearMustChangePassword, mockLinkFirebaseIdentity } from "./mock-store";

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

export type FirebaseIdentity = {
  uid: string;
  email: string;
  name: string;
  provider: "google.com" | "password" | "unknown";
};

let publicKeyCache: { keys: Record<string, string>; expiresAt: number } | null = null;
let accessTokenCache: { token: string; expiresAt: number } | null = null;

function serviceAccount(): FirebaseServiceAccount | null {
  try {
    const value = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<FirebaseServiceAccount>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return parsed as FirebaseServiceAccount;
  } catch {
    return null;
  }
}

async function firebasePublicKeys() {
  if (publicKeyCache && publicKeyCache.expiresAt > Date.now()) return publicKeyCache.keys;
  const response = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  if (!response.ok) throw new Error("تعذر التحقق من هوية Firebase حالياً.");
  const keys = await response.json() as Record<string, string>;
  const header = response.headers.get("cache-control") ?? "";
  const maxAge = Number(header.match(/max-age=(\d+)/)?.[1] ?? 3600);
  publicKeyCache = { keys, expiresAt: Date.now() + maxAge * 1000 };
  return keys;
}

export async function verifyFirebaseIdToken(idToken: string, options?: { allowUnverifiedEmail?: boolean }): Promise<FirebaseIdentity> {
  const account = serviceAccount();
  if (!account) {
    // وضع التشغيل المستقل: تحقق وهمي دون اعتماد Firebase خارجي.
    return verifyMockFirebaseIdToken(idToken, options);
  }
  const header = decodeProtectedHeader(idToken);
  if (!header.kid) throw new Error("رمز Firebase غير صالح.");
  const certificate = (await firebasePublicKeys())[header.kid];
  if (!certificate) throw new Error("تعذر التحقق من مفتاح Firebase الحالي. أعد تسجيل الدخول.");
  const key = await importX509(certificate, "RS256");
  const { payload } = await jwtVerify(idToken, key, {
    audience: account.project_id,
    issuer: `https://securetoken.google.com/${account.project_id}`,
  });
  const uid = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const name = typeof payload.name === "string" ? payload.name : email;
  const verified = payload.email_verified === true;
  const signInProvider = (payload.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
  const provider = signInProvider === "google.com" ? "google.com" : signInProvider === "password" ? "password" : "unknown";
  if (!uid || !email || (!verified && !options?.allowUnverifiedEmail) || !isAllowedLoginEmail(email)) throw new Error("يلزم بريد رسمي موثق ومسموح به للدخول إلى رَكيزة، أو رمز تفعيل لمرة واحدة بعد إثبات الهوية.");
  return { uid, email, name, provider };
}

/**
 * تحقق وهمي من رمز Firebase في وضع التشغيل المستقل: يفك ترميز حمولة JWT
 * محلياً (دون تحقق توقيعي) ويطبّق سياسة البريد الرسمي نفسها.
 */
function verifyMockFirebaseIdToken(idToken: string, _options?: { allowUnverifiedEmail?: boolean }): FirebaseIdentity {
  let payload: Record<string, unknown> = {};
  try {
    const parts = idToken.split(".");
    const body = parts.length >= 2 ? parts[1] : parts[0];
    const normalized = body.replace(/-/g, "+").replace(/_/g, "/");
    payload = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    payload = {};
  }
  const uid = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const name = typeof payload.name === "string" ? payload.name : email;
  const signInProvider = (payload.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
  const provider = signInProvider === "google.com" ? "google.com" : signInProvider === "password" ? "password" : "unknown";
  if (!uid || !email || !isAllowedLoginEmail(email)) {
    throw new Error("يلزم بريد رسمي موثق ومسموح به للدخول إلى رَكيزة.");
  }
  return { uid, email, name, provider };
}

async function firebaseAccessToken(account: FirebaseServiceAccount) {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 60_000) return accessTokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new Error("تعذر اعتماد خادم Firebase لمزامنة الهوية.");
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("لم يعُد Firebase رمز مزامنة صالحاً.");
  accessTokenCache = { token: payload.access_token, expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000 };
  return payload.access_token;
}

async function syncIdentityToFirestore(identity: FirebaseIdentity, user: { id: number; email: string | null; name: string | null }, profileId: number | null) {
  const account = serviceAccount();
  if (!account) return;
  try {
    const token = await firebaseAccessToken(account);
    const now = new Date().toISOString();
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${account.project_id}/databases/(default)/documents/rakizaUsers/${encodeURIComponent(identity.uid)}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ fields: {
        officialEmail: { stringValue: user.email ?? identity.email },
        displayName: { stringValue: user.name ?? identity.name },
        rakizaUserId: { integerValue: String(user.id) },
        profileId: profileId == null ? { nullValue: null } : { integerValue: String(profileId) },
        provider: { stringValue: identity.provider },
        updatedAt: { timestampValue: now },
      } }),
    });
    if (!response.ok) {
      console.warn(`[Firebase] Firestore identity sync skipped (HTTP ${response.status})`);
      return;
    }
  } catch (error) {
    // مزامنة الهوية مع Firestore غير حرجة — لا تمنع إتمام الدخول.
    console.warn("[Firebase] Firestore identity sync unavailable:", error);
  }
}

export async function linkFirebaseIdentity(identity: FirebaseIdentity) {
  const db = await getDb();
  if (!db) {
    // وضع التشغيل المستقل: ربط الهوية عبر المخزن الوهمي.
    return mockLinkFirebaseIdentity(identity);
  }
  const [existingByUid] = await db.select().from(users).where(eq(users.firebaseUid, identity.uid)).limit(1);
  const [existingByEmail] = await db.select().from(users).where(sql`LOWER(${users.email}) = ${identity.email}`).limit(1);
  if (existingByUid && existingByEmail && existingByUid.id !== existingByEmail.id) throw new Error("هذا البريد مرتبط بحساب رَكيزة آخر.");
  let user = existingByUid ?? existingByEmail;
  if (!user) {
    const departmentAccount = await findDepartmentAccountByLoginEmail(identity.email);
    if (departmentAccount?.isActive) throw new Error("حساب القسم لا يستخدم Google أو كلمة مرور مباشرة. ادخل ببريدك الشخصي ثم بدّل إلى هوية القسم عند التكليف.");
    const [grant] = await db.select().from(accessGrants).where(and(sql`LOWER(${accessGrants.officialEmail}) = ${identity.email}`, eq(accessGrants.isActive, true))).limit(1);
    if (!grant) throw new Error("لا يوجد ملف موظف شخصي نشط مرتبط بهذا البريد الرسمي.");
    const accountName = grant.fullName ?? identity.name;
    const openId = `firebase:${createHash("sha256").update(identity.uid).digest("hex").slice(0, 55)}`;
    const inserted = await db.insert(users).values({ openId, name: accountName, email: identity.email, backupEmail: grant.notificationEmail ?? null, loginMethod: `firebase_${identity.provider}`, firebaseUid: identity.uid, firebaseLinkedAt: new Date(), role: "user" });
    const id = Number(inserted[0].insertId);
    user = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    if (!user) throw new Error("تعذر إنشاء ارتباط حساب Firebase.");
    if (grant) await db.update(accessGrants).set({ userId: user.id, updatedAt: new Date() }).where(eq(accessGrants.id, grant.id));
    await db.update(personProfiles).set({ userId: user.id, updatedAt: new Date() }).where(and(sql`LOWER(${personProfiles.email}) = ${identity.email}`, isNull(personProfiles.userId)));
  } else {
    if (user.firebaseUid && user.firebaseUid !== identity.uid) throw new Error("حساب Firebase مختلف مرتبط بهذا البريد. راجع المسؤول.");
    await db.update(users).set({ firebaseUid: identity.uid, firebaseLinkedAt: new Date(), loginMethod: `firebase_${identity.provider}`, name: user.name ?? identity.name, lastSignedIn: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    user = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0] ?? user;
  }
  const [profile] = await db.select({ id: personProfiles.id }).from(personProfiles).where(eq(personProfiles.userId, user.id)).limit(1);
  await syncIdentityToFirestore(identity, user, profile?.id ?? null);
  return { user, profileId: profile?.id ?? null };
}

export async function clearMustChangePassword(userId: number) {
  const db = await getDb();
  if (!db) {
    // وضع التشغيل المستقل: مسح علامة تغيير كلمة المرور في المخزن الوهمي.
    mockClearMustChangePassword(userId);
    return;
  }
  await db.update(users).set({ mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function markAllUsersMustChangePassword() {
  const db = await getDb();
  if (!db) return { updated: 0 };
  const result = await db.update(users).set({ mustChangePassword: true, updatedAt: new Date() });
  return { updated: Number((result as any)[0]?.affectedRows ?? 0) };
}
