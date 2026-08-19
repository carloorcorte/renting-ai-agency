import bcrypt from "bcryptjs";

// Split out of auth.ts on purpose: this file has zero Next.js dependency,
// so plain Node scripts (scripts/create-host.ts) can import it without
// pulling in next/headers, which only resolves inside the Next.js runtime.

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
