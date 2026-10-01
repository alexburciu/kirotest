# Requirements Document

## Introduction

This document specifies requirements for an MVP SMS Notification Engine designed to re-engage users who have stalled in an investment onboarding/signup pipeline. The engine monitors users stuck at configurable funnel milestones (e.g., incomplete KYC, incomplete account opening, pending verification steps) and sends a capped drip sequence of actionable SMS reminders with deep-links guiding users back to complete each specific step. The system is built in TypeScript and uses a provider-agnostic SMS delivery interface so that Twilio, AWS SNS, or any compatible SMS provider can be plugged in without changes to core logic.

---

## Glossary

- **Engine**: The SMS Notification Engine — the central scheduler and orchestrator component.
- **User**: An individual who has initiated but not completed one or more funnel steps in the investment onboarding pipeline.
- **FunnelStep**: A configurable milestone in the onboarding pipeline (e.g., `KYC_INCOMPLETE`, `ACCOUNT_OPENING_STARTED`, `VERIFICATION_PENDING`).
- **TriggerDefinition**: A configuration object that associates a FunnelStep with its drip sequence parameters (delays, message templates, and deep-link patterns).
- **DripSequence**: An ordered series of SMS reminders sent to a User for a given FunnelStep, subject to a maximum of 3 messages, with configurable inter-message delays.
- **ReminderRecord**: A runtime record tracking which DripSequence messages have been sent to a User for a specific FunnelStep, including send timestamps.
- **SMSProvider**: An abstraction interface implemented by concrete adapters (e.g., Twilio adapter, AWS SNS adapter) that handles actual message dispatch.
- **SMSMessage**: A value object containing the recipient phone number, message body, and associated metadata.
- **CronJob**: A scheduled background process that periodically invokes the Engine to scan for users requiring reminders.
- **DeepLink**: A URL embedded in an SMS message body that routes the User directly to the incomplete FunnelStep in the onboarding application.
- **StepCompletionChecker**: A pluggable interface that the Engine calls to determine whether a User has completed a given FunnelStep.
- **NotificationCap**: The maximum number of reminders the Engine will send to a User for a single FunnelStep (MVP default: 3).

---

## Requirements

### Requirement 1 — Funnel Step Configuration

**User Story:** As a product manager, I want to define configurable funnel milestones with their own drip sequences, so that reminder behaviour can be adjusted per step without code changes.

#### Acceptance Criteria

1. THE Engine SHALL accept a configuration object containing one or more TriggerDefinitions at initialisation time.
2. WHEN a TriggerDefinition is provided, THE Engine SHALL store the FunnelStep identifier, the ordered list of delay intervals (in hours), the message template for each reminder position, and the DeepLink pattern for that FunnelStep.
3. THE Engine SHALL support a minimum of 1 and a maximum of 3 reminder positions per TriggerDefinition.
4. WHEN a TriggerDefinition specifies fewer delay intervals than reminder positions, THE Engine SHALL reject the configuration and emit a descriptive error at initialisation time.
5. WHERE a FunnelStep identifier appears more than once across TriggerDefinitions, THE Engine SHALL reject the configuration and emit a descriptive error at initialisation time.

---

### Requirement 2 — Scheduled Scanning

**User Story:** As a platform operator, I want the engine to run on a scheduled cron job, so that users who are stuck in the funnel are identified and reminded automatically without manual intervention.

#### Acceptance Criteria

1. THE CronJob SHALL invoke the Engine's scan operation on a configurable schedule expressed as a cron expression.
2. WHEN the scan operation is invoked, THE Engine SHALL iterate over every configured TriggerDefinition and retrieve the list of Users currently stuck at that FunnelStep.
3. WHEN retrieving stuck users, THE Engine SHALL call the StepCompletionChecker for each User to confirm the FunnelStep remains incomplete before scheduling a reminder.
4. IF the scan operation encounters an unhandled exception for a single User, THEN THE Engine SHALL log the error with the User identifier and FunnelStep identifier, and SHALL continue processing the remaining Users.
5. IF the scan operation encounters an unhandled exception at the TriggerDefinition level, THEN THE Engine SHALL log the error with the FunnelStep identifier, and SHALL continue processing the remaining TriggerDefinitions.

---

### Requirement 3 — Drip Sequence Execution

**User Story:** As a product manager, I want users to receive a capped series of reminders with increasing delays, so that communication is persistent but not spammy.

#### Acceptance Criteria

1. WHEN the Engine processes a User for a FunnelStep, THE Engine SHALL retrieve or initialise a ReminderRecord for that User–FunnelStep pair.
2. WHEN a ReminderRecord indicates zero reminders have been sent, THE Engine SHALL send the first DripSequence message immediately (within the current scan cycle).
3. WHEN a ReminderRecord indicates a previous reminder was sent, THE Engine SHALL compare the elapsed time since the last send against the configured delay for the next reminder position, and SHALL send the next message only if the elapsed time meets or exceeds that delay.
4. WHEN the ReminderRecord indicates the NotificationCap has been reached, THE Engine SHALL not send any further messages for that User–FunnelStep pair.
5. WHEN the StepCompletionChecker reports a FunnelStep as complete for a User, THE Engine SHALL mark the ReminderRecord as resolved and SHALL not send any further messages for that User–FunnelStep pair.
6. THE Engine SHALL record each sent message in the ReminderRecord, including the reminder position index and the send timestamp, before considering the send operation successful.

---

### Requirement 4 — SMS Message Construction

**User Story:** As a product manager, I want each SMS to contain actionable copy and a deep-link to the specific incomplete step, so that users can navigate directly to where they left off.

#### Acceptance Criteria

1. WHEN constructing an SMSMessage, THE Engine SHALL interpolate the User's first name, the FunnelStep label, and the DeepLink into the TriggerDefinition's message template for the relevant reminder position.
2. THE Engine SHALL produce an SMSMessage whose body does not exceed 160 characters after interpolation.
3. IF the interpolated message body exceeds 160 characters, THEN THE Engine SHALL truncate the body to 157 characters and append an ellipsis character (`…`), preserving the DeepLink in full.
4. THE Engine SHALL include a valid DeepLink in every SMSMessage body.
5. WHEN the DeepLink pattern contains a `{userId}` placeholder, THE Engine SHALL replace it with the User's unique identifier.

---

### Requirement 5 — Provider-Agnostic SMS Delivery

**User Story:** As a developer, I want the SMS delivery layer to be provider-agnostic, so that the underlying SMS provider can be swapped (e.g., Twilio to AWS SNS) without modifying the core notification logic.

#### Acceptance Criteria

1. THE Engine SHALL deliver every SMSMessage exclusively through the SMSProvider interface, without direct dependency on any concrete SMS provider SDK.
2. THE SMSProvider interface SHALL declare a single asynchronous `send` method that accepts an SMSMessage and returns a result object containing a success flag and a provider-assigned message identifier.
3. WHEN an SMSProvider adapter is registered at initialisation time, THE Engine SHALL use that adapter for all subsequent send operations within the session.
4. IF the SMSProvider `send` method returns a failure result, THEN THE Engine SHALL log the failure with the User identifier, FunnelStep identifier, reminder position, and provider error detail, and SHALL not increment the ReminderRecord send count for that attempt.
5. IF the SMSProvider `send` method throws an exception, THEN THE Engine SHALL catch the exception, log it with the same contextual fields, and SHALL not increment the ReminderRecord send count for that attempt.

---

### Requirement 6 — Reminder Record Lifecycle

**User Story:** As a developer, I want the engine to maintain lightweight runtime state for reminder tracking, so that duplicate messages are not sent within a session and the drip sequence respects its timing constraints.

#### Acceptance Criteria

1. THE Engine SHALL maintain an in-memory store of ReminderRecords keyed by a composite of User identifier and FunnelStep identifier.
2. WHEN the Engine initialises, THE Engine SHALL accept an optional pre-populated map of ReminderRecords to support hydration from an external persistence layer.
3. WHEN a ReminderRecord is marked as resolved, THE Engine SHALL retain the record in the in-memory store for the duration of the session to prevent redundant completion checks.
4. THE Engine SHALL expose a read-only snapshot of all ReminderRecords so that an external persistence layer can flush state between scan cycles.

---

### Requirement 7 — Observability and Logging

**User Story:** As a platform operator, I want structured log output for every significant engine event, so that I can monitor pipeline health and diagnose delivery failures.

#### Acceptance Criteria

1. THE Engine SHALL emit a structured log entry at INFO level when a scan cycle begins, including the scan start timestamp and the count of configured TriggerDefinitions.
2. THE Engine SHALL emit a structured log entry at INFO level for each SMSMessage successfully dispatched, including the User identifier, FunnelStep identifier, reminder position, and provider message identifier.
3. THE Engine SHALL emit a structured log entry at INFO level when a DripSequence for a User–FunnelStep pair is resolved (step completed or cap reached), including the resolution reason.
4. IF any error condition occurs during a scan cycle, THEN THE Engine SHALL emit a structured log entry at ERROR level containing the error message, affected identifiers, and a stack trace where available.
5. THE Engine SHALL emit a structured log entry at INFO level when a scan cycle completes, including the total count of messages sent, the total count of sequences resolved, and the scan duration in milliseconds.
