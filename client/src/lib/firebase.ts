import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
  type Auth,
} from "firebase/auth";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseWebConfigReady = Object.values(config).every(value => Boolean(value));
let app: FirebaseApp | null = null;
let messagingPromise: Promise<Messaging | null> | null = null;
let auth: Auth | null = null;

export function getFirebaseAuth() {
  if (!firebaseWebConfigReady) return null;
  app ??= initializeApp(config);
  auth ??= getAuth(app);
  return auth;
}

export function getFirebaseMessaging() {
  if (!firebaseWebConfigReady) return Promise.resolve(null);
  if (!messagingPromise) {
    messagingPromise = isSupported().then(supported => {
      if (!supported) return null;
      app ??= initializeApp(config);
      return getMessaging(app);
    }).catch(() => null);
  }
  return messagingPromise;
}

export const firebaseVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

/* ------------------------------------------------------------------ */
/* وضع التشغيل المستقل (Mock Mode): مصادقة وهمية بلا Firebase خارجي.    */
/* ------------------------------------------------------------------ */

export const firebaseMockMode = !firebaseWebConfigReady;

export type AuthUserLike = {
  email: string | null;
  uid: string;
  emailVerified: boolean;
  getIdToken: () => Promise<string>;
};

function base64UrlEncode(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createMockIdToken(email: string, provider: "google.com" | "password"): string {
  const header = base64UrlEncode({ alg: "none", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode({
    sub: `mock-uid-${email.replace(/[^a-z0-9]/gi, "")}`,
    email,
    email_verified: true,
    name: email,
    firebase: { sign_in_provider: provider, identities: { email: [email] } },
    aud: "rakiza-mock",
    iss: "https://securetoken.google.com/rakiza-mock",
    iat: now,
    exp: now + 3600,
    auth_time: now,
  });
  return `${header}.${payload}.`;
}

function mockUser(email: string, provider: "google.com" | "password"): AuthUserLike {
  return {
    email,
    uid: `mock-uid-${email.replace(/[^a-z0-9]/gi, "")}`,
    emailVerified: true,
    getIdToken: async () => createMockIdToken(email, provider),
  };
}

/** دخول بالبريد وكلمة المرور (حقيقي أو وهمي حسب التهيئة). */
export async function authSignInWithEmailAndPassword(email: string, password: string) {
  if (firebaseMockMode) {
    return { user: mockUser(email.trim().toLowerCase(), "password") };
  }
  const realAuth = getFirebaseAuth();
  if (!realAuth) throw new Error("إعداد الدخول غير مكتمل حالياً.");
  return signInWithEmailAndPassword(realAuth, email, password);
}

/** إنشاء حساب بريد جديد (حقيقي أو وهمي). */
export async function authCreateUserWithEmailAndPassword(email: string, password: string) {
  if (firebaseMockMode) {
    return { user: mockUser(email.trim().toLowerCase(), "password") };
  }
  const realAuth = getFirebaseAuth();
  if (!realAuth) throw new Error("إعداد الدخول غير مكتمل حالياً.");
  return createUserWithEmailAndPassword(realAuth, email, password);
}

/** دخول المالك عبر Google (وهمي: يعيد بريد المالك حصراً). */
export async function authSignInWithPopup() {
  if (firebaseMockMode) {
    return { user: mockUser("rakizaplatform@gmail.com", "google.com") };
  }
  const realAuth = getFirebaseAuth();
  if (!realAuth) throw new Error("إعداد الدخول غير مكتمل حالياً.");
  return signInWithPopup(realAuth, new GoogleAuthProvider());
}

export async function authSignInWithRedirect() {
  if (firebaseMockMode) return;
  const realAuth = getFirebaseAuth();
  if (!realAuth) throw new Error("إعداد الدخول غير مكتمل حالياً.");
  await signInWithRedirect(realAuth, new GoogleAuthProvider());
}

export async function authGetRedirectResult() {
  if (firebaseMockMode) return null;
  const realAuth = getFirebaseAuth();
  if (!realAuth) return null;
  return getRedirectResult(realAuth);
}

export async function authSignOut() {
  if (firebaseMockMode) return;
  const realAuth = getFirebaseAuth();
  if (realAuth) await signOut(realAuth);
}

export async function authSendEmailVerification(_user: AuthUserLike) {
  if (firebaseMockMode) return;
}

export async function authUpdatePassword(_user: AuthUserLike, _password: string) {
  if (firebaseMockMode) return;
}

