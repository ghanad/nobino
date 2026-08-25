export default function SurveysLoading() {
  return (
    <div className="space-y-8 text-right" dir="rtl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
          نظرسنجی‌ها
        </h1>
        <p className="text-sm text-muted-foreground">
          در حال بارگذاری نظرسنجی‌ها...
        </p>
      </div>
      <div
        aria-hidden="true"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <div
            className="h-32 animate-pulse rounded-lg border bg-muted/40"
            key={index}
          />
        ))}
      </div>
    </div>
  );
}
