import { query, queryOne } from "./db.ts";
import type { Property } from "./types.ts";

export async function getPropertiesForHost(hostId: string): Promise<Property[]> {
  return query<Property>("SELECT * FROM properties WHERE host_id = $1 ORDER BY name", [hostId]);
}

export async function getProperty(propertyId: string): Promise<Property | null> {
  return queryOne<Property>("SELECT * FROM properties WHERE id = $1", [propertyId]);
}

/** Spec: Access Restricted to Own Properties. */
export async function propertyBelongsToHost(propertyId: string, hostId: string): Promise<boolean> {
  const row = await queryOne("SELECT 1 FROM properties WHERE id = $1 AND host_id = $2", [propertyId, hostId]);
  return row !== null;
}

// Self-service equivalent of the raw SQL INSERT the README used to require
// (7.1) — only the fields a host would actually fill in from the dashboard;
// the rest keep the schema's defaults (min_nights, checkin_time, ...).
export async function createProperty(input: {
  hostId: string;
  name: string;
  pricePerNight: number;
  currency?: string;
  minNights?: number;
  houseRules?: string;
  amenities?: string;
  checkinTime?: string;
  checkinInstructions?: string;
}): Promise<Property> {
  return (await query<Property>(
    `INSERT INTO properties (host_id, name, price_per_night, currency, min_nights, house_rules, amenities, checkin_time, checkin_instructions)
     VALUES ($1, $2, $3, COALESCE($4, 'EUR'), COALESCE($5, 1), COALESCE($6, ''), COALESCE($7, ''), COALESCE($8, '15:00'), COALESCE($9, ''))
     RETURNING *`,
    [
      input.hostId,
      input.name,
      input.pricePerNight,
      input.currency,
      input.minNights,
      input.houseRules,
      input.amenities,
      input.checkinTime,
      input.checkinInstructions,
    ],
  ))[0];
}
