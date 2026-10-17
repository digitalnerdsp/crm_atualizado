import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const SECRET_PREFIX = "enc:v1";

function getEncryptionKey() {
  const rawKey = process.env.SETTINGS_ENCRYPTION_KEY || process.env.AUTH_SECRET;

  if (!rawKey || rawKey.length < 16) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY or AUTH_SECRET must be configured to store secret settings.",
    );
  }

  return createHash("sha256").update(rawKey).digest();
}

export function isEncryptedSecret(value: string) {
  return value.startsWith(`${SECRET_PREFIX}:`);
}

export function encryptSettingSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    SECRET_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSettingSecret(value: string) {
  if (!isEncryptedSecret(value)) return value;

  const [, , ivBase64, authTagBase64, encryptedBase64] = value.split(":");
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("Invalid encrypted secret format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivBase64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
