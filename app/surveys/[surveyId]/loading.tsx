export default function SurveyDetailLoading() {
  return (
    <div className="space-y-6 text-right" dir="rtl">
      <div className="grid gap-1">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex gap-4">
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-lg border bg-muted/40"
          />
        ))}
      </div>
    </div>
  );
}
