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
