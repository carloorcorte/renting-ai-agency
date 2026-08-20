"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { BookingWithProperty } from "@/lib/bookings.ts";
import { todayISO } from "@/lib/dates.ts";
import type { Property } from "@/lib/types.ts";

export default function PropertiesView({
  properties,
  bookings,
}: {
  properties: Property[];
  bookings: BookingWithProperty[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(properties.length === 0);
  const today = todayISO();

  return (
    <>
      <h1>Properties</h1>

      <div className="card-grid">
        {properties.map((property) => {
          const upcoming = bookings
            .filter((b) => b.property_id === property.id && b.status === "confirmed" && b.checkout >= today)
            .sort((a, b) => a.checkin.localeCompare(b.checkin));
          return (
            <Link key={property.id} href={`/dashboard/properties/${property.id}`} className="property-card">
              <h3>{property.name}</h3>
              <p className="property-card-price">
                {property.price_per_night} {property.currency}
                <span className="muted"> / night</span>
              </p>
              <p className="muted">Min {property.min_nights} nights</p>
              <p className="property-card-stat">
                {upcoming.length === 0
                  ? "No upcoming bookings"
                  : `${upcoming.length} upcoming — next ${upcoming[0].checkin}`}
              </p>
            </Link>
          );
        })}

        <button type="button" className="property-card property-card-add" onClick={() => setShowForm(true)}>
          + Add property
        </button>
      </div>

      {showForm && (
        <NewPropertyForm
          onDone={() => {
            setShowForm(false);
            router.refresh();
          }}
          onCancel={() => setShowForm(false)}
          allowCancel={properties.length > 0}
        />
      )}
    </>
  );
}

function NewPropertyForm({
  onDone,
  onCancel,
  allowCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
  allowCancel: boolean;
}) {
  const [name, setName] = useState("");
  const [pricePerNight, setPricePerNight] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [minNights, setMinNights] = useState("1");
  const [checkinTime, setCheckinTime] = useState("15:00");
  const [houseRules, setHouseRules] = useState("");
  const [amenities, setAmenities] = useState("");
  const [checkinInstructions, setCheckinInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        pricePerNight,
        currency,
        minNights,
        checkinTime,
        houseRules,
        amenities,
        checkinInstructions,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not create the property.");
      return;
    }
    onDone();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>New property</h2>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </label>
      <label>
        Price per night
        <input
          type="number"
          min={0}
          step="0.01"
          value={pricePerNight}
          onChange={(e) => setPricePerNight(e.target.value)}
          required
        />
      </label>
      <label>
        Currency
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
      </label>
      <label>
        Minimum nights
        <input type="number" min={1} value={minNights} onChange={(e) => setMinNights(e.target.value)} />
      </label>
      <label>
        Check-in time
        <input type="time" value={checkinTime} onChange={(e) => setCheckinTime(e.target.value)} />
      </label>
      <label>
        House rules
        <textarea value={houseRules} onChange={(e) => setHouseRules(e.target.value)} rows={2} />
      </label>
      <label>
        Amenities
        <textarea value={amenities} onChange={(e) => setAmenities(e.target.value)} rows={2} />
      </label>
      <label>
        Check-in instructions
        <textarea value={checkinInstructions} onChange={(e) => setCheckinInstructions(e.target.value)} rows={2} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create property"}
        </button>
        {allowCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
