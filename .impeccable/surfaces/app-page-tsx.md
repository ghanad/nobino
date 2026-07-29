---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: []
---

# Nobino Home Service Gateway

## Scope and mode

- Primary target: `app/page.tsx` (`/`)
- Visitor mode: Operate
- Scope: authenticated home gateway only; global application shell and downstream reservation workflows remain unchanged

## Audience and job

- Employees at the firm who need to enter the correct reservation workflow quickly
- Primary task: distinguish food, company-system, meeting-room, and desk reservations, then navigate with one action

## Content and constraints

- Preserve the four existing service names, descriptions, icons, destinations, and Persian RTL behavior
- Preserve `AppShell`, navigation, authentication behavior, and role-aware global controls
- Do not add marketing claims, synthetic metrics, current-status data, or capabilities not already present

## Chosen direction

- A compact service wayfinding board: a decisive introductory field followed by four numbered route rows
- The rows use Nobino's existing blue/slate palette, IRANSansX, borders, tonal surfaces, and familiar links
- Hierarchy comes from route numbering, icon silhouette, title/description pairing, and a strong directional affordance

## Memorable moment

- Hovering or focusing a service route advances its arrow and reveals a restrained blue edge signal, making the page feel like a live directory without becoming decorative

## Unresolved decisions

- None; keep the redesign page-scoped unless future work explicitly extends it to other gateways
