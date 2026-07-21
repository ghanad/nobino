import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Armchair,
  CalendarClock,
  DoorOpen,
  ExternalLink,
  Utensils,
} from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";

type ServiceLink = {
  description: string;
  href: string;
  icon: typeof CalendarClock;
  isExternal?: boolean;
  title: string;
};

const serviceLinks: ServiceLink[] = [
  {
    title: "رزرو غذا",
    description: "ثبت یا مشاهده رزرو غذای روزانه",
    href: "/lunch",
    icon: Utensils,
  },
  {
    title: "رزرو نوبت سیستم",
    description: "ثبت درخواست استفاده از سیستم‌های شرکت",
    href: "/reservations",
    icon: CalendarClock,
  },
  {
    title: "رزرو اتاق جلسه",
    description: "ثبت یا مشاهده رزرو اتاق‌های جلسه",
    href: "/meeting-rooms",
    icon: DoorOpen,
  },
  {
    title: "رزرو میز کار",
    description: "انتخاب میز در دفتر برای ساعت‌های مورد نیاز",
    href: "/desks",
    icon: Armchair,
  },
];

function ServiceCard({ service }: { service: ServiceLink }) {
  const Icon = service.icon;
  const LinkIcon = service.isExternal ? ExternalLink : ArrowLeft;
  const linkProps = service.isExternal
    ? {
        rel: "noreferrer",
        target: "_blank",
      }
    : {};

  return (
    <Link
      className="group grid min-h-36 gap-4 rounded-lg border bg-card p-5 text-right text-card-foreground transition-colors hover:border-slate-300 hover:bg-slate-50"
      href={service.href}
      {...linkProps}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-background text-slate-700">
          <Icon className="h-5 w-5" />
        </span>
        {service.isExternal ? (
          <span className="rounded-full border border-slate-200 px-2 py-1 text-xs font-medium text-muted-foreground">
            سامانه دیگر
          </span>
        ) : null}
      </div>
      <div className="grid gap-2">
        <h2 className="text-base font-semibold tracking-normal text-slate-950">
          {service.title}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {service.description}
        </p>
      </div>
      <div className="mt-auto flex items-center gap-1.5 text-sm font-medium text-primary">
        ورود
        <LinkIcon className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
      </div>
    </Link>
  );
}

function ServicesGateway({ user }: { user: CurrentUser }) {
  return (
    <AppShell user={user}>
      <div className="grid gap-6 text-right" dir="rtl">
        <PageHeader
          subtitle="سرویس مورد نیازتان را انتخاب کنید."
          title="خدمات"
        />

        <section
          aria-label="فهرست خدمات"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {serviceLinks.map((service) => (
            <ServiceCard key={service.href} service={service} />
          ))}
        </section>
      </div>
    </AppShell>
  );
}

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return <ServicesGateway user={user} />;
}
