---
version: 1
slug: "app-lunch-page-tsx"
primary_target: "app/lunch/page.tsx"
related_targets: ["app/lunch/lunch-reservation-list.tsx"]
---

## Scope and mode

- Primary target: `app/lunch/page.tsx`
- Related target: `app/lunch/lunch-reservation-list.tsx`
- Mode: Operate

## User job

Employees scan the upcoming Jalali service days, understand which days are actionable, and reserve or adjust breakfast, lunch, and pickup location with the fewest decisions possible.

## Direction

**Week on a line.** Upcoming days form one continuous office-wayfinding route. Each day is a station with an explicit semantic state; actionable days expose all familiar controls inline and require only the final submit action. Unavailable days explain why and omit unusable controls.

Keep the actionable cluster deliberately compact: independent meal choices, a visibly labeled pickup selector with building and chevron cues, then the single primary CTA. Selected meals use a quiet tint and border so the filled blue remains exclusive to the final action.

## Memorable moment

The nearest actionable day reads as the next stop on the route and presents meal, location, and confirmation as one uninterrupted horizontal action on desktop and one compact vertical action on mobile.

## Constraints

- Persian-first RTL composition and natural Jalali date labels.
- Preserve existing reservation behavior, server actions, permissions, and copy truth.
- Avoid drawers, dialogs, accordions, and staged flows for routine reservation.
- Present breakfast and lunch as independent, combinable choices; never as an either/or segmented control.
- Status must remain legible without relying on color alone.
- Compress unavailable and expired days into concise status rows without repeated cutoff details.
- Derive the “next reservation” summary from client state so create, update, and cancel results appear immediately.
- Require an explicit confirmation before canceling an existing reservation.
