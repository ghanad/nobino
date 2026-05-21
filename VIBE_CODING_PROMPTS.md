# VIBE_CODING_PROMPTS.md

Use these prompts when working with a coding LLM.

---

## Initial repository prompt

```text
We are building a small internal capacity-based reservation web application.

Read AGENTS.md, PROJECT_BRIEF.md, and PHASES.md.

Important product rules:
- All systems are identical.
- Model this as a resource pool with configurable capacity.
- Pending reservations are visible but do not consume capacity.
- Approved reservations consume capacity.
- A reservation is final only after manager approval.
- Reservations are hourly.
- A reservation cannot span multiple days.
- Working days and working hours are configurable.
- Do not implement check-in, check-out, no-show, penalties, quotas, or physical device assignment.

Start with Phase 0 only.
After implementation, report:
1. summary of changes
2. files changed
3. commands to run
4. manual test steps
5. known limitations
```

---

## Per-phase implementation prompt

```text
Read AGENTS.md, PROJECT_BRIEF.md, and PHASES.md.

Implement Phase <NUMBER> only.

Do not implement later phases.
Do not add out-of-scope features.
Keep the implementation simple and suitable for a small internal app with around 50 users.

After finishing, provide:
1. summary of changes
2. files changed
3. commands to run
4. manual test steps
5. known limitations
```

---

## Bug-fix prompt

```text
We are building the internal system reservation app described in AGENTS.md and PHASES.md.

Bug:
<PASTE BUG HERE>

Expected behavior:
<PASTE EXPECTED BEHAVIOR HERE>

Please:
1. identify the likely cause
2. make the smallest safe fix
3. avoid changing unrelated behavior
4. explain the files changed
5. provide manual test steps
```

---

## Review prompt after each phase

```text
Review the current implementation against AGENTS.md and the acceptance criteria for Phase <NUMBER> in PHASES.md.

Do not write new features yet.

Report:
1. what matches the acceptance criteria
2. what is missing
3. risky implementation details
4. security or data integrity concerns
5. exact recommended fixes
```

---

## Capacity logic test prompt

```text
Focus only on reservation capacity logic.

Verify these rules:
1. Pending reservations do not consume capacity.
2. Approved reservations consume capacity.
3. Approval fails if any requested hourly slot is full.
4. Approval capacity check happens server-side.
5. Approval capacity check is protected against race conditions as much as practical with the current stack.

Add or improve tests if needed.

Do not change UI unless required.
```

---

## Schedule logic test prompt

```text
Focus only on working schedule validation.

Verify these rules:
1. Reservation must be inside working hours.
2. Reservation must be on exact hourly boundaries.
3. Reservation cannot span multiple calendar days.
4. Date-specific schedule exceptions override weekly schedule.
5. Disabled days reject reservations.

Add or improve tests if needed.

Do not change unrelated code.
```

---

## UI simplification prompt

```text
Simplify the UI for real internal use.

The app is for around 50 company users and 5–6 identical systems.

Prioritize:
- clear daily calendar
- visible approved/pending counts
- simple reservation form
- clear manager approval queue
- clear error messages

Avoid:
- complex animations
- unnecessary dashboards
- over-designed components
- features not listed in PHASES.md
```

---

## Production readiness prompt

```text
Prepare this small internal app for first real use.

Check:
- environment variables
- database migration/seed instructions
- admin account setup
- session security
- role checks
- server-side validation
- production build
- PostgreSQL backup note
- deployment steps

Do not add new product features.
Only harden and document what exists.
```
