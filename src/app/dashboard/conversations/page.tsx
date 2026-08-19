import { getCurrentHost } from "@/lib/auth.ts";
import { getConversationsForHost } from "@/lib/conversations.ts";
import ConversationsView from "./ConversationsView.tsx";

// 6.3 conversation review, scoped to the logged-in host.
export default async function ConversationsPage() {
  const host = await getCurrentHost();
  if (!host) return null;

  const conversations = await getConversationsForHost(host.id);
  return <ConversationsView conversations={conversations} />;
}
