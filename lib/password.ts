import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  const [scheme, salt, expectedKeyHex] = passwordHash.split("$");

  if (scheme !== "scrypt" || !salt || !expectedKeyHex) {
    return false;
  }

  const expectedKey = Buffer.from(expectedKeyHex, "hex");
  const actualKey = (await scryptAsync(
    password,
    salt,
    expectedKey.length,
  )) as Buffer;

  if (actualKey.length !== expectedKey.length) {
    return false;
  }

  return timingSafeEqual(actualKey, expectedKey);
}
