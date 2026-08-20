import { getCurrentHost } from "@/lib/auth.ts";
import { getBookingsForHost } from "@/lib/bookings.ts";
import { getPropertiesForHost } from "@/lib/properties.ts";
import PropertiesView from "./PropertiesView.tsx";

// Card grid of the host's own properties — click a card to see its bookings.
export default async function PropertiesPage() {
  const host = await getCurrentHost();
  if (!host) return null;

  const [properties, bookings] = await Promise.all([getPropertiesForHost(host.id), getBookingsForHost(host.id)]);
  return <PropertiesView properties={properties} bookings={bookings} />;
}
