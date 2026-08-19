"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { BookingWithProperty } from "@/lib/bookings.ts";
import type { Property } from "@/lib/types.ts";

async function patchBooking(id: string, patch: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`/api/bookings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.error ?? "Something went wrong.";
}

export default function BookingsView({
  bookings,
  properties,
}: {
  bookings: BookingWithProperty[];
  properties: Property[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  async function act(id: string, patch: Record<string, unknown>) {
    const error = await patchBooking(id, patch);
    setRowError((prev) => ({ ...prev, [id]: error ?? "" }));
    if (!error) router.refresh();
  }

  return (
    <>
      <h1>Bookings</h1>

      {/* ponytail: availability shown as a per-property list of confirmed
          ranges rather than a month-grid calendar widget — same information,
          no calendar library. Upgrade if a host actually asks for a grid. */}
      <section>
        <h2>Availability</h2>
        {properties.map((property) => {
          const confirmed = bookings
            .filter((b) => b.property_id === property.id && b.status === "confirmed")
            .sort((a, b) => a.checkin.localeCompare(b.checkin));
          return (
            <p key={property.id}>
              <strong>{property.name}:</strong>{" "}
              {confirmed.length === 0
                ? "fully open"
                : confirmed.map((b) => `${b.checkin} → ${b.checkout}`).join(", ")}
            </p>
          );
        })}
      </section>

      <NewBookingForm properties={properties} onCreated={() => router.refresh()} />

      <table>
        <thead>
          <tr>
            <th>Property</th>
            <th>Status</th>
            <th>Dates</th>
            <th>Guest</th>
            <th>Source</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td data-label="Property">{b.property_name}</td>
              <td data-label="Status">
                <span className={`badge ${b.status}`}>{b.status}</span>
              </td>
              <td data-label="Dates">
                {editingId === b.id ? (
                  <EditDatesForm
                    booking={b}
                    onCancel={() => setEditingId(null)}
                    onSave={async (checkin, checkout) => {
                      await act(b.id, { checkin, checkout });
                      setEditingId(null);
                    }}
                  />
                ) : (
                  `${b.checkin} → ${b.checkout}`
                )}
              </td>
              <td data-label="Guest">
                {b.guest_name || "—"} <br />
                <small>{b.guest_phone}</small>
              </td>
              <td data-label="Source">{b.source}</td>
              <td>
                <div className="row-actions">
                  {b.status === "inquiry" && (
                    <>
                      <button onClick={() => act(b.id, { status: "confirmed" })}>Confirm</button>
                      <button className="secondary" onClick={() => act(b.id, { status: "declined" })}>
                        Decline
                      </button>
                    </>
                  )}
                  {b.status === "confirmed" && (
                    <>
                      <button className="secondary" onClick={() => setEditingId(b.id)}>
                        Edit dates
                      </button>
                      <button className="danger" onClick={() => act(b.id, { status: "cancelled" })}>
                        Cancel
                      </button>
                    </>
                  )}
                </div>
                {rowError[b.id] && <p className="error">{rowError[b.id]}</p>}
              </td>
            </tr>
          ))}
          {bookings.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">
                No bookings yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function EditDatesForm({
  booking,
  onSave,
  onCancel,
}: {
  booking: BookingWithProperty;
  onSave: (checkin: string, checkout: string) => void;
  onCancel: () => void;
}) {
  const [checkin, setCheckin] = useState(booking.checkin);
  const [checkout, setCheckout] = useState(booking.checkout);
  return (
    <span className="row-actions">
      <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
      <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
      <button onClick={() => onSave(checkin, checkout)}>Save</button>
      <button className="secondary" onClick={onCancel}>
        Cancel
      </button>
    </span>
  );
}

function NewBookingForm({ properties, onCreated }: { properties: Property[]; onCreated: () => void }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
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
