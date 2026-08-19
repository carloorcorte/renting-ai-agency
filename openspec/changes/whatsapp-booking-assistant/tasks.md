## 1. Project Setup

- [x] 1.1 Scaffold Next.js + TypeScript app (dashboard UI + API routes) with Postgres connection
- [ ] 1.2 Create Twilio account, request WhatsApp Business sandbox number, store credentials in env config; submit the pre-arrival-reminder and check-in-instructions message templates for Meta approval
- [ ] 1.3 Set up hosting/deploy target (e.g. single instance/PaaS) and a Postgres instance

## 2. Data Model

- [x] 2.1 Create `hosts` and `properties` tables (property belongs to host; property holds price, house rules, amenities, check-in time/instructions as configured text fields)
- [x] 2.2 Create `bookings` table with status enum (inquiry, confirmed, declined, cancelled), date range, guest contact
- [x] 2.3 Add exclusion/unique constraint preventing overlapping confirmed bookings per property
- [x] 2.4 Create `conversations` and `messages` tables (message: direction, text, automatic vs host-sent, conversation flagged/needs-reply state)
- [x] 2.5 Create `rules` table per property (condition type: dates-available/price-match/min-nights, action, canned reply)
- [x] 2.6 Create `checkin_appointments` and `scheduled_messages` tables (scheduled_messages: type, send_at, sent_at, booking reference)
- [x] 2.7 Add `hosts.notification_phone` — a separate number for host-directed SMS, since `hosts.whatsapp_number` has no consumer app attached to receive a WhatsApp message

## 3. WhatsApp Assistant (whatsapp-assistant)

- [x] 3.1 Implement Twilio webhook endpoint receiving inbound WhatsApp messages
- [x] 3.2 Resolve inbound message to host account (by WhatsApp number); if the message names a specific property, scope to it — otherwise treat it as a multi-property availability inquiry across all the host's properties
- [x] 3.3 Implement rule evaluation: check property's rules against message/booking-dates context before anything else (once a specific property is established)
- [x] 3.4 Implement rule actions: auto-reply and auto-create/confirm booking when a rule matches
- [x] 3.5 Implement LLM FAQ fallback: prompt grounded only in the property's configured data, answer or say "I don't know"
- [x] 3.6 On "I don't know" or any unmatched message, flag conversation as needs-host-reply and notify host via SMS to `hosts.notification_phone` (not WhatsApp — see 2.7)
- [x] 3.7 Persist every inbound/outbound message to `messages` with automatic-vs-host-sent flag
- [x] 3.8 Send outbound WhatsApp replies via Twilio (rule replies, LLM replies, host-composed replies)
- [x] 3.9 Implement multi-property availability flow: run the search (4.6), format and send a reply listing matching properties with dates/price, or the alternative date ranges when there's no exact match

## 4. Booking Management (booking-management)

- [x] 4.1 Implement booking creation (from inquiry) and status transitions (confirm/decline/cancel)
- [x] 4.2 Implement availability check reading confirmed bookings for a property/date-range
- [x] 4.3 Enforce double-booking prevention at confirmation time (app-level check + DB constraint from 2.3), return conflict error with overlapping dates
- [x] 4.4 Implement cancellation flow that releases the date range back to availability
- [x] 4.5 Implement manual booking creation and date-editing by a host, reusing the double-booking check from 4.3
- [x] 4.6 Implement availability search across a host's properties for a date range (with price), and alternative nearby date range search (same length, ordered by proximity, within an 8-week lookahead) when there's no exact match

## 5. Check-In Scheduling (checkin-scheduling)

- [x] 5.1 On booking confirmation, create a `checkin_appointments` row and the corresponding `scheduled_messages` rows (pre-arrival reminder, check-in instructions) based on property's configured timing
- [x] 5.2 Implement scheduled job (periodic scan of `scheduled_messages` where `send_at` <= now and `sent_at` is null) that sends the message via WhatsApp and marks it sent
- [x] 5.3 Include property's check-in instructions (address, access details, host contact) in the check-in message content
- [x] 5.4 Send scheduled guest messages via an approved WhatsApp template when one is configured for that message type (env content SID), falling back to free-form text otherwise; send the host's upcoming-check-in notification via SMS instead of WhatsApp (see 2.7)

## 6. Host Dashboard (host-dashboard)

- [x] 6.1 Implement host login (email/password or magic link) — manual account creation only, no public signup
- [x] 6.2 Build bookings + availability calendar view scoped to the logged-in host's properties
- [x] 6.3 Build conversation list/detail view (highlighting needs-host-reply) with reply box scoped to the host's properties
- [x] 6.4 Build rule management UI (create/edit/disable rules per property)
- [x] 6.5 Enforce host-scoped access on every dashboard API route (a host can only query their own properties' data)
- [x] 6.6 Build manual booking UI: create/edit-dates/cancel a booking for a property, scoped to the host's own properties, surfacing conflict errors from 4.3/4.5

## 7. Pilot Launch

- [ ] 7.1 Manually onboard 1-2 pilot hosts: create host/property records, configure FAQ data and check-in instructions
- [ ] 7.2 Provision each pilot host a new dedicated Twilio WhatsApp number (never migrate their personal number — see design.md), point it at the webhook, and have them start giving out the new number
- [ ] 7.3 Monitor first real conversations closely; adjust FAQ data/rules based on what gets escalated
