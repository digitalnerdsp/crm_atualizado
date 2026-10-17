import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createId } from "@paralleldrive/cuid2";
import { config } from "dotenv-mono";

config();

const DEFAULT_MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_PRESIGN_TTL_SECONDS = 300;
const DEFAULT_LOCAL_UPLOAD_DIR = "data/uploads";

const allowedImageMimeTypes = new Set([
  "image/apng",
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function isImageContentType(contentType: string) {
  return allowedImageMimeTypes.has(contentType.toLowerCase());
}

type UploadSurface = "description" | "comment";

type StorageConfig = {
  mode: "local" | "s3";
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
  keyPrefix: string;
  forcePathStyle: boolean;
  maxImageUploadBytes: number;
  presignTtlSeconds: number;
  localUploadDir: string;
  localUploadSecret: string;
};

type TaskImageUploadContext = {
  workspaceId: string;
  projectId: string;
  taskId: string;
  surface: UploadSurface;
  filename: string;
  contentType: string;
  size: number;
  apiBaseUrl?: string;
};

type TaskImageUploadUrl = {
  key: string;
  uploadUrl: string;
  headers: Record<string, string>;
};

type AssetObject = {
  body: unknown;
  contentType: string | undefined;
  contentLength: number | undefined;
  etag: string | undefined;
  lastModified: Date | undefined;
};

let clientCache:
  | {
      cacheKey: string;
      client: S3Client;
    }
  | undefined;

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function getStorageMode(): "local" | "s3" {
  const explicitMode = (
    env("FILE_STORAGE_DRIVER") ||
    env("FILES_STORAGE_MODE") ||
    env("STORAGE_DRIVER") ||
    env("STORAGE_MODE")
  ).toLowerCase();

  if (explicitMode === "s3" || explicitMode === "minio") return "s3";
  if (explicitMode === "local" || explicitMode === "filesystem") {
    return "local";
  }

  return env("S3_ENDPOINT") && env("S3_BUCKET") ? "s3" : "local";
}

export function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback;
  return value.trim().toLowerCase() === "true";
}

export function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value?.trim() || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/**
 * Resolves static S3 credentials from the access key pair.
 *
 * Returns the explicit credentials only when BOTH the access key id and secret
 * are provided. When neither is set, returns `undefined` so the AWS SDK falls
 * back to its default credential provider chain (EC2 instance profile, ECS task
 * role, EKS IRSA, environment variables, or shared config) — enabling
 * IAM-role-based access without static keys.
 *
 * Throws when exactly one of the two is set, since that is almost always a
 * misconfiguration rather than an intentional fallback.
 */
export function resolveS3Credentials(
  accessKeyId: string,
  secretAccessKey: string,
): { accessKeyId: string; secretAccessKey: string } | undefined {
  const hasAccessKeyId = Boolean(accessKeyId);
  const hasSecretAccessKey = Boolean(secretAccessKey);

  if (hasAccessKeyId !== hasSecretAccessKey) {
    throw new Error(
      "Incomplete S3 credentials. Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither to use the default AWS credential provider chain (IAM role / IRSA / environment).",
    );
  }

  if (hasAccessKeyId && hasSecretAccessKey) {
    return { accessKeyId, secretAccessKey };
  }

  return undefined;
}

function getStorageConfig(): StorageConfig {
  const mode = getStorageMode();
  const endpoint = env("S3_ENDPOINT");
  const bucket = env("S3_BUCKET");
  const accessKeyId = env("S3_ACCESS_KEY_ID");
  const secretAccessKey = env("S3_SECRET_ACCESS_KEY");
  const localUploadSecret = env("LOCAL_UPLOAD_SECRET") || env("AUTH_SECRET");

  if (mode === "s3" && (!endpoint || !bucket)) {
    throw new Error(
      "S3 uploads are not configured. Set S3_ENDPOINT and S3_BUCKET (and either both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither to use the default AWS credential provider chain / IAM role).",
    );
  }

  // Validate the access key pair early so misconfiguration surfaces here rather
  // than as an opaque signing error later.
  if (mode === "s3") {
    resolveS3Credentials(accessKeyId, secretAccessKey);
  }
  if (mode === "local" && localUploadSecret.length < 32) {
    throw new Error(
      "Local uploads require LOCAL_UPLOAD_SECRET or AUTH_SECRET with at least 32 characters.",
    );
  }

  return {
    mode,
    endpoint,
    region: env("S3_REGION") || "us-east-1",
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: env("S3_PUBLIC_BASE_URL") || undefined,
    keyPrefix: env("S3_KEY_PREFIX"),
    forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE, true),
    maxImageUploadBytes: parsePositiveInt(
      process.env.S3_MAX_IMAGE_UPLOAD_BYTES,
      DEFAULT_MAX_IMAGE_UPLOAD_BYTES,
    ),
    presignTtlSeconds: parsePositiveInt(
      process.env.S3_PRESIGN_TTL_SECONDS,
      DEFAULT_PRESIGN_TTL_SECONDS,
    ),
    localUploadDir:
      env("LOCAL_UPLOAD_DIR") ||
      env("FILES_UPLOAD_DIR") ||
      DEFAULT_LOCAL_UPLOAD_DIR,
    localUploadSecret,
  };
}

function getMaxImageUploadBytes() {
  const maxUploadMb = parsePositiveInt(process.env.FILES_MAX_UPLOAD_MB, 0);
  if (maxUploadMb > 0) return maxUploadMb * 1024 * 1024;

  return parsePositiveInt(
    process.env.FILES_MAX_UPLOAD_BYTES || process.env.S3_MAX_IMAGE_UPLOAD_BYTES,
    DEFAULT_MAX_IMAGE_UPLOAD_BYTES,
  );
}

function getClient(config: StorageConfig) {
  const cacheKey = JSON.stringify({
    endpoint: config.endpoint,
    region: config.region,
    accessKeyId: config.accessKeyId,
    bucket: config.bucket,
    forcePathStyle: config.forcePathStyle,
  });

  if (clientCache?.cacheKey === cacheKey) {
    return clientCache.client;
  }

  const clientConfig: S3ClientConfig = {
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    // Avoid auto-injecting checksum params for presigned PUT URLs. Some
    // S3-compatible providers (e.g. Garage/R2) reject mismatched hoisted CRCs.
    requestChecksumCalculation: "WHEN_REQUIRED",
  };

  const credentials = resolveS3Credentials(
    config.accessKeyId,
    config.secretAccessKey,
  );

  // Only pin explicit credentials when both keys are provided. Otherwise leave
  // `credentials` unset so the AWS SDK resolves them from its default provider
  // chain (EC2 instance profile, ECS task role, EKS IRSA, env, shared config),
  // which is how IAM-role-based access works.
  if (credentials) {
    clientConfig.credentials = credentials;
  }

  const client = new S3Client(clientConfig);
  clientCache = { cacheKey, client };
  return client;
}

export function sanitizePathSegment(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "") || "file"
  );
}

export function getFileExtension(filename: string) {
  const normalized = filename.trim();
  const extension = normalized.includes(".")
    ? normalized.split(".").pop() || ""
    : "";

  return sanitizePathSegment(extension).slice(0, 12);
}

export function buildObjectKeyPrefix(
  context: Omit<TaskImageUploadContext, "filename" | "contentType" | "size">,
) {
  const surfaceFolder =
    context.surface === "comment" ? "comments" : "descriptions";

  return [
    "workspace",
    sanitizePathSegment(context.workspaceId),
    "project",
    sanitizePathSegment(context.projectId),
    "task",
    sanitizePathSegment(context.taskId),
    surfaceFolder,
  ].join("/");
}

export function buildObjectKey(context: TaskImageUploadContext) {
  const extension = getFileExtension(context.filename);
  const objectKeyPrefix = buildObjectKeyPrefix(context);
  const timestamp = Date.now();
  const randomId = createId();

  const baseName = sanitizePathSegment(
    context.filename.replace(/\.[^/.]+$/, "") || "image",
  ).slice(0, 64);

  const fileName = extension
    ? `${baseName}-${timestamp}-${randomId}.${extension}`
    : `${baseName}-${timestamp}-${randomId}`;

  return `${objectKeyPrefix}/${fileName}`;
}

export function applyKeyPrefix(prefix: string, key: string) {
  if (!prefix) return key;
  const trimmed = prefix.replace(/\/+$/, "");
  return `${trimmed}/${key}`;
}

function normalizeApiBaseUrl(input?: string) {
  const raw = input || process.env.KANEO_API_URL || "http://localhost:1337";
  const withoutTrailingSlash = raw.replace(/\/+$/, "");
  return withoutTrailingSlash.endsWith("/api")
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/api`;
}

function localUploadPayload(input: {
  key: string;
  contentType: string;
  size: number;
  expiresAt: number;
}) {
  return [
    input.key,
    input.contentType.toLowerCase().trim(),
    input.size.toString(),
    input.expiresAt.toString(),
  ].join("\n");
}

function signLocalUpload(
  config: StorageConfig,
  input: {
    key: string;
    contentType: string;
    size: number;
    expiresAt: number;
  },
) {
  return createHmac("sha256", config.localUploadSecret)
    .update(localUploadPayload(input))
    .digest("hex");
}

function signaturesMatch(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function getLocalObjectPath(config: StorageConfig, key: string) {
  const root = path.resolve(config.localUploadDir);
  const objectPath = path.resolve(root, key);

  if (objectPath !== root && !objectPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid local upload key.");
  }

  return { root, objectPath };
}

function createLocalUploadUrl(
  config: StorageConfig,
  input: {
    key: string;
    contentType: string;
    size?: number;
    apiBaseUrl?: string;
  },
) {
  const size = input.size ?? 0;
  const expiresAt = Date.now() + config.presignTtlSeconds * 1000;
  const signature = signLocalUpload(config, {
    key: input.key,
    contentType: input.contentType,
    size,
    expiresAt,
  });
  const uploadUrl = new URL(
    `${normalizeApiBaseUrl(input.apiBaseUrl)}/storage/local-upload`,
  );

  uploadUrl.searchParams.set("key", input.key);
  uploadUrl.searchParams.set("contentType", input.contentType);
  uploadUrl.searchParams.set("size", size.toString());
  uploadUrl.searchParams.set("expiresAt", expiresAt.toString());
  uploadUrl.searchParams.set("signature", signature);

  return uploadUrl.toString();
}

export function validateTaskAssetUploadInput(
  contentType: string,
  size: number,
) {
  const maxImageUploadBytes = getMaxImageUploadBytes();

  if (!contentType.trim()) {
    throw new Error("A valid content type is required.");
  }

  if (size <= 0) {
    throw new Error("Upload size must be greater than zero.");
  }

  if (size > maxImageUploadBytes) {
    throw new Error(
      `Upload exceeds the maximum upload size of ${Math.floor(maxImageUploadBytes / (1024 * 1024))}MB.`,
    );
  }
}

export async function createTaskImageUploadUrl(
  context: TaskImageUploadContext,
): Promise<TaskImageUploadUrl> {
  const config = getStorageConfig();
  const rawKey = buildObjectKey(context);
  const key = applyKeyPrefix(config.keyPrefix, rawKey);

  if (config.mode === "local") {
    return {
      key,
      uploadUrl: createLocalUploadUrl(config, {
        key,
        contentType: context.contentType,
        size: context.size,
        apiBaseUrl: context.apiBaseUrl,
      }),
      headers: {
        "Content-Type": context.contentType,
      },
    };
  }

  const client = getClient(config);

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: context.contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: config.presignTtlSeconds,
  });

  return {
    key,
    uploadUrl,
    headers: {
      "Content-Type": context.contentType,
    },
  };
}

export async function createUserAvatarUploadUrl(input: {
  userId: string;
  filename: string;
  contentType: string;
  size: number;
  apiBaseUrl?: string;
}) {
  validateTaskAssetUploadInput(input.contentType, input.size);
  if (!isImageContentType(input.contentType)) {
    throw new Error("Avatar must be an image.");
  }

  const config = getStorageConfig();
  const extension = getFileExtension(input.filename);
  const key = applyKeyPrefix(
    config.keyPrefix,
    `avatars/${sanitizePathSegment(input.userId)}/${Date.now()}-${createId()}${
      extension ? `.${extension}` : ""
    }`,
  );

  if (config.mode === "local") {
    return {
      key,
      uploadUrl: createLocalUploadUrl(config, {
        key,
        contentType: input.contentType,
        size: input.size,
        apiBaseUrl: input.apiBaseUrl,
      }),
      headers: { "Content-Type": input.contentType },
    };
  }

  const client = getClient(config);
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: input.contentType,
    }),
    { expiresIn: config.presignTtlSeconds },
  );

  return {
    key,
    uploadUrl,
    headers: { "Content-Type": input.contentType },
  };
}

export function assertUserAvatarKey(key: string, userId: string) {
  const config = getStorageConfig();
  const prefix = `${applyKeyPrefix(
    config.keyPrefix,
    `avatars/${sanitizePathSegment(userId)}`,
  )}/`;
  return key.startsWith(prefix);
}

export function assertStorageConfigured() {
  return getStorageConfig();
}

export function assertTaskImageKeyMatchesContext(
  key: string,
  context: Omit<TaskImageUploadContext, "filename" | "contentType" | "size">,
) {
  const config = getStorageConfig();
  const objectPrefix = buildObjectKeyPrefix(context);
  const fullPrefix = `${applyKeyPrefix(config.keyPrefix, objectPrefix)}/`;
  return key.startsWith(fullPrefix);
}

export async function uploadLocalObjectFromSignedRequest(request: Request) {
  const config = getStorageConfig();
  if (config.mode !== "local") {
    throw new Error("Local uploads are disabled.");
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key")?.trim() || "";
  const contentType = url.searchParams.get("contentType")?.trim() || "";
  const size = parsePositiveInt(url.searchParams.get("size") || undefined, 0);
  const expiresAt = Number.parseInt(
    url.searchParams.get("expiresAt") || "",
    10,
  );
  const signature = url.searchParams.get("signature")?.trim() || "";

  if (!key || !contentType || !size || !expiresAt || !signature) {
    throw new Error("Invalid local upload URL.");
  }

  if (Date.now() > expiresAt) {
    throw new Error("Local upload URL expired.");
  }

  const expectedSignature = signLocalUpload(config, {
    key,
    contentType,
    size,
    expiresAt,
  });

  if (!signaturesMatch(signature, expectedSignature)) {
    throw new Error("Invalid local upload signature.");
  }

  const requestContentType =
    request.headers.get("content-type")?.toLowerCase().split(";")[0]?.trim() ||
    "";
  if (requestContentType !== contentType.toLowerCase()) {
    throw new Error("Local upload content type does not match.");
  }

  validateTaskAssetUploadInput(contentType, size);

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.byteLength !== size) {
    throw new Error("Local upload size does not match.");
  }

  const { objectPath } = getLocalObjectPath(config, key);
  await mkdir(path.dirname(objectPath), { recursive: true });
  await writeFile(objectPath, buffer, { flag: "wx" });
}

export async function assertUploadedObjectExists(key: string) {
  const config = getStorageConfig();
  if (config.mode !== "local") return;

  const { objectPath } = getLocalObjectPath(config, key);
  const objectStat = await stat(objectPath);
  if (!objectStat.isFile()) {
    throw new Error("Uploaded object is not a file.");
  }
}

export async function getPrivateObject(key: string): Promise<AssetObject> {
  const config = getStorageConfig();

  if (config.mode === "local") {
    const { objectPath } = getLocalObjectPath(config, key);
    const objectStat = await stat(objectPath);

    return {
      body: Readable.toWeb(createReadStream(objectPath)),
      contentType: undefined,
      contentLength: objectStat.size,
      etag: `"local-${objectStat.size}-${objectStat.mtimeMs}"`,
      lastModified: objectStat.mtime,
    };
  }

  const client = getClient(config);
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error("Storage object body is missing.");
  }

  const body =
    "transformToWebStream" in response.Body
      ? response.Body.transformToWebStream()
      : Readable.toWeb(response.Body as Readable);

  return {
    body,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    etag: response.ETag,
    lastModified: response.LastModified,
  };
}

export async function deleteS3Object(key: string): Promise<void> {
  const config = getStorageConfig();

  if (config.mode === "local") {
    const { objectPath } = getLocalObjectPath(config, key);
    await rm(objectPath, { force: true });
    return;
  }

  const client = getClient(config);
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  );
}
