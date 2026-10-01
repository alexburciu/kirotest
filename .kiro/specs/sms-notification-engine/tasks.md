# Implementation Plan: SMS Notification Engine

## Overview

Build the SMS Notification Engine as a TypeScript library with a layered, test-friendly architecture. Implementation proceeds bottom-up: domain types → validation → state store → message building → drip logic → scan orchestration → scheduling → provider adapters → public barrel export. Each layer is independently testable before the next is wired in.

## Tasks

- [ ] 1. Scaffold project and domain types
  - [ ] 1.1 Initialise TypeScript project with dependencies
    - Create `package.json` with `typescript`, `node-cron`, `twilio`, `@aws-sdk/client-sns` as dependencies and `vitest` as dev dependency
    - Create `tsconfig.json` targeting ES2020 with `strict: true`, `outDir: dist`, `rootDir: src`
    - Create `src/` directory and `src/types.ts` with all domain interfaces and value objects as defined in the design: `FunnelStepId`, `User`, `TriggerDefinition`, `ReminderRecord`, `SentReminder`, `RecordKey`, `SMSSendResult`, `SMSMessage`, `SMSProvider`, `UserProvider`, `StepCompletionChecker`, `LogEntry`, `Logger`
    - _Requirements: 1.1, 1.2, 3.1, 5.1, 5.2_

- [ ] 2. Implement configuration validation
  - [ ] 2.1 Write `configValidator.ts`
    - Implement `validateConfig(triggers: TriggerDefinition[]): void` that enforces: non-empty array, 1–3 reminder positions per trigger, `delayHours.length === messageTemplates.length`, no duplicate `stepId` values
    - Throw descriptive errors for each violation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 2.2 Write property test for config validation (Property 1 & 2)
    - **Property 1: Valid configuration is accepted** — generate arbitrary valid TriggerDefinition arrays and assert no error is thrown
    - **Property 2: Invalid configuration is rejected** — generate arrays with each type of violation (empty, out-of-range positions, mismatched counts, duplicate stepIds) and assert a descriptive error is thrown
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

- [ ] 3. Implement in-memory Reminder Record Store
  - [ ] 3.1 Write `reminderRecordStore.ts`
    - Implement `ReminderRecordStore` class with `Map<RecordKey, ReminderRecord>` backing store
    - Implement `key(userId, stepId)`, `getOrCreate(userId, stepId)`, `get(userId, stepId)`, `set(record)` methods
    - Implement `snapshot()` returning a shallow-frozen `ReadonlyMap` copy so external mutations cannot affect internal state
    - Accept optional `initial?: Map<RecordKey, ReminderRecord>` in constructor for hydration
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 3.2 Write property test for ReminderRecordStore (Property 11 & 12)
    - **Property 11: Snapshot immutability** — mutate the returned snapshot and assert the internal store is unaffected; assert snapshot reflects state at call time
    - **Property 12: Pre-populated records are respected** — construct store with initial records, call `getOrCreate` for an existing key, assert original record is returned unchanged
    - **Validates: Requirements 6.2, 6.3, 6.4**

- [ ] 4. Implement message builder
  - [ ] 4.1 Write `messageBuilder.ts`
    - Implement `buildMessage(user: User, trigger: TriggerDefinition, position: number): SMSMessage`
    - Interpolate `{firstName}`, `{stepLabel}`, `{deepLink}` into `trigger.messageTemplates[position]`
    - Substitute `{userId}` in `trigger.deepLinkPattern` before embedding in the template
    - Apply 160-char cap: if body exceeds 160 chars, truncate to 157 + `…` while ensuring the deep-link is preserved in full
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 4.2 Write property tests for message builder (Properties 9 & 10)
    - **Property 9: Message body never exceeds 160 characters and always contains the deep-link** — for arbitrary user/trigger/position inputs, assert `body.length <= 160` and `body.includes(deepLink)`
    - **Property 10: Deep-link placeholder is always substituted** — assert body never contains the literal string `{userId}` after `buildMessage` is called
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5**

- [ ] 5. Implement default console logger
  - [ ] 5.1 Write `consoleLogger.ts`
    - Implement `defaultConsoleLogger(): Logger` returning an object with `info` and `error` methods
    - Each method serialises a `LogEntry`-shaped JSON object (with `level`, `event`, `timestamp`, and spread `fields`) to `console.log` / `console.error`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 6. Implement Drip Sequence Executor
  - [ ] 6.1 Write `dripSequenceExecutor.ts`
    - Implement `DripSequenceExecutor` class with constructor parameters: `provider`, `recordStore`, `logger`, `notificationCap` (default 3), `clock` (default `() => new Date()`)
    - Implement `process(user, trigger, checker)` method that:
      1. Retrieves or creates ReminderRecord
      2. Returns immediately if already resolved
      3. Calls `checker.isComplete`; if true, marks record `resolved: true, resolvedReason: 'COMPLETED'` and logs `SEQUENCE_RESOLVED`
      4. If `sentReminders.length >= notificationCap`, marks `resolved: true, resolvedReason: 'CAP_REACHED'` and logs `SEQUENCE_RESOLVED`
      5. Checks delay for positions > 0; returns without sending if elapsed time < `trigger.delayHours[position]`
      6. Builds message, calls `provider.send`; on exception logs `SMS_SEND_EXCEPTION` and returns without updating record
      7. On `result.success === false` logs `SMS_SEND_FAILURE` and returns without updating record
      8. On success, pushes to `record.sentReminders`, calls `recordStore.set(record)`, logs `SMS_DISPATCHED`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.4, 5.5_

  - [ ]* 6.2 Write property tests for DripSequenceExecutor (Properties 3, 5, 6, 7, 8)
    - **Property 3: Every stuck user is checked for completion before sending** — mock checker returning true; assert no SMS sent and record resolved
    - **Property 5: First reminder sent immediately on first contact** — new record, assert exactly one send call and `sentReminders.length === 1`
    - **Property 6: Subsequent reminders respect configured delays** — record with 1 sent reminder, elapsed time < delay; assert no additional send
    - **Property 7: Notification cap is strictly enforced** — record with `sentReminders.length === notificationCap`; assert no send and `resolvedReason === 'CAP_REACHED'`
    - **Property 8: Failed delivery does not advance ReminderRecord** — provider returns failure/throws; assert `sentReminders.length` unchanged
    - **Validates: Requirements 3.1–3.6, 5.4, 5.5**

- [ ] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement Notification Engine facade
  - [ ] 8.1 Write `notificationEngine.ts`
    - Define `EngineConfig` interface with `triggers`, `provider`, `userProvider`, `completionChecker`, optional `logger`, `notificationCap`, `initialRecords`
    - Implement `NotificationEngine` class: call `validateConfig` in constructor; initialise `ReminderRecordStore`, `DripSequenceExecutor`, store logger, providers
    - Implement `async scan()`: log `SCAN_STARTED` with timestamp and triggerCount; iterate triggers with outer try/catch logging `SCAN_TRIGGER_ERROR`; for each user iterate with inner try/catch logging `SCAN_USER_ERROR`; track `totalSent` and `totalResolved` deltas; log `SCAN_COMPLETED` with totals and duration
    - Implement `getRecordsSnapshot()` delegating to `recordStore.snapshot()`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 8.2 Write property tests for NotificationEngine (Properties 4, 13, 14)
    - **Property 4: Error isolation — user-level failures do not abort the scan** — inject a user that throws mid-process; assert remaining users are still processed
    - **Property 13: Successful dispatches are individually logged** — for N successful sends in one scan, assert exactly N `SMS_DISPATCHED` INFO entries, each with required fields
    - **Property 14: Error conditions always emit ERROR-level log entries** — for each thrown exception during scan, assert exactly one ERROR entry with message, identifiers, and stack
    - **Validates: Requirements 2.4, 2.5, 7.2, 7.4**

- [ ] 9. Implement Cron Scheduler
  - [ ] 9.1 Write `cronScheduler.ts`
    - Define `CronAdapter` interface with `schedule(expression: string, task: () => void): void`
    - Implement `CronScheduler` class wiring `engine.scan()` to the adapter's schedule call
    - Wrap `engine.scan()` invocation in `.catch` to prevent unhandled promise rejections at the top level
    - _Requirements: 2.1_

- [ ] 10. Implement provider adapters
  - [ ] 10.1 Write `providers/twilioProvider.ts`
    - Implement `TwilioSMSProvider implements SMSProvider` using the `twilio` SDK
    - Constructor accepts `accountSid`, `authToken`, `fromNumber`; lazily constructs Twilio client
    - `send` wraps `client.messages.create`; on success returns `{ success: true, providerMessageId: result.sid }`; on caught exception returns `{ success: false, error: err.message }`
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ] 10.2 Write `providers/awsSnsProvider.ts`
    - Implement `AWSSNSProvider implements SMSProvider` using `@aws-sdk/client-sns`
    - Instantiate `SNSClient`; `send` calls `PublishCommand` with `PhoneNumber` and `Message`
    - On success returns `{ success: true, providerMessageId: result.MessageId }`; on caught exception returns `{ success: false, error: err.message }`
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 11. Wire public barrel export
  - [ ] 11.1 Write `index.ts`
    - Export from all modules: `NotificationEngine`, `EngineConfig`, `CronScheduler`, `CronAdapter`, `TwilioSMSProvider`, `AWSSNSProvider`, `defaultConsoleLogger`, and all types from `types.ts`
    - Ensure no circular imports
    - _Requirements: 5.1, 5.3_

- [ ] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation before moving to the next layer
- Property tests validate universal correctness properties across arbitrary inputs
- Unit tests (within property tasks) validate specific examples and edge cases
- The `clock` injection point in `DripSequenceExecutor` enables deterministic time-based tests without mocking `Date`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "6.1"] },
    { "id": 4, "tasks": ["6.2", "8.1"] },
    { "id": 5, "tasks": ["8.2", "9.1", "10.1", "10.2"] },
    { "id": 6, "tasks": ["11.1"] }
  ]
}
```
