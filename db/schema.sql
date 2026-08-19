-- Schema for the WhatsApp booking assistant MVP.
-- Run once against a fresh Postgres database: psql "$DATABASE_URL" -f db/schema.sql
-- (or `npm run migrate`, which just executes this file — no migration framework
-- needed yet at this scale; add one when schema changes need to be sequenced
-- across environments.)

-- Needed for the EXCLUDE USING gist constraint that enforces no double-booking.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2.1 hosts and properties -----------------------------------------------

CREATE TABLE hosts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    whatsapp_number TEXT NOT NULL UNIQUE, -- bare E.164 number, e.g. '+34600111222' (no 'whatsapp:' prefix)
    -- Separate from whatsapp_number on purpose: that number is registered on
    -- the WhatsApp Business API and has no consumer app attached to receive
    -- a message on. Host-directed notifications go out as plain SMS to this
    -- number instead (design.md: "Messages outside the 24-hour session...").
    notification_phone TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE properties (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id              UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    name                 TEXT NOT NULL,
    price_per_night      NUMERIC(10, 2) NOT NULL,
    currency             TEXT NOT NULL DEFAULT 'EUR',
    min_nights           INTEGER NOT NULL DEFAULT 1,
    house_rules          TEXT NOT NULL DEFAULT '',
    amenities            TEXT NOT NULL DEFAULT '',
    checkin_time         TEXT NOT NULL DEFAULT '15:00', -- HH:MM, used both in FAQ replies and to schedule check-in
    checkin_instructions TEXT NOT NULL DEFAULT '', -- address, access details, host contact

    -- "Host-configured times" for checkin-scheduling's follow-up messages
    -- (spec: Automated Follow-Up Messages). Configured by us during manual
    -- onboarding (tasks.md 7.1), same as the FAQ fields above — no
    -- self-service UI for this in the MVP.
    reminder_days_before_checkin       INTEGER NOT NULL DEFAULT 2,
    host_notify_days_before_checkin    INTEGER NOT NULL DEFAULT 1,
    checkin_instructions_days_before   INTEGER NOT NULL DEFAULT 1,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX properties_host_id_idx ON properties(host_id);

-- 2.2 / 2.3 bookings, with double-booking prevention ----------------------

CREATE TYPE booking_status AS ENUM ('inquiry', 'confirmed', 'declined', 'cancelled');
CREATE TYPE booking_source AS ENUM ('whatsapp', 'manual');

CREATE TABLE bookings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    status      booking_status NOT NULL DEFAULT 'inquiry',
    date_range  DATERANGE NOT NULL, -- '[checkin, checkout)'
    guest_name  TEXT NOT NULL DEFAULT '',
    guest_phone TEXT NOT NULL,
    price       NUMERIC(10, 2),
    source      booking_source NOT NULL DEFAULT 'whatsapp',
    conversation_id UUID, -- FK added after conversations exists (see below)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT date_range_not_empty CHECK (NOT isempty(date_range))
);

-- Requirement: Double-Booking Prevention. Two CONFIRMED bookings on the same
-- property can never have overlapping date ranges — enforced by the database,
-- not just application code, so it holds under concurrent requests too.
ALTER TABLE bookings
    ADD CONSTRAINT no_overlapping_confirmed_bookings
    EXCLUDE USING gist (property_id WITH =, date_range WITH &&)
    WHERE (status = 'confirmed');

CREATE INDEX bookings_property_id_idx ON bookings(property_id);
CREATE INDEX bookings_property_status_idx ON bookings(property_id, status);

-- 2.4 conversations and messages ------------------------------------------

CREATE TABLE conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id     UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL, -- null until resolved
    guest_phone TEXT NOT NULL,
    needs_reply BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (host_id, guest_phone)
);

CREATE INDEX conversations_host_id_idx ON conversations(host_id);
CREATE INDEX conversations_needs_reply_idx ON conversations(host_id, needs_reply);

ALTER TABLE bookings
    ADD CONSTRAINT bookings_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE message_sender AS ENUM ('guest', 'assistant', 'host');

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction       message_direction NOT NULL,
    sent_by         message_sender NOT NULL,
    body            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_id_idx ON messages(conversation_id, created_at);

-- 2.5 rules -----------------------------------------------------------------
--
-- A rule's three possible condition types (proposal.md: "dates available,
-- price match, min-nights") are modeled as: dates-available is always
-- implicitly required (an auto_confirm on unavailable dates would just hit
-- the double-booking check and fail), and `conditions` holds whichever of
-- the other two the host wants to require, ANDed together — e.g.
-- {"max_price": 200, "min_nights": 3} means both must hold. An empty object
-- means "dates being available is the only condition".

CREATE TYPE rule_action AS ENUM ('auto_confirm', 'auto_reply');

CREATE TABLE rules (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id    UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    conditions     JSONB NOT NULL DEFAULT '{}', -- {"min_price_per_night"?: number, "min_nights"?: number}
    action         rule_action NOT NULL,
    reply_template TEXT NOT NULL,
    enabled        BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rules_property_id_idx ON rules(property_id) WHERE enabled;

-- 2.6 check-in appointments and scheduled follow-up messages ---------------

CREATE TABLE checkin_appointments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    checkin_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE scheduled_message_type AS ENUM ('pre_arrival_reminder', 'checkin_instructions');
CREATE TYPE scheduled_message_recipient AS ENUM ('guest', 'host');

CREATE TABLE scheduled_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    type       scheduled_message_type NOT NULL,
    recipient  scheduled_message_recipient NOT NULL,
    send_at    TIMESTAMPTZ NOT NULL,
    sent_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The periodic job scans exactly this: due and not yet sent.
CREATE INDEX scheduled_messages_due_idx ON scheduled_messages(send_at) WHERE sent_at IS NULL;
