const STORAGE_KEY = "thoth.gemini.enc";
/** Plaintext key for current browser tab only; cleared when the tab closes or user locks. */
const SESSION_KEY = "thoth.gemini.session";
const VERSION = 1;
const PBKDF2_ITERATIONS = 210_000;

export interface EncryptedKeyBlob {
  v: number;
  salt: string;
  iv: string;
  ciphertext: string;
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

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const saltBuf = new Uint8Array(salt);
  const enc = new TextEncoder();
  const passphraseBytes = new Uint8Array(enc.encode(passphrase));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passphraseBytes,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuf,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function hasEncryptedGeminiKey(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as EncryptedKeyBlob;
    return (
      parsed.v === VERSION &&
      typeof parsed.salt === "string" &&
      typeof parsed.iv === "string" &&
      typeof parsed.ciphertext === "string"
    );
  } catch {
    return false;
  }
}

export async function saveEncryptedGeminiKey(
  apiKey: string,
  passphrase: string,
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    enc.encode(apiKey),
  );
  const blob: EncryptedKeyBlob = {
    v: VERSION,
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(ciphertext),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
}

export async function decryptGeminiKey(passphrase: string): Promise<string> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error("No saved API key.");
  const blob = JSON.parse(raw) as EncryptedKeyBlob;
  if (blob.v !== VERSION) throw new Error("Unsupported key format.");
  const salt = new Uint8Array(fromB64(blob.salt));
  const iv = new Uint8Array(fromB64(blob.iv));
  const data = new Uint8Array(fromB64(blob.ciphertext));
  const aesKey = await deriveAesKey(passphrase, salt);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      data,
    );
  } catch {
    throw new Error("Wrong passphrase or corrupted data.");
  }
  return new TextDecoder().decode(plain);
}

export function clearEncryptedGeminiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
  clearGeminiKeySession();
}

/** Remember decrypted key until tab close or explicit lock (not persisted across tabs). */
export function saveGeminiKeyToSession(apiKey: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, apiKey);
  } catch {
    // private mode / quota
  }
}

export function loadGeminiKeyFromSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function clearGeminiKeySession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
