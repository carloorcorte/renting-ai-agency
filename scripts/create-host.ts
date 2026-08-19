// Manual host onboarding (tasks.md 7.1) — the only step that needs code
// rather than a plain SQL INSERT is hashing the password.
// Usage: npm run create-host -- <email> <password> <name> <whatsappNumber> [notificationPhone]
// (reads DATABASE_URL from .env — see package.json's --env-file flag)
//   whatsappNumber:     the new dedicated Twilio number guests text (never the host's personal number — see design.md)
//   notificationPhone:  the host's own phone, for SMS alerts (needs-reply, upcoming check-in). Optional — omit to skip SMS alerts.
import { hashPassword } from "../src/lib/password.ts";
import { query } from "../src/lib/db.ts";

async function main() {
  const [email, password, name, whatsappNumber, notificationPhone] = process.argv.slice(2);
  if (!email || !password || !name || !whatsappNumber) {
    console.error(
      "Usage: create-host.ts <email> <password> <name> <whatsappNumber e.g. +34600111222> [notificationPhone]",
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const [host] = await query<{ id: string }>(
    "INSERT INTO hosts (email, password_hash, name, whatsapp_number, notification_phone) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [email, passwordHash, name, whatsappNumber, notificationPhone ?? null],
  );
  console.log(`Created host ${host.id} (${email}). Add their properties directly with SQL — see README.md.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
