"use client";

import { useMemo, useState } from "react";
import { monthGrid, todayISO } from "@/lib/dates.ts";
import type { BookingWithProperty } from "@/lib/bookings.ts";
import type { Property } from "@/lib/types.ts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Reuses the Ibiza whitewash palette already defined in globals.css — no new
// colors, just a small fixed rotation so each property gets a stable color.
const PALETTE = ["accent", "coral", "sun", "danger"] as const;

function colorFor(propertyId: string): (typeof PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < propertyId.length; i++) hash = (hash * 31 + propertyId.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** Month-grid calendar of confirmed/inquiry bookings. Pure presentation over
 * monthGrid (dates.ts) — no calendar library, this is a 42-cell CSS grid. */
export default function Calendar({
  bookings,
  properties,
}: {
  bookings: BookingWithProperty[];
  properties: Property[];
}) {
  const today = todayISO();
  const [cursor, setCursor] = useState(() => today.slice(0, 7)); // "YYYY-MM"
  const [year, month] = cursor.split("-").map(Number);

  const days = useMemo(() => monthGrid(year, month), [year, month]);
  const byDay = useMemo(() => {
    const map = new Map<string, BookingWithProperty[]>();
    for (const day of days) {
      const covering = bookings.filter(
        (b) => (b.status === "confirmed" || b.status === "inquiry") && b.checkin <= day && day < b.checkout,
      );
      if (covering.length > 0) map.set(day, covering);
    }
    return map;
  }, [days, bookings]);

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setCursor(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button type="button" className="secondary" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          ‹
        </button>
        <strong>{monthLabel}</strong>
        <button type="button" className="secondary" onClick={() => shiftMonth(1)} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
        {days.map((day) => {
          const covering = byDay.get(day) ?? [];
          const inMonth = day.slice(0, 7) === cursor;
          return (
            <div key={day} className={`calendar-day${inMonth ? "" : " outside"}${day === today ? " today" : ""}`}>
              <span className="calendar-day-number">{Number(day.slice(8, 10))}</span>
              {covering.map((b) => (
                <div
                  key={b.id}
                  className={`calendar-event color-${colorFor(b.property_id)}${b.status === "inquiry" ? " inquiry" : ""}`}
                  title={`${b.property_name} — ${b.guest_name || "guest"} (${b.status})\n${b.checkin} → ${b.checkout}`}
                >
                  {b.checkin === day ? b.guest_name || b.property_name : " "}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {properties.length > 1 && (
        <div className="calendar-legend">
          {properties.map((p) => (
            <span key={p.id} className="calendar-legend-item">
              <span className={`calendar-legend-dot color-${colorFor(p.id)}`} />
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
