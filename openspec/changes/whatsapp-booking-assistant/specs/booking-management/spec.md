## Purpose

Tracks each booking's status from first inquiry to confirmed or closed, keeps a property's availability calendar consistent so the same dates can never be double-booked, and answers availability questions across a host's whole portfolio of properties.

## ADDED Requirements

### Requirement: Booking Lifecycle Status
The system SHALL track every booking through the states: inquiry, confirmed, declined, cancelled.

#### Scenario: Inquiry becomes confirmed
- **WHEN** a host or an auto-response rule confirms a pending inquiry
- **THEN** the booking's status changes to confirmed

#### Scenario: Host declines an inquiry
- **WHEN** a host declines a pending inquiry
- **THEN** the booking's status changes to declined and no availability is blocked

### Requirement: Availability Blocking on Confirmation
Confirming a booking SHALL mark the property unavailable for the booking's date range.

#### Scenario: Confirmed booking blocks dates
- **WHEN** a booking for a property is confirmed for a given date range
- **THEN** the property is shown as unavailable for that date range in future availability checks

### Requirement: Double-Booking Prevention
The system SHALL reject an attempt to confirm a booking whose date range overlaps an already-confirmed booking on the same property.

#### Scenario: Overlapping confirmation rejected
- **WHEN** a second booking is confirmed for a property with dates overlapping an existing confirmed booking
- **THEN** the system rejects the confirmation and reports the conflicting dates

### Requirement: Cancellation Releases Availability
Cancelling a confirmed booking SHALL release the property's availability for that booking's date range.

#### Scenario: Cancelled booking frees dates
- **WHEN** a host cancels a confirmed booking
- **THEN** the property's date range for that booking becomes available again

### Requirement: Manual Booking Management by Host
The system SHALL allow a host to create a booking directly (not only from an inbound WhatsApp inquiry) and to change an existing booking's date range, applying the same double-booking check as any other booking.

#### Scenario: Host creates a booking directly
- **WHEN** a host creates a booking for a property and date range through means other than a WhatsApp inquiry
- **THEN** the system creates the booking and, once confirmed, blocks that date range like any other confirmed booking

#### Scenario: Host edits a booking's dates
- **WHEN** a host changes a confirmed booking's date range to a range that has no overlap with another confirmed booking on the same property
- **THEN** the booking's dates are updated, the old date range is released, and the new date range is blocked

#### Scenario: Edited dates conflict with another booking
- **WHEN** a host changes a confirmed booking's date range to a range that overlaps another confirmed booking on the same property
- **THEN** the system rejects the change and the booking's dates remain unchanged

### Requirement: Availability Search Across a Host's Properties
The system SHALL, given a host and a requested date range, return every property of that host that is fully available for the entire requested range, together with each property's price.

#### Scenario: Multiple properties match
- **WHEN** two or more of a host's properties are fully available for the requested date range
- **THEN** the search returns all of them with their price

#### Scenario: No property matches
- **WHEN** no property of the host is fully available for the requested date range
- **THEN** the search returns an empty result

### Requirement: Alternative Date Range Suggestions
The system SHALL, when an availability search for a requested date range returns no results, search for the nearest alternative date ranges of the same length that have at least one property fully available, and return them ordered by proximity to the requested dates.

#### Scenario: Alternative found nearby
- **WHEN** the requested date range has no available property but a same-length range starting a different week has one fully available
- **THEN** the system returns that alternative range and its matching property or properties

#### Scenario: No alternative within the lookahead window
- **WHEN** no property is available within the configured lookahead window
- **THEN** the system returns no alternative results
