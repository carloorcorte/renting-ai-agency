import { queryOne } from "./db.ts";
import type { Host } from "./types.ts";

const HOST_COLUMNS = "id, email, name, whatsapp_number, notification_phone";

export async function getHostByWhatsAppNumber(whatsappNumber: string): Promise<Host | null> {
  return queryOne<Host>(`SELECT ${HOST_COLUMNS} FROM hosts WHERE whatsapp_number = $1`, [whatsappNumber]);
}

export async function getHostById(id: string): Promise<Host | null> {
  return queryOne<Host>(`SELECT ${HOST_COLUMNS} FROM hosts WHERE id = $1`, [id]);
}

export async function getHostByEmail(email: string): Promise<(Host & { password_hash: string }) | null> {
  return queryOne(`SELECT ${HOST_COLUMNS}, password_hash FROM hosts WHERE email = $1`, [email]);
}
