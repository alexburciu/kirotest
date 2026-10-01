# Design Document — SMS Notification Engine

## Overview

The SMS Notification Engine is a TypeScript library that orchestrates drip-sequence SMS reminders for users who stall in an investment onboarding pipeline. It is composed of four primary concerns: **configuration & validation**, **scheduled scanning**, **drip-sequence execution**, and **provider-agnostic delivery**. All state is held in-memory during a session; an optional hydration hook lets an external persistence layer seed and flush records between cron invocations.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  CronScheduler                                               │
│  (node-cron or equivalent)                                   │
│  schedule(cronExpr) ──► engine.scan()                        │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  NotificationEngine                                          │
│                                                              │
│  ┌──────────────┐   ┌───────────────────────┐               │
│  │ ConfigStore  │   │  ReminderRecordStore   │               │
│  │ (validated   │   │  (in-memory Map,       │               │
│  │  at init)    │   │   optional hydration)  │               │
│  └──────┬───────┘   └───────────┬────────────┘              │
│         │                       │                            │
│         ▼                       ▼                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ScanOrchestrator                                    │   │
│  │  for each TriggerDefinition:                         │   │
│  │    → UserProvider.getStuckUsers(step)                │   │
│  │    → StepCompletionChecker.isComplete(user, step)    │   │
│  │    → DripSequenceExecutor.process(user, trigger,     │   │
│  │                                   record)            │   │
│  └──────────────────────────┬───────────────────────────┘   │
│                             │                                │
│                             ▼                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  DripSequenceExecutor                                │   │
│  │  - checks cap, elapsed time, resolution              │   │
│  │  - MessageBuilder.build(user, trigger, position)     │   │
│  │  - SMSProvider.send(message)                         │   │
│  │  - updates ReminderRecord                            │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Domain Types (`types.ts`)

Central value objects and interfaces shared across all modules.

```typescript
/** A single funnel step identifier (e.g. "KYC_INCOMPLETE") */
export type FunnelStepId = string;

/** A user in the onboarding pipeline */
export interface User {
  id: string;
  firstName: string;
  phoneNumber: string; // E.164 format
}

/** Configuration for one funnel step's drip sequence */
export interface TriggerDefinition {
  stepId: FunnelStepId;
  stepLabel: string;               // Human-readable label for SMS interpolation
  /** Ordered delay in hours before each reminder (length must equal templates.length) */
  delayHours: number[];
  /** Message template per reminder position; supports {firstName}, {stepLabel}, {deepLink} */
  messageTemplates: string[];
  /** Deep-link pattern; supports {userId} placeholder */
  deepLinkPattern: string;
}

/** Runtime record tracking sent reminders for one user–step pair */
export interface ReminderRecord {
  userId: string;
  stepId: FunnelStepId;
  sentReminders: SentReminder[];
  resolved: boolean;
  resolvedReason?: 'COMPLETED' | 'CAP_REACHED';
}

export interface SentReminder {
  position: number;         // 0-indexed reminder position
  sentAt: Date;
  providerMessageId: string;
}

/** Composite key for the ReminderRecord store */
export type RecordKey = string; // `${userId}::${stepId}`

/** Value returned by SMSProvider.send */
export interface SMSSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

/** An outbound SMS */
export interface SMSMessage {
  to: string;             // E.164 phone number
  body: string;           // max 160 chars
  metadata: {
    userId: string;
    stepId: FunnelStepId;
    reminderPosition: number;
  };
}

/** Pluggable SMS delivery interface */
export interface SMSProvider {
  send(message: SMSMessage): Promise<SMSSendResult>;
}

/** Pluggable interface that returns users stuck at a given funnel step */
export interface UserProvider {
  getStuckUsers(stepId: FunnelStepId): Promise<User[]>;
}

/** Pluggable interface that checks whether a user has completed a funnel step */
export interface StepCompletionChecker {
  isComplete(userId: string, stepId: FunnelStepId): Promise<boolean>;
}

/** Structured log entry shape */
export interface LogEntry {
  level: 'INFO' | 'ERROR';
  event: string;
  timestamp: string;       // ISO-8601
  [key: string]: unknown;  // Additional context fields
}

/** Pluggable logger interface */
export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}
```

---

### 2. Config Validator (`configValidator.ts`)

Validates the array of `TriggerDefinition` objects at initialisation time, before any state is created.

Rules enforced:
- Array must be non-empty.
- Each definition must have 1–3 reminder positions.
- `delayHours.length` must equal `messageTemplates.length`.
- No duplicate `stepId` values across the array.

```typescript
export function validateConfig(triggers: TriggerDefinition[]): void {
  if (triggers.length === 0) {
    throw new Error('Configuration must contain at least one TriggerDefinition.');
  }

  const seen = new Set<FunnelStepId>();

  for (const trigger of triggers) {
    const { stepId, delayHours, messageTemplates } = trigger;

    if (seen.has(stepId)) {
      throw new Error(`Duplicate FunnelStep identifier: "${stepId}".`);
    }
    seen.add(stepId);

    const positions = messageTemplates.length;
    if (positions < 1 || positions > 3) {
      throw new Error(
        `TriggerDefinition "${stepId}" has ${positions} reminder positions; must be 1–3.`
      );
    }

    if (delayHours.length !== positions) {
      throw new Error(
        `TriggerDefinition "${stepId}" has ${delayHours.length} delay intervals but ${positions} message templates; counts must match.`
      );
    }
  }
}
```

---

### 3. Reminder Record Store (`reminderRecordStore.ts`)

A thin wrapper around a `Map<RecordKey, ReminderRecord>` that:
- Generates composite keys deterministically.
- Initialises missing records on first access.
- Exposes a read-only snapshot (shallow-frozen copy) for external persistence.

```typescript
export class ReminderRecordStore {
  private readonly store: Map<RecordKey, ReminderRecord>;

  constructor(initial?: Map<RecordKey, ReminderRecord>) {
    this.store = initial ? new Map(initial) : new Map();
  }

  key(userId: string, stepId: FunnelStepId): RecordKey {
    return `${userId}::${stepId}`;
  }

  getOrCreate(userId: string, stepId: FunnelStepId): ReminderRecord {
    const k = this.key(userId, stepId);
    if (!this.store.has(k)) {
      this.store.set(k, { userId, stepId, sentReminders: [], resolved: false });
    }
    return this.store.get(k)!;
  }

  get(userId: string, stepId: FunnelStepId): ReminderRecord | undefined {
    return this.store.get(this.key(userId, stepId));
  }

  set(record: ReminderRecord): void {
    this.store.set(this.key(record.userId, record.stepId), record);
  }

  snapshot(): ReadonlyMap<RecordKey, Readonly<ReminderRecord>> {
    return new Map(this.store) as ReadonlyMap<RecordKey, Readonly<ReminderRecord>>;
  }
}
```

---

### 4. Message Builder (`messageBuilder.ts`)

Handles template interpolation, deep-link URL construction, and the 160-character truncation rule.

```typescript
const MAX_BODY_LENGTH = 160;
const TRUNCATE_AT = 157;

export function buildMessage(
  user: User,
  trigger: TriggerDefinition,
  position: number
): SMSMessage {
  const deepLink = trigger.deepLinkPattern.replace('{userId}', user.id);
  const template = trigger.messageTemplates[position];

  let body = template
    .replace('{firstName}', user.firstName)
    .replace('{stepLabel}', trigger.stepLabel)
    .replace('{deepLink}', deepLink);

  if (body.length > MAX_BODY_LENGTH) {
    // Ensure the deep-link is preserved: find its start, cut before it if possible,
    // otherwise hard-truncate and append ellipsis.
    const linkIndex = body.indexOf(deepLink);
    if (linkIndex > TRUNCATE_AT) {
      // Deep-link would be cut — preserve it by restructuring to prefix + link
      const prefix = body.slice(0, TRUNCATE_AT - deepLink.length - 1);
      body = `${prefix} ${deepLink}`;
    } else {
      body = body.slice(0, TRUNCATE_AT) + '\u2026';
    }
  }

  return {
    to: user.phoneNumber,
    body,
    metadata: { userId: user.id, stepId: trigger.stepId, reminderPosition: position },
  };
}
```

---

### 5. Drip Sequence Executor (`dripSequenceExecutor.ts`)

Decides whether to send the next reminder for a given user–step pair, sends it, and updates the record atomically.

```typescript
export class DripSequenceExecutor {
  constructor(
    private readonly provider: SMSProvider,
    private readonly recordStore: ReminderRecordStore,
    private readonly logger: Logger,
    private readonly notificationCap: number = 3,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async process(user: User, trigger: TriggerDefinition, checker: StepCompletionChecker): Promise<void> {
    const record = this.recordStore.getOrCreate(user.id, trigger.stepId);

    // Already resolved — skip without re-checking
    if (record.resolved) return;

    // Check completion
    const complete = await checker.isComplete(user.id, trigger.stepId);
    if (complete) {
      record.resolved = true;
      record.resolvedReason = 'COMPLETED';
      this.recordStore.set(record);
      this.logger.info('SEQUENCE_RESOLVED', {
        userId: user.id, stepId: trigger.stepId, reason: 'COMPLETED',
      });
      return;
    }

    // Cap check
    if (record.sentReminders.length >= this.notificationCap) {
      record.resolved = true;
      record.resolvedReason = 'CAP_REACHED';
      this.recordStore.set(record);
      this.logger.info('SEQUENCE_RESOLVED', {
        userId: user.id, stepId: trigger.stepId, reason: 'CAP_REACHED',
      });
      return;
    }

    const position = record.sentReminders.length;

    // Delay check (skip for first message)
    if (position > 0) {
      const lastSent = record.sentReminders[position - 1].sentAt;
      const elapsedHours = (this.clock().getTime() - lastSent.getTime()) / 3_600_000;
      if (elapsedHours < trigger.delayHours[position]) return;
    }

    const message = buildMessage(user, trigger, position);

    let result: SMSSendResult;
    try {
      result = await this.provider.send(message);
    } catch (err: unknown) {
      this.logger.error('SMS_SEND_EXCEPTION', {
        userId: user.id,
        stepId: trigger.stepId,
        reminderPosition: position,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return; // do NOT increment record
    }

    if (!result.success) {
      this.logger.error('SMS_SEND_FAILURE', {
        userId: user.id,
        stepId: trigger.stepId,
        reminderPosition: position,
        error: result.error,
      });
      return; // do NOT increment record
    }

    // Record the send before declaring success
    record.sentReminders.push({
      position,
      sentAt: this.clock(),
      providerMessageId: result.providerMessageId!,
    });
    this.recordStore.set(record);

    this.logger.info('SMS_DISPATCHED', {
      userId: user.id,
      stepId: trigger.stepId,
      reminderPosition: position,
      providerMessageId: result.providerMessageId,
    });
  }
}
```

---

### 6. Notification Engine (`notificationEngine.ts`)

The public facade. Owns the scan loop, error isolation, and observability logging.

```typescript
export interface EngineConfig {
  triggers: TriggerDefinition[];
  provider: SMSProvider;
  userProvider: UserProvider;
  completionChecker: StepCompletionChecker;
  logger?: Logger;
  notificationCap?: number;
  initialRecords?: Map<RecordKey, ReminderRecord>;
}

export class NotificationEngine {
  private readonly triggers: TriggerDefinition[];
  private readonly recordStore: ReminderRecordStore;
  private readonly executor: DripSequenceExecutor;
  private readonly userProvider: UserProvider;
  private readonly completionChecker: StepCompletionChecker;
  private readonly logger: Logger;

  constructor(config: EngineConfig) {
    validateConfig(config.triggers);
    this.triggers = config.triggers;
    this.logger = config.logger ?? defaultConsoleLogger();
    this.recordStore = new ReminderRecordStore(config.initialRecords);
    this.executor = new DripSequenceExecutor(
      config.provider,
      this.recordStore,
      this.logger,
      config.notificationCap ?? 3
    );
    this.userProvider = config.userProvider;
    this.completionChecker = config.completionChecker;
  }

  async scan(): Promise<void> {
    const startedAt = new Date();
    this.logger.info('SCAN_STARTED', {
      timestamp: startedAt.toISOString(),
      triggerCount: this.triggers.length,
    });

    let totalSent = 0;
    let totalResolved = 0;

    for (const trigger of this.triggers) {
      try {
        const users = await this.userProvider.getStuckUsers(trigger.stepId);
        for (const user of users) {
          try {
            const beforeCount = this.recordStore.get(user.id, trigger.stepId)?.sentReminders.length ?? 0;
            const beforeResolved = this.recordStore.get(user.id, trigger.stepId)?.resolved ?? false;

            await this.executor.process(user, trigger, this.completionChecker);

            const after = this.recordStore.get(user.id, trigger.stepId);
            if (after) {
              const sentDelta = after.sentReminders.length - beforeCount;
              totalSent += sentDelta;
              if (!beforeResolved && after.resolved) totalResolved += 1;
            }
          } catch (userErr: unknown) {
            this.logger.error('SCAN_USER_ERROR', {
              userId: user.id,
              stepId: trigger.stepId,
              error: userErr instanceof Error ? userErr.message : String(userErr),
              stack: userErr instanceof Error ? userErr.stack : undefined,
            });
          }
        }
      } catch (triggerErr: unknown) {
        this.logger.error('SCAN_TRIGGER_ERROR', {
          stepId: trigger.stepId,
          error: triggerErr instanceof Error ? triggerErr.message : String(triggerErr),
          stack: triggerErr instanceof Error ? triggerErr.stack : undefined,
        });
      }
    }

    const durationMs = Date.now() - startedAt.getTime();
    this.logger.info('SCAN_COMPLETED', {
      totalSent,
      totalResolved,
      durationMs,
    });
  }

  /** Read-only snapshot of all ReminderRecords for external persistence flush. */
  getRecordsSnapshot(): ReadonlyMap<RecordKey, Readonly<ReminderRecord>> {
    return this.recordStore.snapshot();
  }
}
```

---

### 7. Cron Scheduler (`cronScheduler.ts`)

A thin wrapper that wires a cron expression to `engine.scan()`. Uses `node-cron` (or any compatible scheduler injected via interface).

```typescript
export interface CronAdapter {
  schedule(expression: string, task: () => void): void;
}

export class CronScheduler {
  constructor(
    private readonly engine: NotificationEngine,
    private readonly cronAdapter: CronAdapter
  ) {}

  start(cronExpression: string): void {
    this.cronAdapter.schedule(cronExpression, () => {
      this.engine.scan().catch((err) => {
        // Top-level safety net — individual errors are already isolated inside scan()
        console.error('Unhandled scan error:', err);
      });
    });
  }
}
```

---

### 8. Console Logger (default) (`consoleLogger.ts`)

A minimal structured logger that writes JSON to stdout/stderr. Replace with Pino, Winston, or any logger implementing the `Logger` interface.

```typescript
export function defaultConsoleLogger(): Logger {
  return {
    info(event, fields = {}) {
      console.log(JSON.stringify({ level: 'INFO', event, timestamp: new Date().toISOString(), ...fields }));
    },
    error(event, fields = {}) {
      console.error(JSON.stringify({ level: 'ERROR', event, timestamp: new Date().toISOString(), ...fields }));
    },
  };
}
```

---

### 9. Provider Adapters (examples)

#### Twilio Adapter

```typescript
import twilio from 'twilio';

export class TwilioSMSProvider implements SMSProvider {
  private client: ReturnType<typeof twilio>;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async send(message: SMSMessage): Promise<SMSSendResult> {
    try {
      const result = await this.client.messages.create({
        to: message.to,
        from: this.fromNumber,
        body: message.body,
      });
      return { success: true, providerMessageId: result.sid };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
```

#### AWS SNS Adapter

```typescript
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

export class AWSSNSProvider implements SMSProvider {
  private client = new SNSClient({});

  async send(message: SMSMessage): Promise<SMSSendResult> {
    try {
      const result = await this.client.send(
        new PublishCommand({ PhoneNumber: message.to, Message: message.body })
      );
      return { success: true, providerMessageId: result.MessageId };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
```

---

## Data Models

### TriggerDefinition (Configuration-time)

| Field | Type | Notes |
|---|---|---|
| `stepId` | `string` | Unique funnel step identifier |
| `stepLabel` | `string` | Human-readable name for SMS copy |
| `delayHours` | `number[]` | Hours to wait before each reminder (length = # of reminders) |
| `messageTemplates` | `string[]` | Template strings with `{firstName}`, `{stepLabel}`, `{deepLink}` |
| `deepLinkPattern` | `string` | URL pattern with optional `{userId}` |

### ReminderRecord (Runtime state)

| Field | Type | Notes |
|---|---|---|
| `userId` | `string` | User identifier |
| `stepId` | `FunnelStepId` | Funnel step identifier |
| `sentReminders` | `SentReminder[]` | Ordered list of sent reminders (max 3) |
| `resolved` | `boolean` | True when no more messages should be sent |
| `resolvedReason` | `'COMPLETED' \| 'CAP_REACHED' \| undefined` | Why it was resolved |

### RecordKey

Composite string `"${userId}::${stepId}"` — provides O(1) lookup in the in-memory `Map`.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Invalid config at init | `validateConfig` throws synchronously before any state is created |
| User-level error during scan | Caught, ERROR-logged with `userId` + `stepId`, scan continues |
| TriggerDefinition-level error | Caught, ERROR-logged with `stepId`, scan continues |
| Provider returns `success: false` | ERROR-logged; record NOT updated |
| Provider throws | Exception caught; ERROR-logged; record NOT updated |
| Interpolated body > 160 chars | Truncated to 157 + `…`; deep-link preserved |

---

## File Structure

```
src/
  types.ts                  # All interfaces and value objects
  configValidator.ts        # Validates TriggerDefinition array
  reminderRecordStore.ts    # In-memory record store
  messageBuilder.ts         # Template interpolation + truncation
  dripSequenceExecutor.ts   # Core drip logic
  notificationEngine.ts     # Public facade + scan orchestration
  cronScheduler.ts          # Cron wiring
  consoleLogger.ts          # Default JSON logger
  providers/
    twilioProvider.ts       # Twilio adapter
    awsSnsProvider.ts       # AWS SNS adapter
index.ts                    # Public barrel export
```

---

## Sequence Diagram — Single Scan Cycle

```
CronScheduler        NotificationEngine     UserProvider    StepCompletionChecker    DripSequenceExecutor    SMSProvider
     │                      │                    │                   │                       │                    │
     │── scan() ──────────►│                    │                   │                       │                    │
     │                      │── getStuckUsers ──►│                   │                       │                    │
     │                      │◄── [users] ────────│                   │                       │                    │
     │                      │                    │                   │                       │                    │
     │                      │── process(user) ───────────────────────────────────────────►  │                    │
     │                      │                    │                   │                       │── isComplete ─────►│
     │                      │                    │                   │◄── false ─────────────│                    │
     │                      │                    │                   │                       │── buildMessage     │
     │                      │                    │                   │                       │── send ───────────►│
     │                      │                    │                   │                       │◄── {success:true} ─│
     │                      │                    │                   │                       │── update record    │
     │◄── scan complete ─── │                    │                   │                       │                    │
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Valid configuration is accepted

*For any* non-empty array of TriggerDefinitions where each step has 1–3 reminders and matching delay/template counts and no duplicate step IDs, the Engine SHALL initialise without throwing an error.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Invalid configuration is rejected

*For any* TriggerDefinition array that violates any one of (empty array, positions outside [1,3], mismatched delay/template counts, duplicate stepIds), the Engine SHALL throw a descriptive error at initialisation time and not enter a running state.

**Validates: Requirements 1.3, 1.4, 1.5**

### Property 3: Every stuck user is checked for completion before sending

*For any* list of users returned as stuck for a given FunnelStep, the StepCompletionChecker SHALL be called for each user during a scan cycle, and no SMS SHALL be sent to users for whom the checker returns `true`.

**Validates: Requirements 2.3, 3.5**

### Property 4: Error isolation — user-level failures do not abort the scan

*For any* list of stuck users where one or more users cause an exception, the Engine SHALL log each error and continue processing the remaining users in the same scan cycle.

**Validates: Requirements 2.4, 2.5**

### Property 5: First reminder is sent immediately on first contact

*For any* user with no existing ReminderRecord for a given FunnelStep, processing that user in a scan cycle SHALL result in exactly one SMS being sent and the ReminderRecord being initialised with `sentReminders.length === 1`.

**Validates: Requirements 3.1, 3.2**

### Property 6: Subsequent reminders respect configured delays

*For any* ReminderRecord with `n > 0` sent reminders where the elapsed time since the last send is less than `trigger.delayHours[n]`, processing that user SHALL NOT send an additional message.

**Validates: Requirements 3.3**

### Property 7: Notification cap is strictly enforced

*For any* user–FunnelStep pair where `sentReminders.length >= notificationCap`, no further SMS SHALL be sent, and the ReminderRecord SHALL be marked resolved with reason `CAP_REACHED`.

**Validates: Requirements 3.4**

### Property 8: Failed delivery does not advance the ReminderRecord

*For any* user–step pair where the SMSProvider returns a failure result OR throws an exception, the `sentReminders.length` of the ReminderRecord SHALL remain unchanged after the attempt.

**Validates: Requirements 5.4, 5.5**

### Property 9: Message body never exceeds 160 characters and always contains the deep-link

*For any* combination of user first name, step label, and deep-link pattern, the constructed SMSMessage body SHALL be at most 160 characters long and SHALL contain the fully resolved deep-link URL.

**Validates: Requirements 4.2, 4.3, 4.4**

### Property 10: Deep-link placeholder is always substituted

*For any* deep-link pattern containing `{userId}` and any user identifier, the constructed SMSMessage body SHALL contain the user's actual identifier and SHALL NOT contain the literal string `{userId}`.

**Validates: Requirements 4.5**

### Property 11: Snapshot immutability

*For any* engine state, mutations to the map returned by `getRecordsSnapshot()` SHALL NOT affect the internal ReminderRecord store, and the snapshot SHALL reflect the state at the time of the call.

**Validates: Requirements 6.4**

### Property 12: Pre-populated records are respected

*For any* initial ReminderRecord map passed at construction time, the Engine SHALL use those records during the first scan cycle — users with resolved records SHALL be skipped and users with existing sent reminders SHALL have their delay and cap logic applied against the hydrated state.

**Validates: Requirements 6.2, 6.3**

### Property 13: Successful dispatches are individually logged

*For any* set of scan cycles that result in N successful SMS sends, exactly N structured INFO log entries with event `SMS_DISPATCHED` SHALL be emitted, each containing `userId`, `stepId`, `reminderPosition`, and `providerMessageId`.

**Validates: Requirements 7.2**

### Property 14: Error conditions always emit ERROR-level log entries

*For any* exception thrown during a scan cycle (at user level or trigger level), exactly one structured ERROR log entry SHALL be emitted containing the error message, the affected identifiers, and a stack trace when available.

**Validates: Requirements 7.4**
