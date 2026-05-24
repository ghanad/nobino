import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div
      className="flex flex-col gap-3 text-right sm:flex-row sm:items-end sm:justify-between"
      dir="rtl"
    >
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {actions ? <div className="flex justify-start">{actions}</div> : null}
    </div>
  );
}
