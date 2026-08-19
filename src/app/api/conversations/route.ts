import { NextResponse } from "next/server";
import { getCurrentHost } from "@/lib/auth.ts";
import { getConversationsForHost } from "@/lib/conversations.ts";

// 6.3 conversation list, scoped to the logged-in host (6.5).
export async function GET() {
  const host = await getCurrentHost();
  if (!host) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json(await getConversationsForHost(host.id));
}
