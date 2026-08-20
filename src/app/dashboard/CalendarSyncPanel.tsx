"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Two independent ways to see bookings in an outside calendar:
 * - Google: real push sync via OAuth (calendar.app.created) — a dedicated
 *   calendar in their account, kept live by googleCalendarSync.ts.
 * - Apple: no OAuth calendar API exists for third-party apps, so this stays
 *   a one-click `webcal://` subscribe link to the read-only ICS feed
 *   (api/calendar/[token]) — not push, but no copy-pasting either.
 * `icsUrl` is computed server-side (the caller has the request's real
 * host/protocol), same as before. */
export default function CalendarSyncPanel({
  icsUrl,
  googleConnected,
}: {
  icsUrl: string;
  googleConnected: boolean;
}) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);
  const webcalUrl = icsUrl.replace(/^https?:\/\//, "webcal://");

  async function disconnect() {
    setDisconnecting(true);
    await fetch("/api/auth/google/calendar/disconnect", { method: "POST" });
    setDisconnecting(false);
    router.refresh();
  }

  return (
    <section>
      <h2>Sync with Google / Apple Calendar</h2>

      <div className="sync-row">
        <div>
          <strong>Google Calendar</strong>
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

      <div className="sync-row">
        <div>
          <strong>Apple Calendar</strong>
          <p className="muted">
            No OAuth for Apple Calendar exists for third-party apps — this subscribes instead (updates whenever
            Apple refreshes it, not instantly).
          </p>
        </div>
        <a className="secondary-button" href={webcalUrl}>
          Add to Apple Calendar
        </a>
      </div>

      <details className="sync-fallback">
        <summary>Other apps (manual URL)</summary>
        <input value={icsUrl} readOnly onFocus={(e) => e.target.select()} />
      </details>
    </section>
  );
}
