# Requirements Document

## Introduction

The SMS Notification Engine Admin/Ops Dashboard is a React single-page application that gives operations and admin teams full control over the SMS Notification Engine backend. The dashboard covers three functional screens — **Trigger Configuration**, **Campaign Monitor**, and **Provider Settings** — plus cross-cutting concerns such as navigation, error handling, confirmation guards, and security. The frontend communicates exclusively with a REST API exposed by the SMS engine backend; all mutations are validated client-side before transmission and must be revalidated server-side.

---

## Glossary

- **Dashboard**: The React SPA described in this document.
- **Trigger**: A `TriggerDefinition` record that maps a funnel step to a drip-sequence schedule, message templates, and a deep-link pattern.
- **Funnel_Step**: A named stage in the investor onboarding pipeline (e.g. `kyc_incomplete`).
- **Delay_Schedule**: The ordered list of `DelayStep` entries attached to a trigger.
- **Delay_Step**: A single entry in a Delay_Schedule carrying a delay amount, unit (`hours` | `days`), and a message template.
- **Campaign**: An active or historical drip-sequence run for a single investor, associated with one Trigger.
- **Campaign_Step**: A single scheduled send within a Campaign, with delivery status and optional error details.
- **Stat_Card**: A summary metric displayed at the top of the Campaign Monitor screen.
- **Provider**: An SMS gateway service — either Twilio or AWS SNS.
- **Credential_Form**: The UI section for entering and saving credentials for a Provider.
- **Auth_Context**: The application-level authentication state that holds the Bearer token for API requests.
- **Toast**: A non-blocking transient notification displayed at the edge of the viewport.
- **Confirmation_Dialog**: A modal that requires explicit user action before a destructive or high-impact operation proceeds.
- **API**: The REST interface exposed by the SMS engine backend.
- **MSW**: Mock Service Worker, used in tests to intercept API requests.
- **Router**: React Router v6 managing client-side navigation.

---

## Requirements

---

### Requirement 1: Application Shell and Navigation

**User Story:** As an operations user, I want a persistent navigation shell, so that I can move between the three functional screens without losing application state.

#### Acceptance Criteria

1. THE Dashboard SHALL render a persistent left sidebar containing navigation links for `/triggers`, `/monitor`, and `/providers`.
2. WHEN the viewport width is below 768 px, THE Dashboard SHALL collapse the sidebar to icon-only display while keeping the navigation links functional.
3. WHEN a user clicks a navigation link, THE Router SHALL navigate to the corresponding route without a full page reload.
4. WHEN the current route is a sub-route (e.g. an active trigger edit), THE Dashboard SHALL display a breadcrumb bar in the topbar reflecting the current location.
5. THE Dashboard SHALL redirect unauthenticated users to the login screen before rendering any protected route.
6. WHEN the Auth_Context does not contain a valid Bearer token, THE Dashboard SHALL not render any protected page content.

---

### Requirement 2: Trigger Configuration — List

**User Story:** As an operations user, I want to see all configured triggers in a list, so that I can find and select a trigger to view or edit.

#### Acceptance Criteria

1. WHEN the user navigates to `/triggers`, THE Dashboard SHALL fetch all trigger definitions from `GET /api/triggers` and display them in the TriggerListPanel.
2. THE TriggerListPanel SHALL display each trigger as a card showing: trigger name, funnel step badge, and active/inactive status pill.
3. WHEN the user types in the search field, THE TriggerListPanel SHALL filter the displayed cards to only those whose name contains the search string (case-insensitive).
4. WHEN the user selects a value in the filter dropdown, THE TriggerListPanel SHALL filter the displayed cards to only those matching the selected funnel step.
5. WHEN a trigger card is clicked, THE Dashboard SHALL load that trigger's data into the TriggerDetailPanel without navigating away from `/triggers`.
6. IF `GET /api/triggers` returns a 5xx response, THEN THE Dashboard SHALL display a dismissible error banner: "Something went wrong. Try again or contact support."
7. IF `GET /api/triggers` returns a 4xx response, THEN THE Dashboard SHALL display the error message from the API response body as an inline notification.

---

### Requirement 3: Trigger Configuration — Create

**User Story:** As an operations user, I want to create a new trigger, so that I can define a new funnel step drip-sequence.

#### Acceptance Criteria

1. WHEN the user clicks "New Trigger", THE Dashboard SHALL open a blank TriggerDetailPanel with all fields empty and a single empty Delay_Step.
2. WHEN the user fills in all required fields and clicks "Save Changes", THE Dashboard SHALL POST the new trigger to `POST /api/triggers`.
3. WHEN `POST /api/triggers` returns a 2xx response, THE Dashboard SHALL display a success Toast and add the new trigger to the TriggerListPanel without a full page reload.
4. IF `POST /api/triggers` returns a 4xx response, THEN THE Dashboard SHALL display inline field-level validation errors from the API response body.
5. IF `POST /api/triggers` returns a 5xx response, THEN THE Dashboard SHALL display a dismissible error banner.
6. WHEN the user clicks "Cancel" before saving, THE Dashboard SHALL discard all unsaved field values and return the TriggerDetailPanel to its previous state.

---

### Requirement 4: Trigger Configuration — Edit

**User Story:** As an operations user, I want to edit an existing trigger, so that I can update its schedule, templates, or deep-link pattern.

#### Acceptance Criteria

1. WHEN a trigger is loaded into the TriggerDetailPanel, THE Dashboard SHALL populate all fields with the trigger's current values.
2. WHEN the user modifies any field and clicks "Save Changes", THE Dashboard SHALL PUT the updated trigger to `PUT /api/triggers/:id`.
3. WHEN `PUT /api/triggers/:id` returns a 2xx response, THE Dashboard SHALL display a success Toast and update the corresponding card in the TriggerListPanel.
4. IF `PUT /api/triggers/:id` returns a 4xx response, THEN THE Dashboard SHALL display inline field-level validation errors from the API response body.
5. IF `PUT /api/triggers/:id` returns a 5xx response, THEN THE Dashboard SHALL display a dismissible error banner.
6. WHEN the user attempts to navigate away from an unsaved trigger edit, THE Dashboard SHALL display a Confirmation_Dialog warning of unsaved changes before allowing navigation.

---

### Requirement 5: Trigger Configuration — Delay Schedule

**User Story:** As an operations user, I want to manage the delay schedule of a trigger, so that I can control when each drip-sequence SMS is sent.

#### Acceptance Criteria

1. THE TriggerDetailPanel SHALL display the Delay_Schedule as an ordered list; each Delay_Step row shows a numeric delay input, a unit toggle (hours / days), and a remove button.
2. WHEN the user clicks "Add Step", THE Dashboard SHALL append a new empty Delay_Step row to the Delay_Schedule.
3. WHEN the user clicks the remove button on a Delay_Step row, THE Dashboard SHALL remove that row and re-index the remaining steps so that `order` values are contiguous and 1-based.
4. WHEN the user reorders Delay_Step rows via drag-and-drop, THE Dashboard SHALL update the `order` values of all affected steps so they remain contiguous and 1-based.
5. THE Dashboard SHALL keep the count of message template text areas in sync with the number of Delay_Step rows at all times.
6. WHEN a delay amount field is set to zero or a non-positive integer, THE Dashboard SHALL display a validation error: "Delay must be a positive integer."
7. WHEN a delay amount would exceed 365 days equivalent, THE Dashboard SHALL display a validation error.

---

### Requirement 6: Trigger Configuration — Message Templates

**User Story:** As an operations user, I want to write and preview message templates for each drip step, so that I can craft personalised SMS content within character limits.

#### Acceptance Criteria

1. THE TriggerDetailPanel SHALL display one message template text area per Delay_Step.
2. WHEN a message template text area is empty and the user attempts to save, THE Dashboard SHALL display a validation error: "Message template is required."
3. WHEN the character count of a message template reaches 160, THE Dashboard SHALL display a warning indicator on that text area.
4. WHEN the character count of a message template exceeds 480, THE Dashboard SHALL prevent saving and display a validation error: "Message exceeds 3 SMS segments (480 characters)."
5. THE TriggerDetailPanel SHALL accept the template variables `{name}`, `{investor_id}`, and `{deep_link}` within message templates without treating them as validation errors.

---

### Requirement 7: Trigger Configuration — Deep-Link Pattern

**User Story:** As an operations user, I want to define a deep-link URL pattern for a trigger, so that each SMS can carry a personalised link back into the onboarding app.

#### Acceptance Criteria

1. THE TriggerDetailPanel SHALL display a single deep-link pattern input field.
2. WHEN the user attempts to save a trigger and the deep-link pattern field is empty, THE Dashboard SHALL display a validation error: "Deep-link pattern is required."
3. WHEN the deep-link pattern does not contain the `{investor_id}` placeholder, THE Dashboard SHALL display a validation error: "Pattern must include {investor_id}."
4. WHEN the deep-link pattern is not a valid URL template (ignoring placeholder tokens), THE Dashboard SHALL display a validation error.
5. THE TriggerDetailPanel SHALL display a tooltip listing the available placeholder variables when the user focuses the deep-link pattern field.

---

### Requirement 8: Trigger Configuration — Delete

**User Story:** As an operations user, I want to delete a trigger with an explicit confirmation step, so that accidental deletions are prevented.

#### Acceptance Criteria

1. WHEN a trigger is loaded in the TriggerDetailPanel, THE Dashboard SHALL display a "Delete" button in the panel header.
2. WHEN the user clicks "Delete", THE Dashboard SHALL open a DeleteTriggerConfirmDialog that requires the user to type the trigger's exact name before enabling the confirm button.
3. WHEN the user types the trigger's exact name and clicks "Confirm", THE Dashboard SHALL call `DELETE /api/triggers/:id`.
4. WHEN `DELETE /api/triggers/:id` returns a 2xx response, THE Dashboard SHALL display a success Toast and remove the trigger from the TriggerListPanel.
5. IF `DELETE /api/triggers/:id` returns a 5xx response, THEN THE Dashboard SHALL display a dismissible error banner and leave the trigger in the list.
6. WHEN the user clicks "Cancel" in the DeleteTriggerConfirmDialog, THE Dashboard SHALL close the dialog and take no further action.

---

### Requirement 9: Campaign Monitor — Stats Overview

**User Story:** As an operations user, I want to see a summary of key campaign metrics at a glance, so that I can quickly assess the health of the SMS engine.

#### Acceptance Criteria

1. WHEN the user navigates to `/monitor`, THE Dashboard SHALL fetch stats from `GET /api/stats` and display four Stat_Cards: Active Campaigns, Sent Today, Resolved Today, and Failed Today.
2. THE Dashboard SHALL populate each Stat_Card with the corresponding value from the `DashboardStats` response.
3. WHEN `GET /api/stats` returns a value for a previous period, THE Dashboard SHALL display a trend indicator (↑ or ↓) on each Stat_Card comparing the current value to the previous period.
4. IF `GET /api/stats` returns a 5xx response, THEN THE Dashboard SHALL display a dismissible error banner on the Campaign Monitor page.

---

### Requirement 10: Campaign Monitor — Delivery Rate Chart

**User Story:** As an operations user, I want to see a delivery rate chart for the past 7 days, so that I can identify trends and anomalies by trigger type.

#### Acceptance Criteria

1. WHEN the user navigates to `/monitor`, THE Dashboard SHALL render a DeliveryRateChart using data from the `deliveryRateHistory` field of the `GET /api/stats` response.
2. THE DeliveryRateChart SHALL display one bar or line series per trigger type over the last 7 calendar days.
3. THE DeliveryRateChart SHALL include a colour-coded legend identifying each trigger type.
4. WHEN the user manually triggers a refresh, THE Dashboard SHALL re-fetch `GET /api/stats` and update the DeliveryRateChart.
5. THE DeliveryRateChart SHALL NOT be re-fetched during auto-refresh cycles; it is only updated on manual refresh or initial page load.

---

### Requirement 11: Campaign Monitor — Campaigns Table

**User Story:** As an operations user, I want to browse active and recent campaigns in a paginated table, so that I can monitor individual investor journeys.

#### Acceptance Criteria

1. WHEN the user navigates to `/monitor`, THE Dashboard SHALL fetch campaigns from `GET /api/campaigns` and display them in the CampaignsTable.
2. THE CampaignsTable SHALL display the following columns: Investor ID, Trigger Name, Current Step (formatted as `n/total`), Next Scheduled Send (relative time), and Status badge.
3. THE CampaignsTable SHALL display status badges with the following colours: Active (green), Warning (amber), Failed (red), Resolved (grey).
4. THE CampaignsTable SHALL display 25 rows per page and provide pagination controls.
5. WHEN the user clicks a column header, THE Dashboard SHALL sort the CampaignsTable by that column; clicking the same header again SHALL reverse the sort order.
6. WHEN the user types in the search field above the table, THE Dashboard SHALL filter rows to those whose Investor ID contains the search string.
7. WHEN the user selects a trigger in the filter dropdown, THE Dashboard SHALL filter rows to those associated with that trigger.
8. IF `GET /api/campaigns` returns a 5xx response, THEN THE Dashboard SHALL display a dismissible error banner on the Campaign Monitor page.

---

### Requirement 12: Campaign Monitor — Campaign Detail Drawer

**User Story:** As an operations user, I want to inspect the full message timeline of a specific campaign, so that I can diagnose delivery failures.

#### Acceptance Criteria

1. WHEN the user clicks a row in the CampaignsTable, THE Dashboard SHALL open a CampaignDetailDrawer sliding in from the right edge of the screen.
2. THE CampaignDetailDrawer SHALL display a timeline of all Campaign_Steps for the selected campaign, ordered by `order` ascending.
3. THE CampaignDetailDrawer SHALL display for each Campaign_Step: scheduled timestamp, delivery status, and a truncated message preview.
4. WHEN a Campaign_Step has `deliveryStatus` of `failed`, THE CampaignDetailDrawer SHALL additionally display the `errorCode` and `errorMessage` for that step.
5. WHEN the user closes the CampaignDetailDrawer, THE Dashboard SHALL return focus to the CampaignsTable without refreshing the page.

---

### Requirement 13: Campaign Monitor — Auto-Refresh

**User Story:** As an operations user, I want the campaign data to auto-refresh periodically, so that I can monitor live campaigns without manually reloading the page.

#### Acceptance Criteria

1. THE Campaign Monitor page SHALL display an AutoRefreshToggle switch and a "Last refreshed" timestamp.
2. WHILE the AutoRefreshToggle is enabled, THE Dashboard SHALL poll `GET /api/campaigns` and `GET /api/stats` every 30 seconds.
3. WHEN the `visibilitychange` event fires and the document becomes hidden, THE Dashboard SHALL pause the auto-refresh polling interval.
4. WHEN the `visibilitychange` event fires and the document becomes visible again, THE Dashboard SHALL resume the auto-refresh polling interval.
5. WHEN the user clicks "Refresh Now", THE Dashboard SHALL immediately fetch `GET /api/campaigns` and `GET /api/stats` and update the CampaignsTable and Stat_Cards.
6. WHEN a fetch completes successfully, THE Dashboard SHALL update the "Last refreshed" timestamp to the current time.

---

### Requirement 14: Provider Settings — Provider Selection

**User Story:** As an operations user, I want to switch the active SMS provider, so that I can route outbound SMS through either Twilio or AWS SNS.

#### Acceptance Criteria

1. WHEN the user navigates to `/providers`, THE Dashboard SHALL fetch the current provider configuration from `GET /api/providers` and render the ProviderSelector with the current active provider pre-selected.
2. THE ProviderSelector SHALL render two radio-button cards: one for Twilio and one for AWS SNS; the active card SHALL display a highlighted border and "active" badge.
3. WHEN the user selects a different provider card, THE Dashboard SHALL display a warning banner: "Switching the active provider will affect all in-flight campaigns."
4. WHEN the user clicks "Save Settings" after changing the active provider, THE Dashboard SHALL open a ProviderSwitchConfirmDialog that explicitly describes the impact on in-flight campaigns.
5. WHEN the user confirms in the ProviderSwitchConfirmDialog, THE Dashboard SHALL PUT the updated configuration to `PUT /api/providers`.
6. WHEN the user cancels in the ProviderSwitchConfirmDialog, THE Dashboard SHALL revert the ProviderSelector to the previously active provider and take no API action.

---

### Requirement 15: Provider Settings — Credential Management

**User Story:** As an operations user, I want to view and update SMS provider credentials, so that I can keep authentication details current without exposing secrets in the UI.

#### Acceptance Criteria

1. THE Dashboard SHALL display all sensitive credential fields (Account SID, Auth Token, Secret Access Key) as masked inputs showing placeholder characters.
2. THE Dashboard SHALL never receive or display actual secret values from the API; masked placeholders are supplied by the API and rendered as-is.
3. WHEN the user clicks "Edit" on a credential field, THE Dashboard SHALL reveal that field for editing and display "Save Field" and "Cancel" controls inline.
4. WHEN the user clicks "Cancel" on an inline credential edit, THE Dashboard SHALL restore the field to its masked placeholder without writing any value.
5. WHEN the user clicks "Save Field" on an inline credential edit, THE Dashboard SHALL PUT the updated credential to `PUT /api/providers` with only the edited field value.
6. IF `PUT /api/providers` returns a 4xx response, THEN THE Dashboard SHALL display the API error message inline beneath the relevant field.
7. IF `PUT /api/providers` returns a 5xx response, THEN THE Dashboard SHALL display a dismissible error banner.
8. WHEN the credential editing session ends (save, cancel, or component unmount), THE Dashboard SHALL clear the plaintext credential value from component state.

---

### Requirement 16: Provider Settings — Test Connection

**User Story:** As an operations user, I want to test the active provider connection, so that I can verify credentials are correct without sending a real SMS.

#### Acceptance Criteria

1. THE Provider Settings page SHALL display a "Test Connection" button for each Provider's Credential_Form.
2. WHEN the user clicks "Test Connection", THE Dashboard SHALL POST to `POST /api/providers/test` without including any credential values in the request body.
3. WHEN `POST /api/providers/test` returns a 2xx response, THE Dashboard SHALL display an inline success indicator: "Connection successful."
4. IF `POST /api/providers/test` returns a 4xx or 5xx response, THEN THE Dashboard SHALL display an inline failure indicator showing the error message from the response body.

---

### Requirement 17: Cross-Cutting — Client-Side Form Validation

**User Story:** As an operations user, I want immediate feedback when I enter invalid data, so that I can correct mistakes before submitting to the API.

#### Acceptance Criteria

1. WHEN a trigger name field is submitted empty, THE Dashboard SHALL display a validation error: "Name is required."
2. WHEN a trigger name exceeds 100 characters, THE Dashboard SHALL display a validation error: "Name must be 100 characters or fewer."
3. WHEN a funnel step is not selected, THE Dashboard SHALL display a validation error: "Funnel step is required."
4. WHEN a Twilio Account SID does not match the expected format (starts with `AC`, 34 characters total), THE Dashboard SHALL display a validation error.
5. WHEN a Twilio Auth Token is present but does not match the expected 32-character hexadecimal format, THE Dashboard SHALL display a validation error.
6. THE Dashboard SHALL display all validation errors inline adjacent to the relevant field, not in a separate error summary.

---

### Requirement 18: Cross-Cutting — API Error Handling

**User Story:** As an operations user, I want the dashboard to handle API errors gracefully, so that I always know when something has gone wrong and can take corrective action.

#### Acceptance Criteria

1. IF any API call returns a 5xx response, THEN THE Dashboard SHALL display a dismissible banner at the top of the current page: "Something went wrong. Try again or contact support."
2. IF any API call returns a 4xx response, THEN THE Dashboard SHALL display inline error messages derived from the API response body adjacent to the relevant fields or actions.
3. IF a network request times out or fails due to connectivity loss, THEN THE Dashboard SHALL display a non-blocking Toast: "Connection lost. Retrying…" and retry the request using exponential backoff with a maximum of 3 attempts.
4. WHEN a retried request eventually succeeds, THE Dashboard SHALL dismiss the "Connection lost" Toast and render the fetched data normally.
5. WHEN the user dismisses an error banner, THE Dashboard SHALL remove the banner without navigating away or reloading data.

---

### Requirement 19: Cross-Cutting — Confirmation Guards

**User Story:** As an operations user, I want explicit confirmation steps before destructive or high-impact operations, so that I do not accidentally lose data or disrupt running campaigns.

#### Acceptance Criteria

1. WHEN the user attempts to navigate away from a TriggerDetailPanel with unsaved changes, THE Dashboard SHALL present a Confirmation_Dialog warning that unsaved changes will be lost.
2. WHEN the user confirms the navigation prompt, THE Dashboard SHALL discard unsaved changes and proceed with navigation.
3. WHEN the user cancels the navigation prompt, THE Dashboard SHALL remain on the current page with all unsaved changes intact.
4. WHEN deleting a trigger, THE Dashboard SHALL require the user to type the trigger's exact name into a confirmation field before enabling the final delete action.
5. WHEN switching the active SMS provider, THE Dashboard SHALL require explicit acknowledgement of impact on in-flight campaigns before saving.

---

### Requirement 20: Cross-Cutting — Security

**User Story:** As a system operator, I want the dashboard to follow secure credential handling practices, so that sensitive secrets are never exposed in the browser beyond what is strictly necessary.

#### Acceptance Criteria

1. THE Dashboard SHALL attach an `Authorization: Bearer <token>` header to every API request using the token stored in the Auth_Context.
2. THE Dashboard SHALL never persist credential values (Auth Token, Secret Access Key, Account SID) in browser localStorage, sessionStorage, or any persistent client-side store.
3. WHEN a credential editing component unmounts, THE Dashboard SHALL clear any plaintext credential value from React component state.
4. THE Dashboard SHALL render all sensitive credential fields using masked inputs; the underlying DOM input type SHALL be `password` or equivalent to prevent browser autofill exposure.
5. THE Dashboard SHALL not transmit any credential values to `POST /api/providers/test`; the test endpoint relies solely on server-side stored credentials.
