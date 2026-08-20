"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ConversationWithProperty } from "@/lib/conversations.ts";
import type { Message } from "@/lib/types.ts";

export default function ConversationsView({ conversations }: { conversations: ConversationWithProperty[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function select(id: string) {
    setSelectedId(id);
    setLoading(true);
    const res = await fetch(`/api/conversations/${id}`);
    setMessages(res.ok ? await res.json() : []);
    setLoading(false);
  }

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <>
      <h1>Conversations</h1>
      <div className="conversation-layout">
        <ul className="conv-list">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                className={`secondary conv-item${c.id === selectedId ? " active" : ""}`}
                onClick={() => select(c.id)}
              >
                {c.needs_reply && <span className="needs-reply">● </span>}
                {c.property_name ?? "(property not yet identified)"} — {c.guest_phone}
              </button>
            </li>
          ))}
          {conversations.length === 0 && <p className="empty">No conversations yet.</p>}
        </ul>

        <div className="conversation-detail">
          {!selected && <p className="empty">Select a conversation to see the full message history.</p>}
          {selected && (
            <>
              <h2>
                {selected.property_name ?? "(property not yet identified)"} — {selected.guest_phone}
              </h2>
              {loading ? (
                <p>Loading…</p>
              ) : (
                <div className="messages">
                  {messages.map((m) => (
                    <div key={m.id} className={`message ${m.sent_by}`}>
                      {m.body}
                      <span className="meta">
                        {m.sent_by} · {new Date(m.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <ReplyForm
                conversationId={selected.id}
                onSent={() => {
                  select(selected.id);
                  router.refresh();
                }}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ReplyForm({ conversationId, onSent }: { conversationId: string; onSent: () => void }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/conversations/${conversationId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSending(false);
    if (!res.ok) {
      setError("Could not send the reply.");
      return;
    }
    setBody("");
    onSent();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <label>
        Reply
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={sending}>
        {sending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
