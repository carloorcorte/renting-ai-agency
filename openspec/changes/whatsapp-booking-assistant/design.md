## Context

Greenfield project — no existing service, stack, or specs to build on. See proposal.md for motivation and MVP scope: WhatsApp only, web dashboard only, a handful of manually-onboarded hosts. This design picks the concrete stack and integration approach needed to build the four MVP capabilities (`whatsapp-assistant`, `booking-management`, `checkin-scheduling`, `host-dashboard`).

## Architecture Overview

One deployable app, one database, two external services. No queue, no microservices, no separate mobile backend.

```
                        ┌───────────────────────────────────┐
  Guest ───WhatsApp───▶ │                                     │
                        │        Next.js app (single         │
  Twilio ◀──reply────── │        deployable service)         │
                        │                                     │
                        │  /api/whatsapp webhook:            │
                        │   1. resolve host + property         │──▶ Postgres
                        │      (or "no property named" →       │     (hosts, properties,
                        │       multi-property search)          │      bookings, rules,
                        │   2. rule engine (deterministic)      │      conversations,
                        │   3. if no rule: availability search  │      messages,
                        │      or LLM FAQ fallback              │──▶ LLM API   scheduled_messages)
                        │   4. persist message, send reply      │
                        │                                     │
  Host ───browser─────▶ │  dashboard pages + API routes        │──▶ Postgres
  (session login)       │  (bookings, calendar, conversations, │    (host-scoped queries)
                        │   rules, manual booking actions)      │
                        │                                     │
  cron trigger ───────▶ │  scheduled job: scan                 │──▶ Postgres (scheduled_messages)
                        │  scheduled_messages due, send          │──▶ Twilio ──▶ Guest/Host
                        │                                     │
                        └───────────────────────────────────┘
```

Three request paths through the same app, no path needs its own service:
- **Guest → WhatsApp path**: Twilio calls the webhook, everything (rules, search, LLM fallback) runs synchronously in that request, reply goes back through Twilio.
- **Host → dashboard path**: normal authenticated web requests, scoped to the logged-in host's own properties, reusing the same booking/availability logic as the WhatsApp path (a manual dashboard cancellation and a rule-triggered cancellation hit the same code).
- **Time → follow-up path**: a periodic job (not a long-running worker) scans one table and sends due messages via Twilio.

## Goals / Non-Goals

**Goals:**
- Ship the MVP with the fewest moving parts: one deployable service, one database, no message queue or microservices.
- Keep the data model host/property-scoped from day one so adding hosts later is just adding rows, not a rewrite.
- Make booking confirmation and availability blocking safe under concurrent requests (no double-booking).

**Non-Goals:**
- Voice/phone call automation, native mobile app, self-serve agency signup/billing — all explicitly deferred (see proposal.md).
- Multi-language support beyond what the LLM does by default.
- A rules DSL/visual builder beyond a small fixed set of condition types (dates available, price match, min-nights).

## Decisions

**One WhatsApp number per host, not per property — and it's a new number, not the host's personal one.** Registering a phone number on the WhatsApp Business Platform requires deleting that number's existing consumer WhatsApp account first, permanently: message history is lost and the number can't be used in the regular WhatsApp/Business app again while it's registered on the API. Migrating a host's personal number is a one-way, disruptive move for no MVP benefit, so each host gets a new number provisioned through Twilio instead, and republicizes it as their booking contact going forward (their old number keeps working for everything else). One number still covers all of a host's properties — the assistant resolves which property a conversation is about from context (guest mentions it, or the assistant asks). Every outbound send (`lib/twilio.ts`) therefore takes the sending host's `whatsapp_number` explicitly rather than a single hardcoded number — the pilot's one host made that mistake easy to miss at first, since the global default and the only host's number happened to be the same value. *Alternatives considered:* migrating the host's existing number — rejected, destructive and irreversible; a number per property — rejected, adds provider cost/complexity with a handful of properties per host.

**WhatsApp via Twilio's WhatsApp Business API, not Meta Cloud API directly.** Business verification with Meta is required either way (3-10 business days, same timeline through a BSP or direct) — Twilio doesn't skip it, it gives a sandbox number to build against while it's pending, plus a mature SDK. At pilot volume Twilio's $0.005/message markup on top of Meta's own per-message fee is negligible, and since we build our own webhook and dashboard rather than using Twilio's console, its main product advantage doesn't even apply to us — this is a cheap decision to revisit, not a locked-in one. *Alternatives considered:* Meta Cloud API directly (zero markup, but we'd own the raw integration) or 360dialog (flat €49/mo + zero markup, wins at high volume) — revisit either once volume makes Twilio's per-message markup material; nothing outside `src/lib/twilio.ts` and the webhook's signature check is provider-specific, so switching later is a small, contained change.

**Messages outside the 24-hour session window need a WhatsApp-approved template — or a different channel entirely, for host notifications.** WhatsApp only allows free-form text within 24 hours of the other side's last message. Scheduled guest follow-ups (pre-arrival reminder, check-in instructions) are usually sent well outside that window, so they must use a Meta-approved template message, not plain text — Twilio's Content API sends these via a `contentSid`, configured per message type once the template is approved (falls back to free-form text if no template is configured yet, which only actually delivers within the 24h window — fine for early dev, not for production). Host notifications (escalation, upcoming check-in) turned out to have a deeper problem: `hosts.whatsapp_number` is the *business* number guests text — it has no consumer WhatsApp app attached, so "sending it a WhatsApp message" has no phone to arrive on. Host notifications go out as plain SMS instead, to a separate `hosts.notification_phone`, which sidesteps the whole template/24h-window question for that path (regular SMS has neither). *Alternative considered:* templated WhatsApp messages to the host too — rejected, it's the same approval overhead as the guest path for a notification the host can already see on the dashboard's "needs reply" flag; SMS is simpler and more likely to actually get noticed.

**Rules run before the LLM, and only rules can trigger an action.** Inbound message → check host-defined rules first (deterministic conditions: dates available, price matches, min-nights met). If a rule matches, its action runs (e.g. auto-confirm) and its canned reply is sent — no LLM involved in that path. If no rule matches, an LLM answers FAQs using that property's configured info (address, price, house rules, amenities, check-in time) injected directly into the prompt. The LLM never creates or confirms a booking — only rules do. This keeps booking actions predictable and auditable, and keeps the LLM's job narrow (answer from given text, or say "I don't know, escalating"). *Alternative considered:* letting the LLM decide when to auto-confirm — rejected, non-deterministic behavior on money-adjacent actions is the kind of thing that pages a host at 3am.

**Availability search and alternative-date suggestions are deterministic DB queries, not LLM guesses.** Same principle as rule actions: whether a property is free for a range, and which nearby ranges are free, is answered by querying `bookings`/`properties` directly (checked against every property of the host, not just one). The LLM's only role is turning that structured result into a natural-language WhatsApp reply — it never estimates or invents availability. Alternative-date search looks within a fixed lookahead window (default 8 weeks) for a same-length range with a free property. *Alternative considered:* asking the LLM to reason about availability from a text dump — rejected, an incorrect guess here directly costs a booking or double-books a house, the same reason bookings aren't LLM-decided.

**No RAG/vector store for FAQ answering.** A host has a handful of properties, each with a short text blob of facts. That text fits directly in the prompt — no embeddings, no vector DB. *Alternative considered:* RAG pipeline — unneeded until a property's info is large enough to not fit in a prompt, which isn't the case here.

**Single service, single Postgres database.** One backend handles the WhatsApp webhook, the dashboard API, and a scheduled job (e.g. a cron-triggered function, not an in-memory timer) that sends check-in follow-ups by scanning a `scheduled_messages` table. No message queue for MVP volume. *Alternative considered:* separate webhook worker + queue — unneeded until message volume or latency requirements outgrow a single process.

**Stack: TypeScript throughout (Node backend + Next.js dashboard), Postgres.** One language for backend and dashboard reduces context-switching for a small/solo team; Next.js gives API routes and the dashboard UI in one deployable app instead of two. *Alternative considered:* Python/FastAPI backend — equally fine, TS chosen mainly to keep one language and one deploy target.

**Double-booking prevention via a DB constraint, not application logic alone.** An exclusion constraint (or a unique index on property + overlapping date range) on confirmed bookings makes concurrent confirmations fail safely at the database level, in addition to the application-level check in `booking-management`.

## Risks / Trade-offs

- [WhatsApp Business verification delay through Twilio] → Start verification immediately; develop against the Twilio sandbox number in the meantime.
- [Message template approval takes additional time beyond business verification] → Submit the pre-arrival-reminder and check-in-instructions templates as soon as the number is verified; free-form text still works for anything sent within 24h of the guest's last message, which covers dev/testing.
- [A host never sets `notification_phone`] → Host-directed SMS is skipped (logged, not thrown); the dashboard's "needs reply" flag is still the authoritative record, so nothing is silently lost, just not also pinged externally.
- [LLM answers a question incorrectly or invents a fact] → Prompt is restricted to only the property's configured data with an explicit "if it's not in this data, say you don't know and escalate" instruction; the LLM cannot trigger bookings, only rules can.
- [Follow-up reminders silently missed if the process restarts at the wrong time] → Persist scheduled follow-ups as rows in `scheduled_messages` with a `sent_at` column, checked by a periodic job — not in-memory timers, so a restart just resumes the next scan.
- [Rule conditions turn out too limited for real hosts] → Fixed small set of condition types for MVP (dates, price, min-nights); expand only when a host asks for one we don't support.
- [One-number-per-host means the assistant may not know which property a guest means] → Assistant asks a clarifying question when a host has more than one property and the message doesn't name one.

## Migration Plan

Greenfield — no existing system to migrate from. Rollout is:
1. Provision Twilio WhatsApp sandbox, Postgres, deploy the backend+dashboard.
2. Manually onboard 1-2 pilot hosts and their properties (data entry by us, not self-serve).
3. Provision each pilot host a new dedicated Twilio WhatsApp number (never their personal one — see Decisions), submit the follow-up message templates for approval, point the number at the webhook, and have the host start giving out the new number; monitor conversations closely before onboarding more hosts.
4. No rollback complexity beyond disabling the webhook (reverts to hosts answering WhatsApp manually, same as before).

## Open Questions

- Exact FAQ categories to pre-configure per property at launch (price, house rules, amenities, check-in time are the obvious starting set) — can be refined per pilot host without changing specs or approach.
- Which LLM provider/model to call for FAQ answering — a small, cheap model is enough for grounded short answers; final pick doesn't change the spec or architecture.
