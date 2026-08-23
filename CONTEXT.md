# Nobino

An internal reservation app for company workspaces: systems (capacity-based pools), desks, meeting rooms, and lunch service.

## Language

### Reservations

**Reservation**:
A booking of one unit of capacity in a ResourcePool for an hourly range; the default subject of approval and reporting.
_Avoid_: system booking, pool reservation

**Desk Reservation**:
A booking of a single named desk inside a building for an hourly range. Distinct from Reservation: it consumes a specific desk, not pool capacity.
_Avoid_: desk booking, workstation reservation

**Meeting Room Reservation**:
A booking of a named meeting room for an hourly range.
_Avoid_: room booking

**Lunch Reservation**:
A per-person, per-day record of breakfast/lunch attendance at a building; not hourly and not capacity-based.
_Avoid_: food order

### Reports

**Team Report**:
Approved-only system Reservation consumption aggregated by Team, for a week or Jalali month.
_Avoid_: team statistics

**Desk Report**:
Approved-only Desk Reservation consumption aggregated by person, for a week or Jalali month; only people with at least one approved reservation appear.
_Avoid_: people report, user statistics

### Structure

**ResourcePool**:
A shared pool of identical capacity units representing company systems; reservations consume one unit of its capacity per hour.
_Avoid_: device, machine

**Desk**:
A named physical workspace belonging to exactly one Building.
_Avoid_: seat, workstation

**Building**:
A physical office location owning Desks, ResourcePools, lunch service, and its own weekly schedule.
_Avoid_: office (legacy storage name), site

**Team**:
A named grouping of users used for attribution in reports and survey audiences; a user may belong to multiple Teams.
_Avoid_: department, group
