## Purpose

Gives a host a single web page to see their properties' bookings and availability, review WhatsApp conversations, and configure the assistant's auto-response rules.

## ADDED Requirements

### Requirement: Bookings and Availability View
The web dashboard SHALL show a host the bookings and availability calendar for each property they own.

#### Scenario: Host views upcoming bookings
- **WHEN** a host opens the dashboard
- **THEN** the dashboard lists their properties' bookings with status and dates, and shows each property's availability calendar

### Requirement: Manual Booking Actions
The web dashboard SHALL let a host create, edit the dates of, and cancel a booking for a property they own, applying the same lifecycle and availability rules as `booking-management`.

#### Scenario: Host creates a booking manually
- **WHEN** a host creates a booking through the dashboard for one of their properties
- **THEN** the booking is created and, once confirmed, blocks that date range like any other booking

#### Scenario: Host edits a booking's dates
- **WHEN** a host changes a booking's dates through the dashboard
- **THEN** the change is applied if the new dates don't conflict with another confirmed booking, or rejected with the conflicting dates shown

#### Scenario: Host cancels a booking
- **WHEN** a host cancels a booking through the dashboard
- **THEN** the booking's status changes to cancelled and its date range becomes available again

### Requirement: Conversation Review
The web dashboard SHALL let a host view WhatsApp conversation history per property, including conversations flagged as needing a reply.

#### Scenario: Host reviews a flagged conversation
- **WHEN** a host opens the dashboard's conversation list
- **THEN** conversations flagged "needs host reply" are visible and the host can read the full message history and reply

### Requirement: Auto-Response Rule Configuration
The web dashboard SHALL let a host create, edit, and disable auto-response and auto-action rules for each property.

#### Scenario: Host edits a rule
- **WHEN** a host changes a rule's conditions or action and saves it
- **THEN** the assistant applies the updated rule to subsequent messages

### Requirement: Access Restricted to Own Properties
The web dashboard SHALL only show a host the bookings, conversations, and rules for properties they own.

#### Scenario: Host cannot see another host's property
- **WHEN** a host is logged in and browses the dashboard
- **THEN** no booking, conversation, or rule belonging to another host's property is shown
