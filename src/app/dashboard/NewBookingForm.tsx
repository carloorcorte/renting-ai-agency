"use client";

import { useState, type FormEvent } from "react";
import type { Property } from "@/lib/types.ts";

/** `lockedPropertyId` — set from a property's own detail page, where the
 * property is already fixed and doesn't need a picker. */
export default function NewBookingForm({
  properties,
  lockedPropertyId,
  onCreated,
}: {
  properties: Property[];
  lockedPropertyId?: string;
  onCreated: () => void;
}) {
  const [propertyId, setPropertyId] = useState(lockedPropertyId ?? properties[0]?.id ?? "");
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, checkin, checkout, guestName, guestPhone, status: "confirmed" }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not create the booking.");
      return;
    }
    setCheckin("");
    setCheckout("");
    setGuestName("");
    setGuestPhone("");
    onCreated();
  }

  if (properties.length === 0) return null;

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>New manual booking</h2>
      {!lockedPropertyId && (
        <label>
          Property
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Check-in
        <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} required />
      </label>
      <label>
        Check-out
        <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} required />
      </label>
      <label>
        Guest name
        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} />
      </label>
      <label>
        Guest phone
        <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} required placeholder="+34600111222" />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create booking"}
      </button>
    </form>
  );
}
