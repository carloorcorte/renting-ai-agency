import { getBookingsForHost } from "@/lib/bookings.ts";
import { getHostByCalendarToken } from "@/lib/hosts.ts";
import { buildIcs } from "@/lib/ics.ts";

// Public on purpose: Google/Apple Calendar fetch this with a plain GET, no
// cookies — host.calendar_token in the URL path IS the credential (see
// db/schema.sql). Not under /api/auth or behind getCurrentHost().
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const host = await getHostByCalendarToken(token);
  if (!host) return new Response("Not found", { status: 404 });

  const bookings = (await getBookingsForHost(host.id)).filter(
    (b) => b.status === "confirmed" || b.status === "inquiry",
  );
  const ics = buildIcs(host.name, bookings);

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="bookings.ics"',
    },
  });
}
