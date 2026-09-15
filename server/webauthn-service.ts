import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { webauthnChallenges, webauthnCredentials, users } from "../drizzle/schema";
import { getDb } from "./db";
import { mockConsumeChallenge, mockGetCredential, mockGetLatestChallenge, mockGetUserByEmail, mockGetUserById, mockInsertChallenge, mockInsertCredential, mockListCredentials, mockUpdateCredentialCounter } from "./mock-store";
import { isAllowedLoginEmail } from "./court-service";

const RP_NAME = "رَكيزة";
export const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function isWebAuthnChallengeUsable(challenge: { expiresAt: Date; consumedAt: Date | null }, now = Date.now()) {
  return challenge.consumedAt === null && challenge.expiresAt.getTime() > now;
}

function rpId(origin?: string) {
  const configured = process.env.WEBAUTHN_RP_ID?.trim();
  if (configured) return configured;
  try {
    return new URL(origin ?? "http://localhost:3000").hostname;
  } catch {
    return "localhost";
  }
}

function expectedOrigin(origin?: string) {
  return process.env.WEBAUTHN_ORIGIN?.trim() || origin || `http://${rpId()}:3000`;
}

function publicKeyBytes(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function credentialTransports(value: string | null) {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as Array<"ble" | "hybrid" | "internal" | "nfc" | "usb">;
  } catch {
    return undefined;
  }
}

export async function beginPasskeyRegistration(input: { userId: number; officialEmail: string; origin?: string }) {
  const db = await getDb();
  if (!db) return mockBeginPasskeyRegistration(input);
  const email = input.officialEmail.trim().toLowerCase();
  if (!isAllowedLoginEmail(email)) throw new Error("يجب استخدام البريد الرسمي المعتمد.");
  const [user] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(and(eq(users.id, input.userId), eq(users.email, email))).limit(1);
  if (!user) throw new Error("لا يتطابق البريد الرسمي مع الحساب الحالي.");
  const existing = await db.select({ credentialId: webauthnCredentials.credentialId }).from(webauthnCredentials).where(eq(webauthnCredentials.userId, user.id));
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId(input.origin),
    userName: email,
    userDisplayName: user.name ?? email,
    userID: new Uint8Array(new TextEncoder().encode(email)),
    attestationType: "none",
    excludeCredentials: existing.map(item => ({ id: item.credentialId })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await db.insert(webauthnChallenges).values({ userId: user.id, email, challenge: options.challenge, flow: "registration", expiresAt: new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS), consumedAt: null });
  return options;
}

export async function finishPasskeyRegistration(input: { userId: number; officialEmail: string; response: RegistrationResponseJSON; origin?: string }) {
  const db = await getDb();
  if (!db) return mockFinishPasskeyRegistration(input);
  const email = input.officialEmail.trim().toLowerCase();
  const [challenge] = await db.select().from(webauthnChallenges).where(and(eq(webauthnChallenges.userId, input.userId), eq(webauthnChallenges.email, email), eq(webauthnChallenges.flow, "registration"), isNull(webauthnChallenges.consumedAt), gt(webauthnChallenges.expiresAt, new Date()))).orderBy(desc(webauthnChallenges.createdAt)).limit(1);
  if (!challenge) throw new Error("انتهت جلسة تسجيل مفتاح المرور أو استُخدمت مسبقاً.");
  const verification = await verifyRegistrationResponse({ response: input.response, expectedChallenge: challenge.challenge, expectedOrigin: expectedOrigin(input.origin), expectedRPID: rpId(input.origin), requireUserVerification: true });
  if (!verification.verified || !verification.registrationInfo) throw new Error("تعذر التحقق من مفتاح المرور.");
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  await db.insert(webauthnCredentials).values({ userId: input.userId, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey).toString("base64"), counter: credential.counter, transports: input.response.response.transports ? JSON.stringify(input.response.response.transports) : null, deviceType: credentialDeviceType, backedUp: credentialBackedUp });
  await db.update(webauthnChallenges).set({ consumedAt: new Date() }).where(eq(webauthnChallenges.id, challenge.id));
  return { verified: true as const, credentialId: credential.id };
}

export async function beginPasskeyAuthentication(input: { officialEmail: string; origin?: string }) {
  const db = await getDb();
  if (!db) return mockBeginPasskeyAuthentication(input);
  const email = input.officialEmail.trim().toLowerCase();
  if (!isAllowedLoginEmail(email)) throw new Error("يجب استخدام البريد الرسمي المعتمد.");
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error("لا يوجد حساب مرتبط بهذا البريد الرسمي.");
  const credentials = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, user.id));
  if (!credentials.length) throw new Error("لا يوجد مفتاح مرور مسجل لهذا الحساب.");
  const options = await generateAuthenticationOptions({ rpID: rpId(input.origin), allowCredentials: credentials.map(item => ({ id: item.credentialId, transports: credentialTransports(item.transports) })), userVerification: "required" });
  await db.insert(webauthnChallenges).values({ userId: user.id, email, challenge: options.challenge, flow: "authentication", expiresAt: new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS), consumedAt: null });
  return options;
}

export async function finishPasskeyAuthentication(input: { officialEmail: string; response: AuthenticationResponseJSON; origin?: string }) {
  const db = await getDb();
  if (!db) return mockFinishPasskeyAuthentication(input);
  const email = input.officialEmail.trim().toLowerCase();
  const [user] = await db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) return { verified: false as const, reason: "invalid" as const };
  const [challenge] = await db.select().from(webauthnChallenges).where(and(eq(webauthnChallenges.userId, user.id), eq(webauthnChallenges.email, email), eq(webauthnChallenges.flow, "authentication"), isNull(webauthnChallenges.consumedAt), gt(webauthnChallenges.expiresAt, new Date()))).orderBy(desc(webauthnChallenges.createdAt)).limit(1);
  if (!challenge) return { verified: false as const, reason: "expired" as const };
  const [credential] = await db.select().from(webauthnCredentials).where(and(eq(webauthnCredentials.userId, user.id), eq(webauthnCredentials.credentialId, input.response.id))).limit(1);
  if (!credential) return { verified: false as const, reason: "invalid" as const };
  const verification = await verifyAuthenticationResponse({ response: input.response, expectedChallenge: challenge.challenge, expectedOrigin: expectedOrigin(input.origin), expectedRPID: rpId(input.origin), credential: { id: credential.credentialId, publicKey: publicKeyBytes(credential.publicKey), counter: credential.counter, transports: credentialTransports(credential.transports) }, requireUserVerification: true });
  if (!verification.verified) return { verified: false as const, reason: "invalid" as const };
  await db.update(webauthnCredentials).set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() }).where(eq(webauthnCredentials.id, credential.id));
  await db.update(webauthnChallenges).set({ consumedAt: new Date() }).where(eq(webauthnChallenges.id, challenge.id));
  return { verified: true as const, user };
}

/* ------------------- وضع التشغيل المستقل (البصمة في الذاكرة) ------------------- */

async function mockBeginPasskeyRegistration(input: { userId: number; officialEmail: string; origin?: string }) {
  const email = input.officialEmail.trim().toLowerCase();
  if (!isAllowedLoginEmail(email)) throw new Error("يجب استخدام البريد الرسمي المعتمد.");
  const user = mockGetUserById(input.userId);
  if (!user || (user.email ?? "").toLowerCase() !== email) throw new Error("لا يتطابق البريد الرسمي مع الحساب الحالي.");
  const existing = mockListCredentials(user.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId(input.origin),
    userName: email,
    userDisplayName: user.name ?? email,
    userID: new Uint8Array(new TextEncoder().encode(email)),
    attestationType: "none",
    excludeCredentials: existing.map(item => ({ id: item.credentialId })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  mockInsertChallenge({ userId: user.id, email, challenge: options.challenge, flow: "registration", expiresAt: new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS) });
  return options;
}

async function mockFinishPasskeyRegistration(input: { userId: number; officialEmail: string; response: RegistrationResponseJSON; origin?: string }) {
  const email = input.officialEmail.trim().toLowerCase();
  const challenge = mockGetLatestChallenge(input.userId, email, "registration");
  if (!challenge) throw new Error("انتهت جلسة تسجيل مفتاح المرور أو استُخدمت مسبقاً.");
  const verification = await verifyRegistrationResponse({ response: input.response, expectedChallenge: challenge.challenge, expectedOrigin: expectedOrigin(input.origin), expectedRPID: rpId(input.origin), requireUserVerification: true });
  if (!verification.verified || !verification.registrationInfo) throw new Error("تعذر التحقق من مفتاح المرور.");
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  mockInsertCredential({
    userId: input.userId,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64"),
    counter: credential.counter,
    transports: input.response.response.transports ? JSON.stringify(input.response.response.transports) : null,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    lastUsedAt: null,
  });
  mockConsumeChallenge(challenge.id);
  return { verified: true as const, credentialId: credential.id };
}

async function mockBeginPasskeyAuthentication(input: { officialEmail: string; origin?: string }) {
  const email = input.officialEmail.trim().toLowerCase();
  if (!isAllowedLoginEmail(email)) throw new Error("يجب استخدام البريد الرسمي المعتمد.");
  const user = mockGetUserByEmail(email);
  if (!user) throw new Error("لا يوجد حساب مرتبط بهذا البريد الرسمي.");
  const credentials = mockListCredentials(user.id);
  if (!credentials.length) throw new Error("لا يوجد مفتاح مرور مسجل لهذا الحساب.");
  const options = await generateAuthenticationOptions({ rpID: rpId(input.origin), allowCredentials: credentials.map(item => ({ id: item.credentialId, transports: credentialTransports(item.transports) })), userVerification: "required" });
  mockInsertChallenge({ userId: user.id, email, challenge: options.challenge, flow: "authentication", expiresAt: new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS) });
  return options;
}

async function mockFinishPasskeyAuthentication(input: { officialEmail: string; response: AuthenticationResponseJSON; origin?: string }) {
  const email = input.officialEmail.trim().toLowerCase();
  const user = mockGetUserByEmail(email);
  if (!user) return { verified: false as const, reason: "invalid" as const };
  const challenge = mockGetLatestChallenge(user.id, email, "authentication");
  if (!challenge) return { verified: false as const, reason: "expired" as const };
  const credential = mockGetCredential(input.response.id);
  if (!credential || credential.userId !== user.id) return { verified: false as const, reason: "invalid" as const };
  const verification = await verifyAuthenticationResponse({ response: input.response, expectedChallenge: challenge.challenge, expectedOrigin: expectedOrigin(input.origin), expectedRPID: rpId(input.origin), credential: { id: credential.credentialId, publicKey: publicKeyBytes(credential.publicKey), counter: credential.counter, transports: credentialTransports(credential.transports) }, requireUserVerification: true });
  if (!verification.verified) return { verified: false as const, reason: "invalid" as const };
  mockUpdateCredentialCounter(credential.id, verification.authenticationInfo.newCounter);
  mockConsumeChallenge(challenge.id);
  return { verified: true as const, user: { id: user.id, openId: user.openId, name: user.name, email: user.email } };
}
