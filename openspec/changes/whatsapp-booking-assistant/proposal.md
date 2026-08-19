## Why

Hosts who rent houses in Ibiza get most booking inquiries by WhatsApp and phone, answer the same questions over and over (dates, price, house rules), and track booking status by memory or spreadsheet — which causes slow replies and occasional double-bookings. An AI assistant that answers routine WhatsApp questions, applies preset rules, and keeps booking status in one place removes that manual load without replacing the host for real decisions.

## What Changes

- WhatsApp Business number receives inquiries; an AI assistant answers common questions (availability, price, house info) from each property's data.
- Host-defined rules let the assistant auto-respond or auto-act in specific cases (e.g. auto-confirm if dates are open and price matches); anything outside the rules is flagged for the host to answer manually.
- Creating a booking marks the property unavailable for those dates and tracks status through the booking lifecycle (inquiry → confirmed / declined / cancelled).
- Confirming a booking creates a check-in appointment and schedules automatic follow-up messages to both host and guest (pre-arrival reminder, check-in details).
- A web dashboard lets a host see bookings, property calendars, conversation history, and edit auto-response rules.
- Data model separates hosts and properties from day one (each host owns one or more properties) so onboarding more hosts later needs no rework — but onboarding stays manual (added by us), with no public signup, billing, or per-agency admin roles in this change.
- Out of scope for this change: phone call automation (calls stay manual), native mobile app (web dashboard is responsive), multi-tenant self-serve signup/billing for agencies.

## Capabilities

### New Capabilities
- `whatsapp-assistant`: Receives WhatsApp messages, answers routine questions using property data, applies host-defined auto-response/auto-action rules, and escalates anything else to the host.
- `booking-management`: Tracks booking lifecycle and status, blocks/releases property availability for booked date ranges, prevents double-booking.
- `checkin-scheduling`: Creates a check-in appointment when a booking is confirmed and sends automatic follow-up messages to host and guest.
- `host-dashboard`: Web interface for a host to view bookings and property availability, read conversation history, and configure auto-response rules.

### Modified Capabilities
(none — greenfield project, no existing specs)

## Impact

- New system: no existing code or specs are affected.
- New backend service, database (hosts, properties, bookings, conversations, rules), and integration with WhatsApp Business API (via a provider such as Twilio or Meta Cloud API — confirmed in design.md).
- New responsive web dashboard (host-facing).
- Recurring cost from day one: WhatsApp Business API/provider fees and LLM usage per conversation — sized in design.md.
