import { NextResponse } from "next/server";
import { getCurrentHost } from "@/lib/auth.ts";
import { appendMessage, conversationBelongsToHost, getConversation, setNeedsReply } from "@/lib/conversations.ts";
import { sendWhatsAppMessage } from "@/lib/twilio.ts";

// 6.3 host replies to a flagged (or any) conversation from the dashboard.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const host = await getCurrentHost();
  if (!host) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await conversationBelongsToHost(id, host.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { body } = (await request.json()) ?? {};
  if (typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const conversation = await getConversation(id);
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const message = await appendMessage(id, "outbound", "host", body);
  await sendWhatsAppMessage(conversation.guest_phone, body);
  await setNeedsReply(id, false);

  return NextResponse.json(message, { status: 201 });
}
