# Implementation Plan: SMS Admin/Ops Dashboard

## Overview

A React + TypeScript + Tailwind + shadcn/ui SPA wired to the SMS Notification Engine REST API. Implementation proceeds in six phases: (1) project scaffold, (2) AppShell & routing, (3) shared utilities, (4) Trigger Configuration screen, (5) Campaign Monitor screen, (6) Provider Settings screen. Each phase ends with a checkpoint; property-based tests are placed immediately after the code they verify.

---

## Tasks

- [ ] 1. Scaffold the project and install all dependencies
  - Initialise a Vite + React + TypeScript project inside the workspace root
  - Install and configure Tailwind CSS v3 with the shadcn/ui preset
  - Run the shadcn/ui CLI to initialise the component library (Button, Dialog, Toast, Badge, Input, Select, Drawer, Sheet, Tooltip)
  - Install runtime dependencies: `react-router-dom@6`, `@tanstack/react-query@5`, `react-hook-form`, `zod`, `recharts`
  - Install dev/test dependencies: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `msw@2`, `fast-check`, `@types/react`, `@types/node`
  - Configure `vitest.config.ts` with jsdom environment and setup file; configure MSW service-worker for browser and Node
  - _Requirements: cross-cutting (all screens depend on scaffold)_

- [ ] 2. Define shared TypeScript types and Zod schemas
  - [ ] 2.1 Create `src/types/index.ts` with all interfaces from the design (`TriggerDefinition`, `DelayStep`, `Campaign`, `CampaignStep`, `DashboardStats`, `DailyDeliveryRate`, `ProviderConfig`, `TwilioCredentials`, `AwsSnsCredentials`, `ProviderType`)
    - _Requirements: 2.2, 4.1, 9.2, 11.2, 15.1_
  - [ ] 2.2 Create `src/schemas/triggerSchemas.ts` with Zod schemas for `TriggerDefinition` and `DelayStep`, including all client-side validation rules (name ≤ 100 chars, delay positive integer, delay ≤ 365 days, message template required / ≤ 480 chars, deep-link contains `{investor_id}` and is a valid URL template)
    - _Requirements: 5.6, 5.7, 6.2, 6.4, 6.5, 7.2, 7.3, 7.4, 17.1, 17.2, 17.3_
  - [ ] 2.3 Create `src/schemas/providerSchemas.ts` with Zod schemas for `TwilioCredentials` (Account SID starts with `AC`, length 34; Auth Token 32-hex chars) and `AwsSnsCredentials`
    - _Requirements: 17.4, 17.5_
  - [ ]* 2.4 Write property tests for trigger validation schemas (Properties 7, 8, 9, 10, 11, 12, 23)
    - **Property 7: Non-positive delay amount fails validation** — Validates: Requirements 5.6
    - **Property 8: Over-limit delay amount fails validation** — Validates: Requirements 5.7
    - **Property 9: Empty message template fails validation** — Validates: Requirements 6.2
    - **Property 10: Over-480-character message template fails validation** — Validates: Requirements 6.4
    - **Property 11: Template variables are not flagged as errors** — Validates: Requirements 6.5
    - **Property 12: Deep-link validation** — Validates: Requirements 7.3, 7.4
    - **Property 23: Trigger name length validation** — Validates: Requirements 17.2
    - _File: `src/schemas/__tests__/triggerSchemas.property.test.ts`_
  - [ ]* 2.5 Write property tests for provider validation schemas (Properties 24, 25)
    - **Property 24: Twilio Account SID format validation** — Validates: Requirements 17.4
    - **Property 25: Twilio Auth Token format validation** — Validates: Requirements 17.5
    - _File: `src/schemas/__tests__/providerSchemas.property.test.ts`_

- [ ] 3. Implement the API client and Auth context
  - [ ] 3.1 Create `src/lib/apiClient.ts` — an Axios (or native `fetch`-based) client that attaches `Authorization: Bearer <token>` to every request, implements exponential-backoff retry (max 3) on network timeout, and throws typed errors distinguishing 4xx vs 5xx vs network failure
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 20.1_
  - [ ] 3.2 Create `src/contexts/AuthContext.tsx` — React context and provider that stores the Bearer token, exposes `login` / `logout`, and never persists the token to `localStorage` or `sessionStorage`
    - _Requirements: 1.5, 1.6, 20.2_
  - [ ]* 3.3 Write property test for authorization header invariant (Property 27)
    - **Property 27: Authorization header on every request** — Validates: Requirements 20.1
    - _File: `src/lib/__tests__/apiClient.property.test.ts`_

- [ ] 4. Checkpoint — core scaffold is complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Build the AppShell, routing, and navigation
  - [ ] 5.1 Create `src/App.tsx` with `BrowserRouter` and top-level routes: `/triggers`, `/monitor`, `/providers`; redirect `/` to `/triggers`; wrap all routes in an auth guard that redirects unauthenticated users to `/login`
    - _Requirements: 1.1, 1.3, 1.5, 1.6_
  - [ ] 5.2 Create `src/components/layout/AppShell.tsx` — persistent left sidebar with navigation links (Settings icon → `/triggers`, Activity icon → `/monitor`, Cloud icon → `/providers`), topbar with breadcrumb slot, and responsive collapse to icon-only below 768 px
    - _Requirements: 1.1, 1.2, 1.4_
  - [ ] 5.3 Create `src/components/layout/Breadcrumb.tsx` that reads the current route and renders the appropriate breadcrumb segments in the topbar
    - _Requirements: 1.4_
  - [ ]* 5.4 Write unit tests for AppShell navigation and responsive collapse
    - Verify sidebar links render and navigate without page reload
    - Verify icon-only mode activates below 768 px
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 6. Implement shared error-handling UI components
  - [ ] 6.1 Create `src/components/ui/ErrorBanner.tsx` — dismissible full-width banner for 5xx errors; "Something went wrong. Try again or contact support."
    - _Requirements: 18.1, 18.5_
  - [ ] 6.2 Create `src/components/ui/ConnectionLostToast.tsx` — non-blocking toast for network timeouts: "Connection lost. Retrying…"; auto-dismisses when a retry succeeds
    - _Requirements: 18.3, 18.4_
  - [ ] 6.3 Create `src/components/ui/FieldError.tsx` — inline error message component rendered as a sibling/direct descendant of the relevant input
    - _Requirements: 17.6_
  - [ ]* 6.4 Write property test for inline validation error placement (Property 26)
    - **Property 26: Validation errors rendered inline** — Validates: Requirements 17.6
    - _File: `src/components/ui/__tests__/FieldError.property.test.ts`_

- [ ] 7. Build the Trigger Configuration — list panel
  - [ ] 7.1 Create `src/features/triggers/TriggerListPanel.tsx` — scrollable list of trigger cards; each card shows name, funnel-step badge, and active/inactive status pill; selected card is highlighted; includes a search text input and funnel-step filter dropdown; "New Trigger" button
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ]* 7.2 Write property test for trigger card rendering (Property 1)
    - **Property 1: Trigger card renders required fields** — Validates: Requirements 2.2
    - _File: `src/features/triggers/__tests__/TriggerListPanel.property.test.ts`_
  - [ ]* 7.3 Write property tests for search and funnel-step filter correctness (Properties 2, 3)
    - **Property 2: Search filter correctness** — Validates: Requirements 2.3
    - **Property 3: Funnel-step filter correctness** — Validates: Requirements 2.4
    - _File: `src/features/triggers/__tests__/TriggerListPanel.property.test.ts`_

- [ ] 8. Build the Trigger Configuration — delay schedule sub-component
  - [ ] 8.1 Create `src/features/triggers/DelaySchedule.tsx` — ordered list of delay step rows; each row has a numeric input (delay amount), unit toggle (hours/days), and a remove (trash) button; "Add Step" appends a new empty row; drag-to-reorder (using native HTML drag events or `@dnd-kit/core`); re-indexes `order` after every mutation
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [ ]* 8.2 Write property test for delay schedule order invariant (Property 5)
    - **Property 5: Delay schedule order invariant** — Validates: Requirements 5.3, 5.4
    - _File: `src/features/triggers/__tests__/DelaySchedule.property.test.ts`_

- [ ] 9. Build the Trigger Configuration — detail/edit panel
  - [ ] 9.1 Create `src/features/triggers/TriggerDetailPanel.tsx` — hosts the full edit form using `react-hook-form` + Zod resolver; renders Name field, Funnel Step selector (dropdown), `DelaySchedule`, message template text areas (count in sync with delay steps, live character counter, 160-char warning, 480-char blocking error), Deep-Link Pattern input with tooltip listing `{name}`, `{investor_id}`, `{deep_link}`; Save and Cancel buttons; Delete button in panel header
    - _Requirements: 3.1, 4.1, 5.5, 6.1, 6.3, 7.1, 7.5, 8.1_
  - [ ]* 9.2 Write property test for detail panel field population (Property 4)
    - **Property 4: Detail panel field population** — Validates: Requirements 4.1
    - _File: `src/features/triggers/__tests__/TriggerDetailPanel.property.test.ts`_
  - [ ]* 9.3 Write property test for template count tracking step count (Property 6)
    - **Property 6: Template count tracks step count** — Validates: Requirements 5.5, 6.1
    - _File: `src/features/triggers/__tests__/TriggerDetailPanel.property.test.ts`_

- [ ] 10. Build the Delete Trigger confirmation dialog
  - [ ] 10.1 Create `src/features/triggers/DeleteTriggerConfirmDialog.tsx` — modal dialog that requires the user to type the trigger's exact name before enabling the Confirm button; Cancel closes without action
    - _Requirements: 8.2, 8.3, 8.6, 19.4_
  - [ ]* 10.2 Write property test for type-to-confirm delete guard (Property 13)
    - **Property 13: Type-to-confirm delete guard** — Validates: Requirements 8.3, 19.4
    - _File: `src/features/triggers/__tests__/DeleteTriggerConfirmDialog.property.test.ts`_

- [ ] 11. Implement the Trigger Configuration page and wire API calls
  - [ ] 11.1 Create `src/pages/TriggersPage.tsx` — composes `TriggerListPanel` and `TriggerDetailPanel` side-by-side; fetches triggers with `useQuery` (`GET /api/triggers`); mutations for create (`POST`), update (`PUT`), delete (`DELETE`) via `useMutation`; handles unsaved-changes navigation guard (react-router `useBlocker`); dispatches success toasts and error banners
    - _Requirements: 2.1, 2.5, 2.6, 2.7, 3.2, 3.3, 3.4, 3.5, 3.6, 4.2, 4.3, 4.4, 4.5, 4.6, 8.3, 8.4, 8.5, 19.1, 19.2, 19.3_
  - [ ]* 11.2 Write integration tests for Trigger Configuration flows using MSW
    - Test: navigate to `/triggers` → list fetched and rendered
    - Test: click "New Trigger" → blank panel opens → fill form → save → success toast + list updated
    - Test: edit existing trigger → save → PUT called → list card updated
    - Test: delete trigger → type name in dialog → confirm → DELETE called → trigger removed from list
    - Test: unsaved changes → click nav link → confirmation dialog appears
    - _File: `src/pages/__tests__/TriggersPage.integration.test.ts`_

- [ ] 12. Checkpoint — Trigger Configuration screen complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Build the Campaign Monitor — stat cards and chart
  - [ ] 13.1 Create `src/features/monitor/StatCard.tsx` — displays a bold metric value, a label, and a trend indicator (↑ if current > previous, ↓ if current < previous)
    - _Requirements: 9.2, 9.3_
  - [ ]* 13.2 Write property test for stat card data accuracy (Property 14)
    - **Property 14: Stat card data accuracy** — Validates: Requirements 9.2, 9.3
    - _File: `src/features/monitor/__tests__/StatCard.property.test.ts`_
  - [ ] 13.3 Create `src/features/monitor/DeliveryRateChart.tsx` — Recharts bar/line chart rendering `deliveryRateHistory`; one series per trigger type; colour-coded legend; accepts data as prop
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 14. Build the Campaign Monitor — campaigns table
  - [ ] 14.1 Create `src/features/monitor/CampaignsTable.tsx` — paginated (25 rows/page) sortable table; columns: Investor ID, Trigger Name, Current Step (`n/total`), Next Scheduled Send (relative time), Status badge (green/amber/red/grey); search input filtering by Investor ID; trigger filter dropdown; row-click fires `onRowClick` callback
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
  - [ ]* 14.2 Write property test for campaign table column completeness (Property 15)
    - **Property 15: Campaign table column completeness** — Validates: Requirements 11.2
    - _File: `src/features/monitor/__tests__/CampaignsTable.property.test.ts`_
  - [ ]* 14.3 Write property test for status badge colour mapping (Property 16)
    - **Property 16: Status badge colour mapping** — Validates: Requirements 11.3
    - _File: `src/features/monitor/__tests__/CampaignsTable.property.test.ts`_
  - [ ]* 14.4 Write property test for pagination row limit (Property 17)
    - **Property 17: Pagination row limit** — Validates: Requirements 11.4
    - _File: `src/features/monitor/__tests__/CampaignsTable.property.test.ts`_
  - [ ]* 14.5 Write property tests for campaign search and trigger filter correctness (Properties 18, 19)
    - **Property 18: Campaign search filter correctness** — Validates: Requirements 11.6
    - **Property 19: Campaign trigger filter correctness** — Validates: Requirements 11.7
    - _File: `src/features/monitor/__tests__/CampaignsTable.property.test.ts`_

- [ ] 15. Build the Campaign Detail Drawer
  - [ ] 15.1 Create `src/features/monitor/CampaignDetailDrawer.tsx` — Sheet/Drawer component sliding in from the right; renders a vertical timeline of `CampaignStep` entries sorted ascending by `order`; each node shows scheduled timestamp, delivery status, and truncated message preview; failed steps additionally show `errorCode` and `errorMessage`; closes with focus restored to the table
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  - [ ]* 15.2 Write property test for drawer step ordering (Property 20)
    - **Property 20: Campaign detail drawer step ordering** — Validates: Requirements 12.2
    - _File: `src/features/monitor/__tests__/CampaignDetailDrawer.property.test.ts`_
  - [ ]* 15.3 Write property test for drawer step field completeness (Property 21)
    - **Property 21: Campaign detail drawer step fields** — Validates: Requirements 12.3, 12.4
    - _File: `src/features/monitor/__tests__/CampaignDetailDrawer.property.test.ts`_

- [ ] 16. Build the auto-refresh toggle and wire the Campaign Monitor page
  - [ ] 16.1 Create `src/features/monitor/AutoRefreshToggle.tsx` — toggle switch component; when enabled, the parent page polls every 30 s; also exposes a "Refresh Now" button; displays "Last refreshed: HH:MM:SS" timestamp updated on every successful fetch
    - _Requirements: 13.1, 13.2, 13.5, 13.6_
  - [ ]* 16.2 Write property test for last-refreshed timestamp accuracy (Property 22)
    - **Property 22: Last-refreshed timestamp accuracy** — Validates: Requirements 13.6
    - _File: `src/features/monitor/__tests__/AutoRefreshToggle.property.test.ts`_
  - [ ] 16.3 Create `src/pages/MonitorPage.tsx` — composes `StatCard ×4`, `DeliveryRateChart`, `AutoRefreshToggle`, `CampaignsTable`, and `CampaignDetailDrawer`; uses `useQuery` for stats and campaigns; polling managed by `@tanstack/react-query` `refetchInterval` toggled by the AutoRefreshToggle state; pauses polling on `visibilitychange` hidden; re-fetches chart only on manual refresh or mount; handles 5xx error banner
    - _Requirements: 9.1, 9.4, 10.1, 10.4, 10.5, 11.1, 11.8, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_
  - [ ]* 16.4 Write integration tests for Campaign Monitor using MSW
    - Test: navigate to `/monitor` → stats and campaigns fetched and rendered
    - Test: enable auto-refresh → advance fake timers 30 s → refetch fired
    - Test: document hidden → polling paused; document visible → polling resumed
    - Test: "Refresh Now" → immediate refetch triggered
    - Test: click campaign row → drawer opens with sorted steps
    - _File: `src/pages/__tests__/MonitorPage.integration.test.ts`_

- [ ] 17. Checkpoint — Campaign Monitor screen complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Build the Provider Settings — provider selector and credential forms
  - [ ] 18.1 Create `src/features/providers/ProviderSelector.tsx` — two radio-button cards (Twilio, AWS SNS); active card has highlighted border and "active" badge; selecting a different card shows the in-flight-campaigns warning banner
    - _Requirements: 14.1, 14.2, 14.3_
  - [ ] 18.2 Create `src/features/providers/CredentialFormTwilio.tsx` — fields: Account SID, Auth Token, From Number; all sensitive fields are `type="password"` masked inputs displaying API-provided placeholder strings; each field has an inline "Edit" / "Save Field" / "Cancel" control pattern; "Test Connection" button fires `POST /api/providers/test` and shows inline success/failure; clears plaintext on save, cancel, or unmount
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 16.1, 16.2, 16.3, 16.4, 20.3, 20.4, 20.5_
  - [ ] 18.3 Create `src/features/providers/CredentialFormAwsSns.tsx` — fields: Access Key ID, Secret Access Key, Region (dropdown of AWS regions), Topic ARN; same masked inline-edit pattern and "Test Connection" behaviour as Twilio form
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 16.1, 16.2, 16.3, 16.4, 20.3, 20.4, 20.5_

- [ ] 19. Build the Provider Switch confirmation dialog and wire the Provider Settings page
  - [ ] 19.1 Create `src/features/providers/ProviderSwitchConfirmDialog.tsx` — modal confirming provider switch; describes in-flight campaign impact; "Yes, switch provider" / "Cancel"; Cancel reverts the selector
    - _Requirements: 14.4, 14.5, 14.6, 19.5_
  - [ ] 19.2 Create `src/pages/ProvidersPage.tsx` — composes `ProviderSelector`, `CredentialFormTwilio`, `CredentialFormAwsSns`, and `ProviderSwitchConfirmDialog`; fetches config with `useQuery` (`GET /api/providers`); `PUT /api/providers` mutation on save; handles error banner and success toast
    - _Requirements: 14.1, 14.2, 14.5, 14.6, 15.5, 15.6, 15.7_
  - [ ]* 19.3 Write integration tests for Provider Settings using MSW
    - Test: navigate to `/providers` → current provider config fetched and pre-selected
    - Test: select different provider → warning banner appears → save → confirm dialog opens → confirm → PUT called
    - Test: cancel confirm dialog → selector reverts to previous provider, no PUT fired
    - Test: inline credential edit → "Save Field" → PUT called with only that field
    - Test: "Test Connection" success and failure paths
    - _File: `src/pages/__tests__/ProvidersPage.integration.test.ts`_

- [ ] 20. Final checkpoint — all screens complete
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints (tasks 4, 12, 17, 20) validate incremental progress
- Property tests use `fast-check` and cover all 27 correctness properties from the design
- Integration tests use MSW v2 to intercept real `fetch` calls without a running backend
- The design uses TypeScript throughout; no language selection prompt is required

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1"] },
    { "id": 1, "tasks": ["2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "2.5", "3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "5.4", "6.1", "6.2", "6.3"] },
    { "id": 5, "tasks": ["6.4", "7.1", "8.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "8.2", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "10.1"] },
    { "id": 8, "tasks": ["10.2", "11.1"] },
    { "id": 9, "tasks": ["11.2", "13.1", "13.3"] },
    { "id": 10, "tasks": ["13.2", "14.1"] },
    { "id": 11, "tasks": ["14.2", "14.3", "14.4", "14.5", "15.1"] },
    { "id": 12, "tasks": ["15.2", "15.3", "16.1"] },
    { "id": 13, "tasks": ["16.2", "16.3"] },
    { "id": 14, "tasks": ["16.4", "18.1", "18.2", "18.3"] },
    { "id": 15, "tasks": ["19.1"] },
    { "id": 16, "tasks": ["19.2"] },
    { "id": 17, "tasks": ["19.3"] }
  ]
}
```
