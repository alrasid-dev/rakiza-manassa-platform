import type { User } from "../drizzle/schema";
import { ENV } from "./_core/env";

/**
 * مخزن ذاكرة وهمي (Mock Store) يُستخدم في وضع التشغيل المستقل
 * عندما تكون قاعدة البيانات الخارجية غير مهيأة.
 * يوفّر نفس سلوك الجداول الأساسية لدخول المستخدم والبصمة دون أي سر خارجي.
 */

export type MockCredential = {
  id: number;
  userId: number;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  deviceType: string | null;
  backedUp: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MockChallenge = {
  id: number;
  userId: number;
  email: string;
  challenge: string;
  flow: "registration" | "authentication";
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

const usersByOpenId = new Map<string, User>();
const usersByEmail = new Map<string, User>();
const usersByFirebaseUid = new Map<string, User>();
const credentials = new Map<string, MockCredential>();
const challenges: MockChallenge[] = [];
let nextId = 1;

function newId() {
  return nextId++;
}

/** openId قابل للاسترجاع في الوضع الوهمي حتى تبقى الجلسات صالحة بعد إعادة التشغيل. */
export function mockOpenIdForEmail(email: string) {
  return `mock:${email.trim().toLowerCase()}`;
}

function makeUser(partial: Partial<User> & { openId: string }): User {
  const now = new Date();
  return {
    id: partial.id ?? newId(),
    openId: partial.openId,
    name: partial.name ?? null,
    email: partial.email ?? null,
    firebaseUid: partial.firebaseUid ?? null,
    firebaseLinkedAt: partial.firebaseLinkedAt ?? now,
    activeDepartmentAccountId: null,
    backupEmail: null,
    backupEmailVerifiedAt: null,
    emailNotificationPreference: "work",
    dashboardPreferences: null,
    loginMethod: partial.loginMethod ?? null,
    role: partial.role ?? "user",
    mustChangePassword: partial.mustChangePassword ?? false,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    lastSignedIn: partial.lastSignedIn ?? now,
    phone: null,
  };
}

export function mockGetUserByOpenId(openId: string): User | undefined {
  const existing = usersByOpenId.get(openId);
  if (existing) return existing;
  // إعادة بناء المستخدم من openId الوهمي القابل للاسترجاع (يبقي الجلسة صالحة بعد إعادة التشغيل).
  if (openId.startsWith("mock:")) {
    const email = openId.slice("mock:".length);
    const user = makeUser({
      openId,
      email,
      name: email,
      role: email === ENV.platformOwnerEmail ? "admin" : "user",
      mustChangePassword: false,
    });
    usersByOpenId.set(openId, user);
    usersByEmail.set(email, user);
    return user;
  }
  return undefined;
}

export function mockGetUserByEmail(email: string): User | undefined {
  return usersByEmail.get(email.trim().toLowerCase());
}

export function mockGetUserByFirebaseUid(uid: string): User | undefined {
  return usersByFirebaseUid.get(uid);
}

export function mockGetUserById(id: number): User | undefined {
  for (const user of usersByOpenId.values()) {
    if (user.id === id) return user;
  }
  return undefined;
}

export function mockUpsertUser(user: User): User {
  usersByOpenId.set(user.openId, user);
  if (user.email) usersByEmail.set(user.email.toLowerCase(), user);
  if (user.firebaseUid) usersByFirebaseUid.set(user.firebaseUid, user);
  return user;
}

export function mockClearMustChangePassword(userId: number) {
  const user = mockGetUserById(userId);
  if (user) user.mustChangePassword = false;
}

/** ربط هوية Firebase وهمياً: ينشئ المستخدم أو يعيد ربطه بالبريد. */
export function mockLinkFirebaseIdentity(identity: {
  uid: string;
  email: string;
  name: string;
  provider: "google.com" | "password" | "unknown";
}) {
  const email = identity.email.trim().toLowerCase();
  const existing = mockGetUserByFirebaseUid(identity.uid) ?? mockGetUserByEmail(email);
  let user: User;
  if (existing) {
    existing.firebaseUid = identity.uid;
    existing.firebaseLinkedAt = new Date();
    existing.loginMethod = `firebase_${identity.provider}`;
    existing.name = existing.name ?? identity.name;
    existing.lastSignedIn = new Date();
    existing.updatedAt = new Date();
    user = existing;
  } else {
    user = mockUpsertUser(
      makeUser({
        openId: mockOpenIdForEmail(email),
        email,
        name: identity.name,
        firebaseUid: identity.uid,
        loginMethod: `firebase_${identity.provider}`,
        role: email === ENV.platformOwnerEmail ? "admin" : "user",
        mustChangePassword: false,
      })
    );
  }
  return { user, profileId: null as number | null };
}

/* ------------------------- البصمة (WebAuthn) ------------------------- */

export function mockListCredentials(userId: number) {
  return [...credentials.values()].filter(credential => credential.userId === userId);
}

export function mockGetCredential(credentialId: string) {
  return credentials.get(credentialId);
}

export function mockInsertCredential(credential: Omit<MockCredential, "id" | "createdAt" | "updatedAt">) {
  const now = new Date();
  const record: MockCredential = { ...credential, id: newId(), createdAt: now, updatedAt: now };
  credentials.set(credential.credentialId, record);
  return record;
}

export function mockUpdateCredentialCounter(id: number, counter: number) {
  const credential = [...credentials.values()].find(item => item.id === id);
  if (credential) {
    credential.counter = counter;
    credential.lastUsedAt = new Date();
    credential.updatedAt = new Date();
  }
}

export function mockInsertChallenge(challenge: Omit<MockChallenge, "id" | "createdAt" | "consumedAt">) {
  const record: MockChallenge = { ...challenge, id: newId(), createdAt: new Date(), consumedAt: null };
  challenges.push(record);
  return record;
}

export function mockGetLatestChallenge(userId: number, email: string, flow: "registration" | "authentication") {
  const now = Date.now();
  return challenges
    .filter(item => item.userId === userId && item.email === email && item.flow === flow && item.consumedAt === null && item.expiresAt.getTime() > now)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

export function mockConsumeChallenge(id: number) {
  const challenge = challenges.find(item => item.id === id);
  if (challenge) challenge.consumedAt = new Date();
}

/** لأغراض الاختبار فقط. */
export function resetMockStore() {
  usersByOpenId.clear();
  usersByEmail.clear();
  usersByFirebaseUid.clear();
  credentials.clear();
  challenges.length = 0;
  nextId = 1;
}

