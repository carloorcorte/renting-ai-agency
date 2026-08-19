import { getCurrentHost } from "@/lib/auth.ts";
import { getPropertiesForHost } from "@/lib/properties.ts";
import RulesView from "./RulesView.tsx";

// 6.4 auto-response rule configuration, scoped to the logged-in host.
export default async function RulesPage() {
  const host = await getCurrentHost();
  if (!host) return null;

  const properties = await getPropertiesForHost(host.id);
  return <RulesView properties={properties} />;
}
