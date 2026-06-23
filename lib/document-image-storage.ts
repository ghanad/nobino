import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

export const MAX_DOCUMENT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_IMAGE_PIXELS = 25_000_000;

export class DocumentImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentImageError";
  }
}

export function getDocumentImageDirectory(): string {
  return path.resolve(process.env.DOCUMENT_IMAGE_DIR || path.join(process.cwd(), "data", "document-images"));
}

export function resolveDocumentImagePath(storedFileName: string): string {
  if (!/^[a-f0-9]{48}\.webp$/.test(storedFileName)) {
    throw new DocumentImageError("مسیر تصویر نامعتبر است.");
  }
  const directory = getDocumentImageDirectory();
  const resolved = path.resolve(directory, storedFileName);
  if (path.dirname(resolved) !== directory) {
    throw new DocumentImageError("مسیر تصویر نامعتبر است.");
  }
  return resolved;
}

export async function processAndStoreDocumentImage(input: {
  bytes: Buffer;
  declaredMimeType: string;
}): Promise<{ byteSize: number; height: number; mimeType: string; storedFileName: string; width: number }> {
  if (!input.bytes.length || input.bytes.length > MAX_DOCUMENT_IMAGE_BYTES) {
    throw new DocumentImageError("حجم تصویر باید حداکثر ۵ مگابایت باشد.");
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(input.declaredMimeType)) {
    throw new DocumentImageError("فقط تصویر JPEG، PNG یا WebP پذیرفته می‌شود.");
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input.bytes, { limitInputPixels: MAX_DOCUMENT_IMAGE_PIXELS }).metadata();
  } catch {
    throw new DocumentImageError("فایل بارگذاری‌شده تصویر معتبر نیست.");
  }
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_DOCUMENT_IMAGE_PIXELS) {
    throw new DocumentImageError("ابعاد تصویر بیش از حد مجاز است.");
  }
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new DocumentImageError("قالب واقعی تصویر پشتیبانی نمی‌شود.");
  }

  let output: Buffer;
  try {
    output = await sharp(input.bytes, { limitInputPixels: MAX_DOCUMENT_IMAGE_PIXELS })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new DocumentImageError("پردازش تصویر انجام نشد.");
  }

  const outputMetadata = await sharp(output).metadata();
  if (!outputMetadata.width || !outputMetadata.height) {
    throw new DocumentImageError("پردازش تصویر انجام نشد.");
  }

  const directory = getDocumentImageDirectory();
  await mkdir(directory, { recursive: true });
  const storedFileName = `${randomBytes(24).toString("hex")}.webp`;
  const finalPath = resolveDocumentImagePath(storedFileName);
  const temporaryPath = `${finalPath}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporaryPath, output, { flag: "wx" });
    await rename(temporaryPath, finalPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return { byteSize: output.length, height: outputMetadata.height, mimeType: "image/webp", storedFileName, width: outputMetadata.width };
}

export async function deleteStoredDocumentImage(storedFileName: string): Promise<void> {
  await rm(resolveDocumentImagePath(storedFileName), { force: true });
}

export async function readStoredDocumentImage(storedFileName: string): Promise<Buffer> {
  return readFile(resolveDocumentImagePath(storedFileName));
}
