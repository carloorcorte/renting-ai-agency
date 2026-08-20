"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BookingWithProperty } from "@/lib/bookings.ts";

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

/** The bookings table + row actions, shared by the all-bookings dashboard
 * page and a single property's detail page (each just passes a different,
 * pre-filtered `bookings` list). */
export default function BookingsTable({
  bookings,
  showProperty = true,
}: {
  bookings: BookingWithProperty[];
  showProperty?: boolean;
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
    <table>
      <thead>
        <tr>
          {showProperty && <th>Property</th>}
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
            {showProperty && <td data-label="Property">{b.property_name}</td>}
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
            <td colSpan={showProperty ? 6 : 5} className="empty">
              No bookings yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
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
