import { NextResponse } from "next/server";
import { sendDueScheduledMessages } from "@/lib/checkin.ts";

// 5.2 the "periodic job" itself. Vercel Cron (see vercel.json) calls this via
// GET once a day and automatically sends `Authorization: Bearer
// $CRON_SECRET` whenever the project has a CRON_SECRET env var set — that's
// Vercel's own documented convention, not a custom scheme, so it needs no
// extra wiring beyond setting CRON_SECRET in the project's env vars.
// Deploying elsewhere instead (GitHub Actions cron, a plain crontab) just
// needs a GET request with that same header.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendDueScheduledMessages();
  return NextResponse.json(result);
}
