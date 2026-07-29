/*
THESIS: Nobino’s home is a compact service directory, not a dashboard.
OWN-WORLD: White and cool-slate fields, one restrained action blue, IRANSansX, thin rules, and compact bordered controls.
STORY: An employee scans the available reservation services and opens the one they need.
FIRST VIEWPORT: A concise RTL heading sits above a responsive 2×2 service grid; each destination pairs an icon, title, description, and leftward cue.
FORM: Equal-weight service wayfinding that can grow without implying a fixed count or sequence.
*/
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Armchair,
  CalendarClock,
  DoorOpen,
  Utensils,
} from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";

type ServiceLink = {
  description: string;
  href: string;
  icon: typeof CalendarClock;
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

function ServiceRoute({ service }: { service: ServiceLink }) {
  const Icon = service.icon;

  return (
    <Link
      className="group grid min-h-32 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card p-4 text-right text-card-foreground outline-none transition-[background-color,border-color] duration-200 hover:border-blue-200 hover:bg-blue-50/40 active:border-blue-300 active:bg-blue-50/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:gap-4 sm:p-5"
      href={service.href}
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-background text-slate-600 transition-colors duration-200 group-hover:border-blue-200 group-hover:text-primary group-focus-visible:border-blue-200 group-focus-visible:text-primary">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>

      <span className="grid min-w-0 gap-1">
        <span className="text-base font-semibold leading-7 text-slate-950 sm:text-lg">
          {service.title}
        </span>
        <span className="text-sm leading-6 text-slate-600">
          {service.description}
        </span>
      </span>

      <span
        aria-hidden="true"
        className="inline-flex h-9 w-9 items-center justify-center text-primary"
      >
        <ArrowLeft className="h-5 w-5 transition-transform duration-200 ease-out group-hover:-translate-x-1 group-focus-visible:-translate-x-1" />
      </span>
    </Link>
  );
}

function ServicesGateway({ user }: { user: CurrentUser }) {
  return (
    <AppShell user={user}>
      <div className="grid gap-5 text-right sm:gap-6" dir="rtl">
        <section
          aria-labelledby="services-title"
          className="grid gap-1.5"
        >
          <h1
            className="text-2xl font-semibold leading-9 text-slate-950"
            id="services-title"
          >
            خدمات
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            سرویس مورد نیازتان را انتخاب کنید.
          </p>
        </section>

        <nav
          aria-label="فهرست خدمات قابل رزرو"
          className="grid gap-4 md:grid-cols-2"
        >
          {serviceLinks.map((service) => (
            <ServiceRoute key={service.href} service={service} />
          ))}
        </nav>
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
