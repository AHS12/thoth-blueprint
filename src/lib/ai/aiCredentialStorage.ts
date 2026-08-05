import type { AiProviderId } from "@/lib/types";

const STORAGE_KEY = "thoth.ai.providers.enc";
const LEGACY_GEMINI_STORAGE_KEY = "thoth.gemini.enc";
const SESSION_KEY_PREFIX = "thoth.ai.session.";
const LEGACY_GEMINI_SESSION_KEY = "thoth.gemini.session";
const VERSION = 2;
const LEGACY_VERSION = 1;
const PBKDF2_ITERATIONS = 210_000;

export interface EncryptedKeyBlob {
  v: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

interface EncryptedProviderStore {
  v: number;
  providers: Partial<Record<AiProviderId, EncryptedKeyBlob>>;
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isBlob(value: unknown): value is EncryptedKeyBlob {
  if (!value || typeof value !== "object") return false;
  const blob = value as Partial<EncryptedKeyBlob>;
  return (
    blob.v === LEGACY_VERSION &&
    typeof blob.salt === "string" &&
    typeof blob.iv === "string" &&
    typeof blob.ciphertext === "string"
  );
}

function readStore(): EncryptedProviderStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { v: VERSION, providers: {} };
    const parsed = JSON.parse(raw) as Partial<EncryptedProviderStore>;
    if (parsed.v !== VERSION || !parsed.providers) {
      return { v: VERSION, providers: {} };
    }
    return {
      v: VERSION,
      providers: parsed.providers,
    };
  } catch {
    return { v: VERSION, providers: {} };
  }
}

function readProviderBlob(provider: AiProviderId): EncryptedKeyBlob | null {
  const current = readStore().providers[provider];
  if (current && isBlob(current)) return current;

  // Read the original Gemini-only format so existing users do not lose access.
  if (provider === "gemini") {
    try {
      const legacyRaw = localStorage.getItem(LEGACY_GEMINI_STORAGE_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as unknown;
        if (isBlob(legacy)) return legacy;
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function hasEncryptedAiKey(provider: AiProviderId): boolean {
  return readProviderBlob(provider) !== null;
}

export async function saveEncryptedAiKey(
  provider: AiProviderId,
  apiKey: string,
  passphrase: string,
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(apiKey),
  );
  const store = readStore();
  store.providers[provider] = {
    v: LEGACY_VERSION,
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(ciphertext),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function decryptAiKey(
  provider: AiProviderId,
  passphrase: string,
): Promise<string> {
  const blob = readProviderBlob(provider);
  if (!blob) throw new Error("No saved API key.");

  const aesKey = await deriveAesKey(passphrase, fromB64(blob.salt));
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(blob.iv) },
      aesKey,
      fromB64(blob.ciphertext),
    );
  } catch {
    throw new Error("Wrong passphrase or corrupted data.");
  }
  return new TextDecoder().decode(plain);
}

export function clearEncryptedAiKey(provider: AiProviderId): void {
  const store = readStore();
  delete store.providers[provider];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  if (provider === "gemini") {
    localStorage.removeItem(LEGACY_GEMINI_STORAGE_KEY);
  }
  clearAiKeySession(provider);
}

export function saveAiKeyToSession(provider: AiProviderId, apiKey: string): void {
  try {
    sessionStorage.setItem(`${SESSION_KEY_PREFIX}${provider}`, apiKey);
  } catch {
    // Ignore private-mode or quota errors; the in-memory ref remains usable.
  }
}

export function loadAiKeyFromSession(provider: AiProviderId): string | null {
  try {
    return (
      sessionStorage.getItem(`${SESSION_KEY_PREFIX}${provider}`) ??
      (provider === "gemini"
        ? sessionStorage.getItem(LEGACY_GEMINI_SESSION_KEY)
        : null)
    );
  } catch {
    return null;
  }
}

export function clearAiKeySession(provider: AiProviderId): void {
  try {
    sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${provider}`);
    if (provider === "gemini") {
      sessionStorage.removeItem(LEGACY_GEMINI_SESSION_KEY);
    }
  } catch {
    // Ignore session storage failures.
  }
}
