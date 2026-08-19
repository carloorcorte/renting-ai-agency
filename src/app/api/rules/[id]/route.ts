import { NextResponse } from "next/server";
import { getCurrentHost } from "@/lib/auth.ts";
import { ruleBelongsToHost, updateRule } from "@/lib/rules.ts";

// 6.4 edit or disable a rule.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const host = await getCurrentHost();
  if (!host) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await ruleBelongsToHost(id, host.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { conditions, action, replyTemplate, enabled } = (await request.json()) ?? {};
  const rule = await updateRule(id, { conditions, action, replyTemplate, enabled });
  return NextResponse.json(rule);
}
