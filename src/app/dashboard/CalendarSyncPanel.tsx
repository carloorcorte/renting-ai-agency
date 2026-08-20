"use client";

import { useState } from "react";

/** Subscribe URL for the read-only iCalendar feed (api/calendar/[token]) —
 * Google Calendar and Apple Calendar both support adding a calendar "by
 * URL", so this is the whole "connect bookings to Google/Apple" feature:
 * no OAuth, no app registration. `url` is computed server-side (the caller
 * has the request's real host/protocol) so there's nothing to hydrate. */
export default function CalendarSyncPanel({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section>
      <h2>Sync with Google / Apple Calendar</h2>
      <p className="muted">
        Add this address as a subscribed calendar — Google Calendar: Settings → Add calendar → From URL. Apple
        Calendar: File → New Calendar Subscription.
      </p>
      <div className="row-actions">
        <input value={url} readOnly onFocus={(e) => e.target.select()} />
        <button type="button" className="secondary" onClick={copy}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </section>
  );
}
