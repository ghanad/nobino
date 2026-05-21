export default function DashboardPage() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border bg-card p-5 text-card-foreground">
        <h2 className="font-medium">Reservation workspace</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Create hourly reservation requests from the Reservations area.
          Requests remain pending until manager approval.
        </p>
      </div>
      <div className="rounded-lg border bg-card p-5 text-card-foreground">
        <h2 className="font-medium">Current access</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Role-aware navigation is available from the header.
        </p>
      </div>
    </section>
  );
}
