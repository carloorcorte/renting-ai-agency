import { query, queryOne } from "./db.ts";
import type { Conversation, Message, MessageDirection, MessageSender, PendingProposal } from "./types.ts";

// 3.2 resolve/create the conversation for a (host, guest) pair.
export async function findOrCreateConversation(hostId: string, guestPhone: string): Promise<Conversation> {
  const existing = await queryOne<Conversation>("SELECT * FROM conversations WHERE host_id = $1 AND guest_phone = $2", [
    hostId,
    guestPhone,
  ]);
  if (existing) return existing;
  const created = await queryOne<Conversation>(
    "INSERT INTO conversations (host_id, guest_phone) VALUES ($1, $2) RETURNING *",
    [hostId, guestPhone],
  );
  return created!;
}

export async function setConversationProperty(conversationId: string, propertyId: string): Promise<void> {
  await query("UPDATE conversations SET property_id = $2, updated_at = now() WHERE id = $1", [
    conversationId,
    propertyId,
  ]);
}

/** null clears it — used both when proposing a new summary (overwrites any
 * stale one) and once the guest has confirmed/declined it. */
export async function setPendingProposal(conversationId: string, proposal: PendingProposal | null): Promise<void> {
  await query("UPDATE conversations SET pending_proposal = $2, updated_at = now() WHERE id = $1", [
    conversationId,
    proposal ? JSON.stringify(proposal) : null,
  ]);
}

// 3.6 flag/unflag "needs host reply"
export async function setNeedsReply(conversationId: string, needsReply: boolean): Promise<void> {
  await query("UPDATE conversations SET needs_reply = $2, updated_at = now() WHERE id = $1", [
    conversationId,
    needsReply,
  ]);
}

// 3.7 persist every inbound/outbound message
export async function appendMessage(
  conversationId: string,
  direction: MessageDirection,
  sentBy: MessageSender,
  body: string,
): Promise<Message> {
  const row = await queryOne<Message>(
    "INSERT INTO messages (conversation_id, direction, sent_by, body) VALUES ($1, $2, $3, $4) RETURNING *",
    [conversationId, direction, sentBy, body],
  );
  await query("UPDATE conversations SET updated_at = now() WHERE id = $1", [conversationId]);
  return row!;
}

export async function getMessagesForConversation(conversationId: string): Promise<Message[]> {
  return query<Message>("SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at", [conversationId]);
}

export interface ConversationWithProperty extends Conversation {
  property_name: string | null;
}

export async function getConversationsForHost(hostId: string): Promise<ConversationWithProperty[]> {
  return query<ConversationWithProperty>(
    `SELECT c.*, p.name AS property_name
     FROM conversations c
     LEFT JOIN properties p ON p.id = c.property_id
     WHERE c.host_id = $1
     ORDER BY c.needs_reply DESC, c.updated_at DESC`,
    [hostId],
  );
}

/** Spec: Access Restricted to Own Properties. */
export async function conversationBelongsToHost(conversationId: string, hostId: string): Promise<boolean> {
  const row = await queryOne("SELECT 1 FROM conversations WHERE id = $1 AND host_id = $2", [conversationId, hostId]);
  return row !== null;
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
  return queryOne<Conversation>("SELECT * FROM conversations WHERE id = $1", [conversationId]);
}
