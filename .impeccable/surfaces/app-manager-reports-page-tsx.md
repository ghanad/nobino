---
version: 1
slug: "app-manager-reports-page-tsx"
primary_target: "app/manager/reports/page.tsx"
related_targets: ["app/manager/reports/report-ui.tsx","app/manager/reports/team-report-sections.tsx","app/manager/reports/user-report-sections.tsx","app/manager/reports/desk-report-sections.tsx"]
---

# Surface brief — /manager/reports

## Scope and mode

Manager reports route (team / user / desk consumption of approved reservation hours, week / month Jalali periods). Mode: Operate.

## Audience, job, action

- Audience: managers and admins (~5-6 users of this route).
- Job: pulse check on who consumed approved capacity, then detail lookup.
- Action: switch view/period/range via URL-driven link controls; read totals, ranked comparison, and the full details table. No mutations on this surface.

## Content and constraints

- Data comes only from the three report services (team/user/desk); derived presentation (share of total, per-member intensity, rank) is computed in the UI from those fields — no new queries, nothing fabricated.
- All visible dates are Jalali in natural Persian order; controls are links (shareable URLs), not client state.
- Identity is the app-wide "Quiet Service Desk" system; this surface changes composition only.

## Chosen direction

Split Cockpit (dealt 3 of 7, seed 7d97f391): a sticky control-and-totals rail on the RTL reading start (right) beside a pure report pane. Memorable moment: the staggered right-anchored bar growth in the ranked board (reduced-motion guarded).

- Rail: view segmented control (horizontal on mobile, vertical on desktop), period toggle, prominent Jalali range label with prev/today/next, ruled totals stack (per-view figures).
- Main pane: RankedBoard (rank, name, sub-line, hours, share of total, proportional bar) above the full details table; per-view empty states preserved.

## Unresolved decisions

- Mobile table relies on overflow-x-auto with no scroll affordance (reviewer observation, left as-is).
- Desk view is labeled «میزها» in controls but «افراد» in board/table headings — accurate to the per-person data; revisit only if product renames the service.
