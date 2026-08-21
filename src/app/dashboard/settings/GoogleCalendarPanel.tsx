"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Real push sync via OAuth (scope calendar.app.created) — a dedicated
 * calendar in the host's Google account, kept live by googleCalendarSync.ts.
 * Apple has no equivalent (no third-party OAuth calendar API), so there's
 * nothing to show for it here — see git history if that's ever revisited. */
export default function GoogleCalendarPanel({ googleConnected }: { googleConnected: boolean }) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    await fetch("/api/auth/google/calendar/disconnect", { method: "POST" });
    setDisconnecting(false);
    router.refresh();
  }

  return (
    <section>
      <h2>Google Calendar</h2>
      <div className="sync-row">
        <div>
          <p className="muted">
            {googleConnected
              ? "Connected — bookings are created, updated and removed automatically in a dedicated calendar."
              : "One click: creates a dedicated calendar in your Google account and keeps it in sync."}
          </p>
        </div>
        {googleConnected ? (
          <button type="button" className="secondary" onClick={disconnect} disabled={disconnecting}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        ) : (
          <a className="oauth-button" href="/api/auth/google/calendar">
            Connect Google Calendar
          </a>
        )}
      </div>
    </section>
  );
}
