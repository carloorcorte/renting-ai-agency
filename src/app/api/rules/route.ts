import { NextResponse } from "next/server";
import { getCurrentHost } from "@/lib/auth.ts";
import { propertyBelongsToHost } from "@/lib/properties.ts";
import { createRule, getRulesForProperty } from "@/lib/rules.ts";

// 6.4 rule management, scoped to properties the host owns (6.5).
export async function GET(request: Request) {
  const host = await getCurrentHost();
  if (!host) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const propertyId = new URL(request.url).searchParams.get("propertyId");
  if (!propertyId) return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
  if (!(await propertyBelongsToHost(propertyId, host.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(await getRulesForProperty(propertyId));
}

export async function POST(request: Request) {
  const host = await getCurrentHost();
  if (!host) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { propertyId, conditions, action, replyTemplate } = (await request.json()) ?? {};
  if (!propertyId || !action || !replyTemplate) {
    return NextResponse.json({ error: "propertyId, action and replyTemplate are required" }, { status: 400 });
  }
  if (!(await propertyBelongsToHost(propertyId, host.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const rule = await createRule({ propertyId, conditions: conditions ?? {}, action, replyTemplate });
  return NextResponse.json(rule, { status: 201 });
}
