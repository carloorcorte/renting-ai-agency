import { NextResponse } from "next/server";
import { getCurrentHost } from "@/lib/auth.ts";
import { conversationBelongsToHost, getMessagesForConversation } from "@/lib/conversations.ts";

// 6.3 conversation detail: full message history (spec: Conversation Logging).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const host = await getCurrentHost();
  if (!host) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await conversationBelongsToHost(id, host.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(await getMessagesForConversation(id));
}
