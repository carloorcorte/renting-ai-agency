import { NextResponse } from "next/server";
import { getCurrentHost } from "@/lib/auth.ts";
import { createProperty } from "@/lib/properties.ts";

export async function POST(request: Request) {
  const host = await getCurrentHost();
  if (!host) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) ?? {};
  const { name, pricePerNight, currency, minNights, houseRules, amenities, checkinTime, checkinInstructions } = body;
  const price = Number(pricePerNight);
  if (typeof name !== "string" || !name.trim() || !Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "name and a positive pricePerNight are required" }, { status: 400 });
  }

  const property = await createProperty({
    hostId: host.id,
    name,
    pricePerNight: price,
    currency,
    minNights: minNights !== undefined && minNights !== "" ? Number(minNights) : undefined,
    houseRules,
    amenities,
    checkinTime,
    checkinInstructions,
  });
  return NextResponse.json(property, { status: 201 });
}
