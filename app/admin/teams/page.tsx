import Link from "next/link";
import { ChevronLeft, Plus, Users } from "lucide-react";
import { UserRole } from "@prisma/client";

import { createTeamAction } from "@/app/admin/actions";
import {
  FieldLabel,
  TextInput,
} from "@/app/admin/users/_components";
import {
  UsersTeamsPageFrame,
  UsersTeamsSectionShell,
} from "@/app/admin/_components/users-teams-section";
import { Button } from "@/components/ui/button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDate } from "@/lib/jalali-date";

type TeamsPageProps = {
  searchParams?: Promise<{
    error?: string;
    teamCreated?: string;
    teamDeleted?: string;
    teamUpdated?: string;
    memberAdded?: string;
    memberRemoved?: string;
  }>;
};

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

function getToast(params: Awaited<TeamsPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.teamCreated && "تیم ساخته شد.") ||
    (params?.teamUpdated && "نام تیم ذخیره شد.") ||
    (params?.teamDeleted && "تیم حذف شد.") ||
    (params?.memberAdded && "عضو جدید اضافه شد.") ||
    (params?.memberRemoved && "عضو از تیم حذف شد.");

  if (!successMessage) {
    return null;
  }

  return {
    consumeKeys: [
      "teamCreated",
      "teamUpdated",
      "teamDeleted",
      "memberAdded",
      "memberRemoved",
    ],
    message: successMessage,
    variant: "success" as const,
  };
}

export default async function AdminTeamsPage({ searchParams }: TeamsPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getToast(params);

  const teams = await db.team.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });

  const totalMemberships = teams.reduce(
    (sum, team) => sum + team._count.members,
    0,
  );

  return (
    <UsersTeamsSectionShell>
      {toast ? <UrlToast {...toast} /> : null}

      <UsersTeamsPageFrame
        action={
          <details className="group">
            <summary className="flex min-h-10 w-full cursor-pointer list-none items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto [&::-webkit-details-marker]:hidden">
              <Plus className="h-4 w-4" />
              ساخت تیم
            </summary>
            <form
              action={createTeamAction}
              className="mt-3 grid gap-4 rounded-lg border bg-card p-4"
            >
              <div className="grid gap-2">
                <FieldLabel htmlFor="team-name">نام تیم</FieldLabel>
                <TextInput
                  dir="rtl"
                  id="team-name"
                  maxLength={100}
                  name="name"
                  placeholder="مثلاً تیم دیتا"
                  required
                />
              </div>
              <Button
                className="w-full sm:w-auto sm:justify-self-start"
                type="submit"
              >
                <Plus className="h-4 w-4" />
                ساخت تیم
              </Button>
            </form>
          </details>
        }
        description="تیم‌ها برای گروه‌بندی اعضا و مدیریت عضویت‌های سازمانی استفاده می‌شوند."
        summary={
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">
                تعداد تیم‌ها
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {formatPersianNumber(teams.length)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">
                کل عضویت‌ها
              </p>
              <p className="mt-2 text-2xl font-semibold text-blue-700">
                {formatPersianNumber(totalMemberships)}
              </p>
            </div>
          </div>
        }
        title="نمای کلی تیم‌ها"
      >
        {teams.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
            هنوز تیمی تعریف نشده است.
          </div>
        ) : (
          teams.map((team) => (
            <div
              className="rounded-lg border bg-card p-4 shadow-sm"
              key={team.id}
            >
                <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_1fr_auto] lg:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                      <Users className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-medium text-slate-950">
                        {team.name}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {formatPersianNumber(team._count.members)} عضو
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">
                    ساخته شده در{" "}
                    <span className="font-medium text-slate-700">
                      {formatJalaliDate(team.createdAt)}
                    </span>
                  </div>

                  <Button asChild className="w-full lg:w-auto" variant="outline">
                    <Link href={`/admin/teams/${team.id}`}>
                      اعضا و ویرایش
                      <ChevronLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
            </div>
          ))
        )}
      </UsersTeamsPageFrame>
    </UsersTeamsSectionShell>
  );
}
