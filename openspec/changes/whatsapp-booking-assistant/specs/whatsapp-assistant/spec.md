## Purpose

Answers routine WhatsApp booking inquiries for a host's properties automatically — including searching across all of a host's properties when a guest doesn't name one — applies host-defined rules for simple auto-actions, and hands anything else to the host so no message goes unanswered.

## ADDED Requirements

### Requirement: Inbound Message Handling
The system SHALL receive WhatsApp messages sent to a property's linked WhatsApp Business number and generate a reply.

#### Scenario: Guest sends an inquiry
- **WHEN** a guest sends a WhatsApp message to a property's linked number
- **THEN** the system generates and sends a reply within the configured response window

### Requirement: Multi-Property Availability Proposals
WHEN a guest asks about availability for a date range without naming a specific property, the system SHALL search across all of the host's properties and reply listing every matching property with its dates and price.

#### Scenario: Guest asks for open dates without naming a property
- **WHEN** a guest asks whether anything is available for a date range and does not name a specific property
- **THEN** the assistant searches all of the host's properties for that range and replies listing each match with its dates and price

#### Scenario: Guest already named a property
- **WHEN** a guest's message names a specific property
- **THEN** the assistant answers about that property only, without searching the host's other properties

### Requirement: Alternative Dates When Nothing Matches
WHEN no property is available for the guest's requested date range, the system SHALL tell the guest nothing is available for those exact dates and propose the nearest alternative date ranges with availability, if any.

#### Scenario: Nothing available, alternatives exist
- **WHEN** no property matches the requested date range but alternative date ranges have availability
- **THEN** the assistant tells the guest nothing is free for those exact dates and proposes the alternative ranges with their matching properties and prices

#### Scenario: Nothing available at all
- **WHEN** no property matches the requested date range and no nearby alternative exists either
- **THEN** the assistant tells the guest nothing is available in the near future

### Requirement: FAQ Answering From Property Data
The system SHALL answer common questions (price, availability, house rules, amenities, check-in/checkout time) using the property information configured by the host.

#### Scenario: Guest asks about check-in time
- **WHEN** a guest asks what time check-in is
- **THEN** the assistant replies with the check-in time configured for that property

#### Scenario: Guest asks about availability
- **WHEN** a guest asks whether specific dates are available
- **THEN** the assistant replies based on the property's current booking status for those dates

### Requirement: Rule-Based Auto-Response and Auto-Action
The system SHALL let a host define rules that trigger an automatic reply or an automatic action (such as creating a booking) when the rule's conditions are met.

#### Scenario: Matching rule auto-confirms a booking
- **WHEN** a guest requests dates that are available and a host-defined rule's conditions match (e.g. dates open, price accepted)
- **THEN** the system performs the rule's action (e.g. creates a confirmed booking) and sends the rule's configured reply

#### Scenario: Rule condition not met
- **WHEN** a guest's request does not satisfy any rule's conditions
- **THEN** the system does not perform an automatic action and falls back to FAQ answering or escalation

### Requirement: Escalation to Host
The system SHALL flag a conversation for manual host reply and notify the host whenever an inbound message does not match a FAQ or an auto-response rule.

#### Scenario: Unrecognized request
- **WHEN** a guest sends a message that does not match any configured FAQ or rule
- **THEN** the system marks the conversation as "needs host reply" and notifies the host

### Requirement: Conversation Logging
The system SHALL persist the full message history of every WhatsApp conversation, including whether each reply was automatic or sent by the host.

#### Scenario: Reviewing a past conversation
- **WHEN** a host opens a guest conversation after it happened
- **THEN** the system shows every message in order, marked as automatic or host-sent
