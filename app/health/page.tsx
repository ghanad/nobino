export default function HealthPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="rounded-lg border bg-card p-6 text-card-foreground">
        <h1 className="text-xl font-semibold">OK</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nobino reservation app is running.
        </p>
      </div>
    </main>
  );
}
