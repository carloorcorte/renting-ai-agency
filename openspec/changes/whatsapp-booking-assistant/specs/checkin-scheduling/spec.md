## Purpose

Turns a confirmed booking into a scheduled check-in and keeps host and guest informed with automatic reminders as the arrival date approaches.

## ADDED Requirements

### Requirement: Check-In Appointment Creation
Confirming a booking SHALL create a check-in appointment with the check-in date, time, and property location.

#### Scenario: Booking confirmed creates check-in
- **WHEN** a booking is confirmed
- **THEN** the system creates a check-in appointment linked to that booking with the property's configured check-in date and time

### Requirement: Automated Follow-Up Messages
The system SHALL send automatic follow-up messages to the guest and to the host at host-configured times relative to the check-in date.

#### Scenario: Pre-arrival reminder sent
- **WHEN** the configured reminder time before check-in is reached
- **THEN** the guest receives a reminder message and the host receives a notification of the upcoming check-in

### Requirement: Check-In Instructions Delivery
The system SHALL send the guest the property's check-in instructions (address, access details, host contact) ahead of arrival.

#### Scenario: Instructions delivered before arrival
- **WHEN** the scheduled check-in instructions message time is reached for a confirmed booking
- **THEN** the guest receives a message containing the property's configured check-in instructions
