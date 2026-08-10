# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Nobino serves the approximately 40–60 employees of a single firm. Employees use it during their normal workday to reserve shared workplace resources and services.

Managers review reservation requests and oversee operational reservations. Administrators maintain users, schedules, capacities, policies, and other firm-wide settings.

## Product Purpose

Nobino gives employees one internal place to reserve food, shared company systems, and desks in the building. It exists to make these recurring workplace reservations clear and manageable for employees while giving the firm appropriate control over shared capacity and approvals.

Success means employees can quickly make and understand their reservations, shared resources are not overbooked, and managers and administrators can resolve requests and maintain availability without relying on scattered manual coordination.

## Positioning

Nobino is a firm-specific reservation system shaped around the firm's real working calendar, shared resources, approval responsibilities, and Persian-language workflows. It unifies several everyday workplace reservations without adding large-product infrastructure or assigning physical company systems individually.

## Operating Context

- The product is an internal authenticated web application used in a Persian, right-to-left interface.
- Employees reserve food, company-system capacity, named building desks, and meeting rooms.
- Managers review requests and can manage reservations within their permissions.
- Administrators configure users, teams, schedules, capacities, policies, exceptions, announcements, and integrations.
- In-app notifications and the Bale messenger integration communicate relevant reservation events and operational reports.

## Capabilities and Constraints

- Company systems are modeled as a capacity-based resource pool; a system reservation consumes one unit rather than assigning a physical device.
- System reservations begin as pending and require manual approval or configured automatic approval before consuming capacity.
- Pending system reservations remain visible but do not block other requests.
- Approval rechecks capacity transactionally.
- System reservations use exact hourly boundaries, last at least one hour, cannot exceed one configured working day, and cannot span calendar days.
- Working schedules, date-specific exceptions, capacity, and approval policies remain configurable.
- Employees can reserve food, desks, meeting rooms, and company-system capacity through separate but consistent workflows.
- Access is role-based for employees, managers, and administrators.
- All user-facing reservation dates, date inputs, calendar navigation, URL date parameters, and visible date formatting use Persian/Jalali dates. Product date input must not use browser-native Gregorian date pickers.
- Check-in, check-out, no-show tracking, penalties, quotas, physical system assignment, and large distributed-system infrastructure are outside the current product scope unless explicitly requested.

## Brand Commitments

- Product name: Nobino / نوبینو.
- Product language and layout: Persian and right-to-left.
- Existing product attribution: «توسعه داده‌شده در هلدینگ آقاجانی».
- Keep product copy direct and operational; do not invent promotional claims.

## Evidence on Hand

- The repository contains the implemented reservation workflows, business rules, Persian product copy, and operational documentation.
- `README.md` documents the current feature set, routes, setup, integrations, and business behavior.
- `AGENTS.md` is the source of truth for non-negotiable reservation and Jalali-date rules.
- The project contains no public testimonials, customer logos, case studies, press coverage, or marketing benchmarks; future work must not fabricate them.

## Product Principles

- Make routine workplace reservations fast and understandable for employees.
- Protect shared availability with explicit rules and capacity-safe approval.
- Match the firm's actual Persian calendar, working schedule, roles, and operational practices.
- Keep administrative control configurable without making ordinary employee workflows feel administrative.
- Prefer a small, dependable internal product over speculative large-product complexity.

## Accessibility & Inclusion

The interface must remain usable in Persian and right-to-left layouts, including clear keyboard focus states, readable status communication, and natural Persian/Jalali date presentation.
