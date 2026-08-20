// Password reset for an existing host (no forgot-password flow in the app).
// Usage: npm run reset-host-password -- <email> <newPassword>
// (reads DATABASE_URL from .env — see package.json's --env-file flag)
import { hashPassword } from "../src/lib/password.ts";
import { query } from "../src/lib/db.ts";

async function main() {
  const [email, newPassword] = process.argv.slice(2);
  if (!email || !newPassword) {
    console.error("Usage: reset-host-password.ts <email> <newPassword>");
    process.exit(1);
  }

  const passwordHash = await hashPassword(newPassword);
  const [host] = await query<{ id: string }>(
    "UPDATE hosts SET password_hash = $1 WHERE email = $2 RETURNING id",
    [passwordHash, email],
  );
  if (!host) {
    console.error(`No host found with email ${email}`);
    process.exit(1);
  }
  console.log(`Password reset for host ${host.id} (${email}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
