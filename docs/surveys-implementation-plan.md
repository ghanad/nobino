# Nobino Surveys — phased implementation plan

Status: approved product direction; implementation has not started.

This document is intentionally written as a sequence of small, reviewable tasks. Give only one task at a time to an implementation model. Review and merge that task before starting the next one.

## 1. Product decisions

### Scope

- Surveys are internal. Only active authenticated Nobino users may participate.
- Supported use cases are satisfaction surveys, voting, and information collection.
- Administrators and users with an explicit `canCreateSurveys` permission may create surveys.
- A permitted creator may publish without administrator approval.
- A survey may have collaborators. Collaborators may edit a draft and see allowed results, but cannot publish, close, archive, change collaborators/audience, or send reminders.
- Results are visible only to administrators, the owner, and collaborators.
- Survey dates and date inputs are Persian/Jalali. Do not introduce a browser-native Gregorian date picker.
- There are no public links, file uploads, quizzes, scoring, or external respondents.

### Survey kinds

- `SATISFACTION`: authorized result viewers may see results while the survey is active.
- `DATA_COLLECTION`: authorized result viewers may see results while the survey is active.
- `VOTE`: nobody, including administrators and the owner, may see answers, aggregates, or exports until the survey is closed or its end time has passed. Only the participation count is visible before then.

All three kinds use one survey engine. They are not separate implementations.

### Identity modes

- `NAMED`: each submitted response is linked to the responding user.
- `ANONYMOUS`: Nobino records that an eligible user has submitted, but the response has no user relation or shared identifier with the recipient record.
- An anonymous recipient record stores only a `hasSubmitted` boolean. Do not store a completion timestamp there, because it could be correlated with the response timestamp.
- Anonymous publish requires at least 5 eligible recipients.
- Anonymous results and exports remain unavailable until at least 5 responses exist, even after closing. This is a privacy rule, not a UI preference.
- Anonymous result screens and exports must omit user IDs, names, emails, response IDs, exact submission times, and response ordering by submission time.
- Do not log response bodies, draft bodies, user-to-response mappings, or submitted answer payloads. An anonymous final submission must not create an actor-linked audit row, because its timestamp could be correlated with `SurveyResponse.submittedAt`.
- Free-text answers can reveal identity through their content. Show this warning to anonymous respondents.

This provides application-level anonymity. Database/server administrators may still infer identity from infrastructure logs or operational timing; do not describe the feature as cryptographically anonymous.

### Audience

A draft supports exactly one of these modes:

- all active users;
- targeted: the union of selected existing Nobino teams and selected individual users.

At publication, resolve the audience to active, non-deleted users and write an immutable recipient snapshot. Later team membership or user creation must not change the audience. Duplicate users from overlapping teams are included once.

### Lifecycle

Persist only `DRAFT`, `PUBLISHED`, `CLOSED`, and `ARCHIVED`.

Derive display state as follows so no scheduler is needed:

- `DRAFT`: persisted state is `DRAFT`;
- `SCHEDULED`: persisted state is `PUBLISHED` and now is before `startsAt`;
- `ACTIVE`: persisted state is `PUBLISHED` and `startsAt <= now < endsAt`;
- `ENDED`: persisted state is `PUBLISHED` and now is at or after `endsAt`, or persisted state is `CLOSED`;
- `ARCHIVED`: persisted state is `ARCHIVED`.

Rules:

- Responses are accepted only while derived state is `ACTIVE`.
- Publishing is irreversible in MVP.
- Questions, choices, branching, identity mode, kind, and audience are immutable after publication.
- The end time may be extended only while the survey is still active. An ended or manually closed survey cannot be reopened.
- A survey can be closed early by its owner or an administrator.
- Only ended/closed surveys may be archived.
- Only drafts may be deleted.

### Responses

- Question types in MVP: short text, long text, single choice, multiple choice, and numeric rating.
- Rating range is configurable from 1–5 through 0–10, with optional endpoint labels.
- A multiple-choice question may have an optional maximum selection count.
- A question can be required or optional.
- Choice order randomization is configured per choice question by the survey designer.
- Randomized order must be deterministic for the same survey, question, and recipient so it does not jump between renders.
- MVP branching supports at most one visibility condition per target question: a selected option in an earlier single-choice or multiple-choice question `IS_SELECTED` or `IS_NOT_SELECTED`.
- A hidden required question is not required. The server must compute visibility itself and reject answers submitted for hidden questions.
- A final response is immutable. MVP does not include response reset/resubmission.
- Draft answers are stored server-side and remain linked to the user. On anonymous final submission, create an unlinked response and delete the linked draft in the same transaction.

### Messages and reminders

- Publishing creates a Nobino notification for every recipient. Existing Bale notification delivery then delivers it to linked Bale accounts.
- Messages link directly to the survey inside Nobino.
- MVP reminders are manual and can be sent only while a survey is active.
- Reminder generation happens on the server for recipients with `hasSubmitted = false`; the owner never receives a list of non-respondents for an anonymous survey.
- Every invitation/reminder batch is audited with its recipient count.
- Automatic scheduled reminders are a post-MVP task.

### Raw Excel export

- Export is a real `.xlsx` file, not HTML renamed to `.xls`.
- Use one row per final response and one column per question, in designer-defined question order.
- Multiple choices are joined in one cell with a documented separator.
- Named export includes respondent name and email plus a Jalali submission date/time.
- Anonymous export excludes all identity and timing columns. It must not expose internal IDs and must not order rows by submission time.
- Vote export obeys the result embargo. Anonymous export obeys the minimum-five-response rule.

## 2. Proposed data model

Exact Prisma relation names may be adjusted to satisfy Prisma, but the separation and privacy properties below must remain.

### Enums

- `SurveyKind`: `SATISFACTION`, `VOTE`, `DATA_COLLECTION`
- `SurveyState`: `DRAFT`, `PUBLISHED`, `CLOSED`, `ARCHIVED`
- `SurveyIdentityMode`: `NAMED`, `ANONYMOUS`
- `SurveyAudienceMode`: `ALL_ACTIVE`, `TARGETED`
- `SurveyQuestionType`: `SHORT_TEXT`, `LONG_TEXT`, `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `RATING`
- `SurveyConditionOperator`: `IS_SELECTED`, `IS_NOT_SELECTED`

### Authoring models

- `Survey`: metadata, kind, state, identity mode, audience mode, nullable `startsAt`/`endsAt` while draft, owner, lifecycle timestamps, created/updated timestamps.
- `SurveyCollaborator`: unique `(surveyId, userId)`.
- `SurveyAudienceTeam`: draft team selection, unique `(surveyId, teamId)`.
- `SurveyAudienceUser`: draft individual selection, unique `(surveyId, userId)`.
- `SurveyQuestion`: prompt, optional help text, type, required flag, sort order, `randomizeOptions`, nullable rating configuration, nullable `maxSelections`.
- `SurveyOption`: label and sort order.
- `SurveyQuestionCondition`: unique target question, source question, source option, and operator.

### Participation models

- `SurveyRecipient`: unique `(surveyId, userId)`, `hasSubmitted`, invitation/reminder counters or timestamps. This is the immutable publication audience snapshot. Do not add `responseId` or an anonymous completion timestamp.
- `SurveyDraft`: unique `(surveyId, userId)`, validated JSON answer payload, updated timestamp.
- `SurveyResponse`: survey relation, nullable user relation, and submission timestamp. `userId` must always be set for named surveys and always be null for anonymous surveys. Duplicate prevention is driven by an atomic conditional update of `SurveyRecipient.hasSubmitted`, not by adding an identity-bearing key to anonymous responses.
- `SurveyAnswer`: response, question, nullable text value, nullable numeric value; unique `(responseId, questionId)`.
- `SurveyAnswerOption`: selected options for choice answers; unique `(answerId, optionId)`.

Add an optional `surveyId` relation to the existing `Notification` model so in-app and Bale notifications can build a safe survey action link without putting internal IDs into arbitrary text.

## 3. Permission matrix

| Action | Admin | Owner with permission | Collaborator | Recipient |
| --- | --- | --- | --- | --- |
| Create survey | Yes | Yes | No | No |
| Edit draft content | Yes | Yes | Yes | No |
| Change audience/collaborators | Yes | Yes | No | No |
| Publish/close/archive/delete draft | Yes | Yes | No | No |
| Send reminder | Yes | Yes | No | No |
| View allowed results/export | Yes | Yes | Yes | No |
| Save draft response | If recipient | If recipient | If recipient | Yes |
| Submit response | If recipient | If recipient | If recipient | Yes |

The server service is authoritative. Hiding a button is not permission enforcement. Every server action and route handler must re-check active user, role/permission, ownership/collaboration, survey state, and recipient eligibility as appropriate.

## 4. Instructions for every implementation task

Copy the selected task plus this section into the implementation prompt.

1. Read `/Users/ali/codes/nobino/AGENTS.md` and all referenced instructions before editing.
2. Inspect the current working tree and preserve unrelated changes.
3. Implement only the selected task. Do not start later tasks or perform broad refactors.
4. For Next.js work, read the relevant local Next 16 guides under `node_modules/next/dist/docs/` before coding. At minimum, UI/server-action work should inspect the App Router pages/layouts, server/client components, mutating-data, error-handling, and route-handler guides relevant to the task.
5. Keep business rules and authorization in `lib/*` services. UI code may call services but must not become the source of truth.
6. Validate untrusted server input with Zod at the action/route boundary and validate business invariants again in the service.
7. Use Persian user-facing copy and existing UI patterns. All visible dates, inputs, and URL date parameters must remain Jalali.
8. Use a real Prisma migration for schema changes. Do not use `prisma db push` as the deliverable migration.
9. Extend `tests/survey-business-rules.test.ts` for service behavior and import it from `tests/business-rules.test.ts`. Update `tests/business-rules-helpers.ts` cleanup in foreign-key-safe order when models are added.
10. Do not add dependencies unless the selected task explicitly authorizes one.
11. Run `npm run typecheck`, `npm run test`, and `npm run build` before handing off. If a command cannot run, report the exact reason; do not claim success.
12. Report files changed, commands run, manual test steps, and known limitations. Do not edit the checkboxes in this plan; the reviewer owns task status.

## 5. Task overview and review gates

| ID | Task | Depends on | Review gate |
| --- | --- | --- | --- |
| S01 | Creator permission flag | — | A |
| S02 | Authoring schema | S01 | A |
| S03 | Participation and notification schema | S02 | A |
| S04 | Status and permission helpers | S03 | A |
| S05 | Survey metadata service | S04 | B |
| S06 | Collaborator service | S05 | B |
| S07 | Audience service | S05 | B |
| S08 | Question and option service | S05 | B |
| S09 | Branching and option randomization service | S08 | B |
| S10 | Publication and lifecycle service | S06–S09 | B |
| S11 | Survey navigation and list pages | S05 | C |
| S12 | Metadata editor | S11 | C |
| S13 | Collaborator and audience editor | S06, S07, S12 | C |
| S14 | Basic question builder | S08, S12 | C |
| S15 | Choice/rating settings and reordering | S14 | C |
| S16 | Branching/randomization controls | S09, S15 | C |
| S17 | Preview and lifecycle controls | S10, S16 | C |
| S18 | Recipient query service and pages | S10, S11 | D |
| S19 | Response renderer and visibility engine | S18 | D |
| S20 | Server-side response drafts | S19 | D |
| S21 | Named final submission | S20 | D |
| S22 | Anonymous final submission | S21 | D |
| S23 | Completion and access hardening | S22 | D |
| S24 | Results query service and privacy embargoes | S22 | E |
| S25 | Results UI | S24 | E |
| S26 | Raw `.xlsx` export | S24 | E |
| S27 | Invitation notification integration | S10, S18 | F |
| S28 | Manual reminders | S22, S27 | F |
| S29 | End-to-end hardening and documentation | S23, S25–S28 | F / MVP |

Stop for review after every individual task. Gates indicate useful points for a broader architectural review.

## 6. Detailed implementation tasks

### S01 — Add explicit survey-creator permission

Objective: allow administrators to grant survey creation without changing a user's role.

Work:

- Add `User.canCreateSurveys Boolean @default(false)` with a migration.
- Include it in `CurrentUser` and session user selection.
- Add `canCreateSurvey(user)` to `lib/permissions.ts`; administrators always pass, other active users require the flag.
- Add the checkbox to the existing admin user edit page/action/service.
- Include old/new permission values in the existing user audit record.
- Extend user-management and permission tests.

Acceptance:

- Admin passes even when the flag is false.
- Manager/user passes only when the flag is true.
- An admin can toggle the flag and the audit log records it.
- No survey tables or pages are added yet.

### S02 — Add survey authoring schema

Objective: create only the database structures needed to design a draft.

Work:

- Add the authoring enums/models from section 2: `Survey`, collaborators, draft audience team/user selections, questions, options, and one condition per target question.
- Add explicit cascade/restrict behavior. Deleting a draft survey may cascade through its authoring rows. Deleting users/teams with survey references must not accidentally delete a published survey.
- Add indexes for owner/state, survey question order, option order, and collaborator lookup.
- Create a migration.
- Update test database cleanup and add a small schema relationship test.

Acceptance:

- Prisma generates and all checks pass.
- Duplicate collaborators/audience selections and duplicate sort positions are handled intentionally. If sort order is not database-unique, the future service will normalize it transactionally.
- No response/recipient tables are added in this task.

### S03 — Add participation, answer, draft, and notification schema

Objective: add response storage while preserving the anonymous separation.

Work:

- Add `SurveyRecipient`, `SurveyDraft`, `SurveyResponse`, `SurveyAnswer`, and `SurveyAnswerOption` as described in section 2.
- Add optional `Notification.surveyId` and its relation/index.
- Ensure a recipient has no response relation and no completion timestamp; only `hasSubmitted` may describe completion.
- Create a migration and update foreign-key-safe test cleanup.
- Add schema tests proving one recipient per survey/user and one answer per response/question.

Acceptance:

- The schema cannot directly join an anonymous response to a recipient.
- A named response can store a user ID; an anonymous response can store null. Enforcement of correct mode belongs to the service tasks.
- Existing reservation/Bale notification tests still pass.

### S04 — Add survey status and permission helpers

Objective: centralize status and authorization decisions before CRUD services exist.

Likely files: `lib/survey-status.ts`, `lib/survey-permissions.ts`, `tests/survey-business-rules.test.ts`.

Work:

- Implement a pure derived-state helper using an injected `now` value.
- Implement pure permission helpers for create, edit draft, manage audience/collaborators, lifecycle actions, reminders, results, and participation.
- Keep these helpers free of React and redirects.
- Cover boundary instants (`startsAt`, one millisecond before `endsAt`, exactly `endsAt`) and the matrix in section 3.

Acceptance:

- Exactly-at-start is active; exactly-at-end is ended.
- Collaborators can edit drafts and view allowed results but cannot publish or manage access.
- Helpers are deterministic and extensively unit tested.

### S05 — Implement survey metadata service

Objective: create, update, list, and delete draft survey metadata securely.

Likely file: `lib/survey-service/metadata.ts` with a small shared module and barrel only if useful.

Work:

- Create a draft with title, description, kind, identity mode, and default audience mode.
- Update draft metadata and Jalali-boundary-converted start/end instants.
- List surveys visible to a user: all for admin; owned/collaborating plus recipient surveys as appropriate for others. Keep authoring and respondent queries distinguishable.
- Delete only a draft, only as admin/owner, with an audit log.
- Validate title/description lengths and `endsAt > startsAt` when both exist.
- Audit create, material update, and delete without storing answer data.

Acceptance:

- A user without creator permission cannot create even if calling the service directly.
- A collaborator cannot change identity mode/kind through metadata service.
- Published content cannot be edited through this service.
- Tests cover unauthorized IDs and inactive users, not just happy paths.

### S06 — Implement collaborator service

Objective: allow owner/admin to manage edit/result collaborators.

Work:

- Add/remove active, non-deleted users as collaborators.
- Reject owner-as-collaborator and duplicates.
- Only admin/owner may manage collaborators; a collaborator cannot grant access.
- Allow collaborator changes after publication because they control result access, but audit every addition/removal with target user ID/name/email.

Acceptance:

- A collaborator can subsequently pass draft-edit/result permission checks.
- Removed collaborators immediately lose access.
- No notification is required yet.

### S07 — Implement draft audience service

Objective: configure all-active or targeted audience before publication.

Work:

- Set audience mode.
- In targeted mode, add/remove existing teams and active individual users.
- Provide a preview query returning the deduplicated active audience and counts by source.
- Only owner/admin may change audience and only while draft.
- Do not create `SurveyRecipient` rows yet.
- Audit audience changes using IDs/counts; avoid oversized snapshots in audit JSON.

Acceptance:

- Overlapping teams and explicit users deduplicate correctly.
- Inactive/deleted users are excluded from preview.
- Targeted audience with no effective users is represented clearly and will be rejected at publication.

### S08 — Implement question and option service

Objective: CRUD and reorder MVP questions/options in a draft.

Work:

- Add/update/delete/reorder questions transactionally.
- Add/update/delete/reorder options for single/multiple choice.
- Validate type-specific configuration: choices have at least two non-empty unique labels before publish; rating bounds are integers with `0 <= min < max <= 10`; `maxSelections` is valid; non-choice types cannot retain options/randomization.
- When deleting a source question/option, handle dependent conditions explicitly and audit the cleanup.
- Normalize contiguous sort order after insert/delete/move.
- Only admin/owner/collaborator may edit; only draft surveys may change.

Acceptance:

- Reordering cannot lose or duplicate questions/options.
- Cross-survey IDs are rejected.
- Service tests cover every question type and invalid configuration.

### S09 — Implement branching and deterministic option ordering

Objective: support one safe conditional rule and optional choice shuffling.

Work:

- Create/replace/remove the single condition for a target question.
- Source must belong to the same survey, be earlier than target, be single/multiple choice, and reference one of its own options.
- Prevent self-reference and cycles; the “source must be earlier” invariant should make cycles impossible.
- Implement a pure deterministic ordering helper seeded from survey ID, question ID, and recipient user ID. Do not use unstable `Math.random()` during render.
- Add/update the per-question `randomizeOptions` setting through the service.

Acceptance:

- Same seed produces the same order; different users can receive different orders.
- With randomization disabled, designer sort order is preserved.
- Invalid cross-survey and later-question rules fail.

### S10 — Implement publication, extension, close, and archive

Objective: make lifecycle transitions atomic and business-rule complete.

Work:

- In one transaction, re-read the actor and survey, validate complete metadata/questions/conditions, resolve current active audience, create deduplicated `SurveyRecipient` snapshot rows, set state to `PUBLISHED`, and audit.
- Require start/end, at least one question, at least one recipient, and all type-specific validation.
- Require at least five recipients for anonymous surveys.
- Add active-only end-time extension, early close, and ended/closed-only archive.
- Owner/admin only. No approval workflow.
- Do not send notifications yet; S27 adds them without weakening the transaction rules.

Acceptance:

- Team/user changes after publish do not alter recipients.
- Concurrent/double publish cannot create duplicate recipients or partially publish.
- Published question/audience/identity content is immutable.
- Ended/closed surveys cannot reopen.

### S11 — Add survey navigation and list pages

Objective: introduce discoverable, permission-aware survey entry points without an editor yet.

Work:

- Add `/surveys` to desktop and mobile navigation for every authenticated user.
- Show “available to answer,” “completed,” and “created/collaborating” sections as applicable.
- Add a create button only when `canCreateSurvey` passes.
- Use derived Persian status labels and Jalali date formatting.
- Use server-side queries; do not expose other users or anonymous completion state.

Acceptance:

- A normal user sees only recipient-relevant surveys.
- Admin/creator sees management entries without leaking answer data.
- Empty, loading-equivalent server state, and ended states have clear Persian copy.

### S12 — Add create and metadata editor UI

Objective: create/edit the survey shell using existing Nobino patterns.

Work:

- Add `/surveys/new` and an owner/admin/collaborator draft editor route.
- Use server actions with Zod for title, description, kind, identity mode, start, and end.
- Use the existing Jalali date picker and explicit time inputs; convert only at the server boundary.
- Explain the behavioral difference between named/anonymous and the vote embargo in Persian.
- Only owner/admin may change kind/identity. Collaborators may edit title/description/schedule while draft.

Acceptance:

- No Gregorian date input or visible Gregorian label appears.
- Direct POST/action calls receive the same authorization as the page.
- Validation errors preserve useful user input where practical.

### S13 — Add collaborator and audience editor UI

Objective: configure access and recipients without exposing forbidden controls.

Work:

- Add searchable active-user collaborator selection for owner/admin.
- Add audience mode, team multi-selection, individual-user selection, deduplicated preview count, and a small source summary.
- Warn that the list is frozen at publication.
- In anonymous mode, warn when preview count is below five.
- Collaborators may see the configured draft audience but cannot mutate it.

Acceptance:

- UI state reloads from the database after actions.
- Overlapping selections do not inflate preview count.
- No client-only permission assumption.

### S14 — Add basic question builder UI

Objective: author short text, long text, single choice, multiple choice, and rating questions.

Work:

- Render question cards in designer order.
- Add question, edit prompt/help text/required, change type safely, and delete with confirmation.
- Use small server actions backed by S08; avoid one giant untyped JSON action.
- Show a clear draft-only state if survey is no longer editable.

Acceptance:

- Keyboard users can operate all controls.
- Persian labels clearly distinguish short/long text and single/multiple choice.
- Deleting or changing type cannot leave invalid options/conditions.

### S15 — Add choice/rating settings and reorder controls

Objective: finish type-specific question authoring.

Work:

- Add/edit/delete/reorder choice options.
- Configure rating minimum/maximum and endpoint labels.
- Configure optional maximum selection count for multiple choice.
- Add accessible question and option move-up/move-down controls. Drag-and-drop is not required.
- Display publish-blocking validation next to the relevant question.

Acceptance:

- Reordering persists across reload.
- Duplicate/blank choices and invalid rating bounds are rejected server-side.
- Mobile layout remains usable.

### S16 — Add branching and randomization controls

Objective: expose S09 without creating a general logic-builder.

Work:

- Let the designer choose “always show” or one earlier choice question + option + selected/not-selected condition.
- Let the designer enable option randomization per choice question.
- Explain that randomization affects respondents, not designer order or result columns.
- Filter the UI to valid earlier source questions/options, while retaining service validation.

Acceptance:

- Invalid/stale rules show a repairable error rather than crashing.
- A collaborator can edit these draft controls; owner/admin restrictions remain enforced by service.

### S17 — Add preview and lifecycle controls

Objective: let authorized users safely preview and publish.

Work:

- Add respondent-style preview that never creates drafts/responses.
- Add a publication readiness summary: schedule, audience count, anonymity rule, question errors, branching errors.
- Add publish, active-only end extension, early close, archive, and draft delete controls with explicit confirmations.
- Display immutable-after-publish warning before confirmation.

Acceptance:

- UI cannot bypass S10 readiness checks.
- Vote result embargo and anonymous threshold are stated before publish.
- Published survey routes no longer show editable question controls.

### S18 — Add recipient query service and response pages

Objective: authorize access to a survey without accepting answers yet.

Work:

- Add recipient-facing query functions that require an active user and an exact `SurveyRecipient` row.
- Add `/surveys/[surveyId]` with scheduled, active, completed, and ended states.
- Do not reveal the total recipient list. Participation count may be shown to authorized managers, not ordinary recipients unless product copy needs it.
- Display identity mode and anonymous free-text warning.

Acceptance:

- Guessing a survey ID cannot reveal title/questions to non-recipients unless the user has management access.
- Inactive, scheduled, ended, and already-submitted states cannot reach an enabled response form.

### S19 — Add response renderer and server visibility engine

Objective: render answer inputs and calculate branching identically on client/server.

Work:

- Create shared pure answer parsing and visibility functions with no database/React dependency.
- Render all MVP question types with stable field identifiers and deterministic option order.
- Recompute visible questions as choices change.
- Apply required indicators only to currently visible questions.
- Add unit tests for branching, hidden required fields, randomized ordering, and malformed payloads.

Acceptance:

- Client behavior is convenience only; later submission service can independently recompute everything.
- Changing a source answer clears or excludes answers that became hidden.
- RTL, keyboard, and mobile behavior are usable.

### S20 — Add server-side response drafts

Objective: allow a recipient to leave and continue later.

Work:

- Implement load/upsert/delete draft service methods with recipient and active-window checks.
- Validate and size-limit JSON; accept incomplete answers but reject unknown survey/question/option IDs and wrong value types.
- Add debounced server-side autosave or a small authenticated route handler. Show `در حال ذخیره`, `ذخیره شد`, and failure states.
- Do not log draft content.
- For now, drafts remain inaccessible after the response window ends.

Acceptance:

- A user cannot read/write another user's draft.
- Draft survives reload.
- Already-submitted recipients cannot write another draft.
- Anonymous drafts are still user-linked and the UI explains that anonymity begins at final submission.

### S21 — Implement named final submission

Objective: atomically validate and store an immutable named response.

Work:

- In one transaction, re-read actor, survey, questions/options/conditions, and recipient.
- Require active state and `hasSubmitted = false`.
- Recompute visibility; validate required/type/rating/max-selection rules; reject hidden, unknown, or cross-survey answers.
- Claim submission first with a conditional `SurveyRecipient.updateMany` matching `hasSubmitted = false` and require `count === 1`; then create the response with `userId`, normalized answers/options, delete the draft, and create a content-free audit event. All writes stay in the same transaction, so later failure rolls back the claim.
- Do not include answers in audit JSON.

Acceptance:

- Double/concurrent submit yields exactly one final response.
- Failed validation writes nothing.
- Final response cannot be edited through any service.

### S22 — Implement anonymous final submission

Objective: extend final submission without creating an identity link.

Work:

- Reuse the S21 validation pipeline; do not fork duplicate business logic.
- Reuse the same conditional recipient claim from S21, then create the response with `userId = null` in the same transaction.
- Store only recipient `hasSubmitted = true`; do not store the completion instant on recipient.
- Delete the linked draft in the same transaction.
- Do not create an individual audit row for anonymous submission. An actor-linked audit timestamp could be joined heuristically to the response timestamp. Publication, closure, reminder batches, and other management actions remain audited.
- Add explicit privacy tests that inspect stored rows and audit JSON.

Acceptance:

- No response row, answer row, audit row, or notification contains both anonymous response identity and respondent identity.
- Concurrent submit creates one anonymous response and one participation marker.
- Normal application queries cannot map an anonymous response to a recipient.

### S23 — Add completion UI and access hardening

Objective: finish the participant flow and adversarially test it.

Work:

- Add final confirmation before immutable submission and Persian success state after it.
- Disable accidental double submit and handle server conflict cleanly.
- Add tests for guessed IDs, inactive users, schedule boundaries, altered form fields, cross-survey option IDs, hidden answers, oversized text, and already-completed recipients.
- Ensure pages/actions do not disclose whether a guessed survey exists when access is denied.

Acceptance:

- Manual flow works on mobile and desktop for all MVP question types.
- Security failures are generic to users and specific enough in server-side typed errors/tests.

### S24 — Implement result queries and embargo/privacy rules

Objective: provide one authoritative result read service before building UI/export.

Work:

- Authorize admin, owner, or current collaborator.
- Return participation totals without returning recipient identities for anonymous surveys.
- For votes, return an embargo result with counts only until ended/closed.
- For anonymous surveys with fewer than five final responses, return a privacy-threshold result with counts only.
- For allowed results, aggregate choice/rating values and return individual text answers without IDs/timestamps for anonymous surveys.
- Do not order anonymous text answers by submission time; use a stable non-time-correlated ordering.

Acceptance:

- UI and export can consume the same permission/embargo decision.
- Collaborator removal immediately blocks results.
- Tests cover admin too; admin does not bypass vote or anonymity embargoes.

### S25 — Add results UI

Objective: show useful management results without adding export yet.

Work:

- Add management result route with total recipients, submitted count, response rate, and status.
- Show counts/percentages for choices, rating distribution/average, and raw text answers.
- Show clear vote embargo and anonymous-minimum states instead of empty charts.
- Named results may show respondent identity per response; anonymous results never show identity, timestamp, response ID, or respondent ordering.
- Use Persian numerals/labels and Jalali dates.

Acceptance:

- Refresh during active satisfaction/data survey shows current allowed data.
- Vote content is hidden before end for every role.
- Small anonymous response sets remain hidden for every role.

### S26 — Add raw `.xlsx` export

Objective: export authorized raw results using the same S24 gates.

Work:

- Add one maintained `.xlsx` generation dependency and lock it in `package-lock.json`; do not add multiple spreadsheet libraries.
- Implement server-only workbook generation and an authenticated route handler.
- Use safe filenames and worksheet/cell values. Prevent spreadsheet formula injection by escaping text beginning with `=`, `+`, `-`, or `@`.
- Named columns: respondent name, email, Jalali submission time, then questions.
- Anonymous columns: questions only (an optional non-identifying sequential row number is acceptable). Do not sort by submission time.
- Include a small legend sheet for survey title, kind, identity mode, Jalali export time, and the multi-choice separator. Do not include anonymous recipient identities.

Acceptance:

- The downloaded file opens as `.xlsx` and Persian text is intact.
- Export calls S24 authorization/embargo logic rather than copying it.
- Tests cover formula injection, multi-choice cells, vote embargo, anonymous threshold, and forbidden user.

### S27 — Integrate survey invitation notifications and Bale links

Objective: invite frozen recipients through existing Nobino notifications and Bale delivery.

Work:

- Extend notification display/action handling for `SURVEY_INVITATION` and its `surveyId` relation.
- Build the in-app action as `/surveys/{id}`.
- Extend Bale message building to append an absolute URL derived from validated `APP_BASE_URL`; do not trust a URL from form input.
- Update S10 publication transaction to create one invitation notification per frozen recipient exactly once.
- Include Jalali start/end text in the invitation without exposing audience identities.
- Audit publication/invitation count. Do not directly call Bale HTTP inside the publication transaction; existing pending delivery handles it.

Acceptance:

- Publishing 50 recipients creates 50 notifications and remains idempotent on repeated requests.
- Linked Bale users receive a direct internal link when the existing sync runs; unlinked users still see in-app notification.
- Existing notification filters/cards and Bale retry tests remain valid.

### S28 — Add manual reminders

Objective: let owner/admin remind only recipients who have not submitted.

Work:

- Implement an active-survey-only reminder service that selects snapshot recipients with `hasSubmitted = false` and creates `SURVEY_REMINDER` notifications.
- Prevent rapid accidental duplicate batches with a documented cooldown (recommended: 15 minutes), enforced transactionally.
- Return aggregate counts: eligible non-respondents, notifications created, and recipients without an active Bale link if useful. Never return the non-respondent identity list for anonymous surveys.
- Add an owner/admin-only button with confirmation and last-reminder Jalali timestamp.
- Audit actor, survey, count, and batch time without identities.

Acceptance:

- Submitted users never receive reminders.
- Collaborators cannot send reminders.
- Repeated/concurrent clicks within cooldown do not duplicate notifications.
- Existing Bale delivery sends reminder links without new direct HTTP code.

### S29 — End-to-end hardening, operational docs, and MVP sign-off

Objective: close integration gaps without adding features.

Work:

- Add end-to-end business tests for one named satisfaction survey, one anonymous data survey, and one vote from draft through export/reminders.
- Review every survey action/route for server-side auth, Zod boundary validation, CSRF assumptions consistent with the existing app, payload limits, and generic access-denied behavior.
- Review anonymous SQL relations/audits/notifications and verify no identity bridge exists.
- Verify all survey-visible dates/inputs/URL date params are Jalali and naturally ordered in Persian.
- Verify responsive RTL layout, keyboard navigation, labels, focus states, empty/error/loading-equivalent states, and confirmation copy.
- Update `README.md` with routes, creator permission, lifecycle, privacy limitations, Bale behavior, migration/setup notes, and operational troubleshooting.
- Run all required checks and document a manual QA script.

Acceptance:

- `npm run typecheck`, `npm run test`, and `npm run build` pass from a clean checkout with the migration applied.
- Manual QA demonstrates publish, invite, autosave, submit, reminders, result embargo, privacy threshold, and Excel download.
- MVP contains no public links, uploads, quiz scoring, matrix questions, scheduled reminders, or response reset.

## 7. Post-MVP tasks — do not mix into MVP

### P01 — Automatic reminders

- Add explicit per-survey reminder configuration, such as one reminder at a chosen offset before end.
- Add an authenticated internal sync route following existing auto-accept/Bale operational patterns.
- Make delivery idempotent with a durable batch key, not only timestamps.
- Preserve the anonymous non-respondent privacy rule.

### P02 — Matrix questions

- Add matrix rows and shared scale columns as normalized models.
- Extend branching only after deciding whether a matrix answer may be a condition source.
- Update response validation, renderer, aggregates, and Excel together; do not ship storage without full read/write/export support.

### P03 — Named response reset/resubmission

- Owner/admin may invalidate a named response and allow a new attempt.
- Preserve immutable attempt history and audit the reset without copying answers into audit JSON.
- Never add this feature to anonymous surveys.

### P04 — Saved audience presets

- Add only if existing teams are insufficient in real use. Do not duplicate the Team feature by default.

### P05 — Result sharing and participant-visible results

- Requires a separate product/security decision. Default remains private to admin/owner/collaborators.

## 8. Review checklist for each handoff

Use this checklist when asking a stronger model to review an implementation task:

- Did the implementation stay inside the selected task?
- Are authorization and business rules enforced in a reusable server service?
- Are IDs reloaded and ownership/survey membership checked, rather than trusted from the client?
- Do transactions cover every multi-write invariant and concurrency case?
- Did schema changes include a safe migration and foreign-key-safe test cleanup?
- Are anonymous recipient and response data still unlinkable by application relations/timestamps/audit JSON?
- Are vote and minimum-five embargoes applied to every read path, including export?
- Are all visible dates and inputs Jalali with Persian copy?
- Are existing notification/Bale behavior and unrelated features preserved?
- Are tests adversarial as well as happy-path?
- Did typecheck, full business tests, and production build actually pass?

Recommended review request:

> Review task SXX against `docs/surveys-implementation-plan.md` and `AGENTS.md`. Do not implement unrelated later tasks. First report correctness, security/privacy, concurrency, migration, and test gaps with file/line references. If I explicitly ask for fixes, make only the fixes needed for SXX and run the required checks.
