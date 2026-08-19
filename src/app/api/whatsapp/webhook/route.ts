import { NextResponse } from "next/server";
import twilio from "twilio";
import { handleInboundMessage } from "@/lib/assistant.ts";

// 3.1 inbound WhatsApp webhook. Twilio POSTs application/x-www-form-urlencoded.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  // Trust boundary: this endpoint is public and can trigger bookings and
  // messages, so a forged request must be rejected before anything else runs.
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL ?? request.url;
  const isValid = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN ?? "", signature, webhookUrl, params);
  if (!isValid) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const from = params.From;
  const to = params.To;
  if (!from || !to) {
    return NextResponse.json({ error: "missing From/To" }, { status: 400 });
  }

  await handleInboundMessage(from, to, params.Body ?? "", params.ProfileName);

  // Empty TwiML response: replies are sent explicitly via the Twilio REST
  // API (lib/twilio.ts), not via this response body.
  return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
