import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  Mail,
  Save,
  Trash2,
  Users,
  UserPlus,
  UserX,
} from "lucide-react";
import { UserRole } from "@prisma/client";

import {
  addTeamMemberAction,
  deleteTeamAction,
  removeTeamMemberAction,
  updateTeamAction,
} from "@/app/admin/actions";
import {
  FieldLabel,
  SelectInput,
  TextInput,
  UserManagementToast,
} from "@/app/admin/users/_components";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

type TeamDetailPageProps = {
  params: Promise<{
    teamId: string;
  }>;
  searchParams?: Promise<{
    error?: string;
    memberAdded?: string;
    memberRemoved?: string;
    teamUpdated?: string;
  }>;
};

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

export default async function TeamDetailPage({
  params,
  searchParams,
}: TeamDetailPageProps) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  await requireRole([UserRole.ADMIN]);

  const team = await db.team.findUnique({
    where: { id: resolvedParams.teamId },
    select: {
      id: true,
      name: true,
      members: {
        orderBy: { user: { name: "asc" } },
        select: {
          id: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              active: true,
            },
          },
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const memberUserIds = new Set(team.members.map((member) => member.user.id));

  // Only active, non-deleted users who are not already members can be added.
  const candidateUsers = await db.user.findMany({
    where: {
      deletedAt: null,
      active: true,
      id: { notIn: [...memberUserIds] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  const redirectPath = `/admin/teams/${team.id}`;
  const ROLE_LABELS: Record<UserRole, string> = {
    USER: "کاربر",
    MANAGER: "مدیر",
    ADMIN: "ادمین",
  };

  return (
    <div className="grid gap-6" dir="rtl">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/teams">
              <ChevronRight className="h-4 w-4" />
              بازگشت به تیم‌ها
            </Link>
          </Button>
        }
        subtitle="ویرایش نام تیم، افزودن و حذف اعضا"
        title={team.name}
      />

      <UserManagementToast params={resolvedSearchParams} />

      <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="grid gap-4 border-b pb-5 lg:grid-cols-[minmax(220px,0.8fr)_1fr] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-950">
                {team.name}
              </h2>
              <span className="inline-flex h-6 items-center rounded-full bg-blue-50 px-2 text-xs font-medium text-blue-800">
                {formatPersianNumber(team.members.length)} عضو
              </span>
            </div>
          </div>
        </div>

        <form
          action={updateTeamAction}
          className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end"
        >
          <input name="redirectPath" type="hidden" value={redirectPath} />
          <input name="teamId" type="hidden" value={team.id} />
          <div className="grid gap-2">
            <FieldLabel htmlFor="team-name">نام تیم</FieldLabel>
            <TextInput
              defaultValue={team.name}
              dir="rtl"
              id="team-name"
              maxLength={100}
              name="name"
              required
            />
          </div>
          <Button className="w-full lg:w-auto" type="submit">
            <Save className="h-4 w-4" />
            ذخیره نام
          </Button>
        </form>
      </section>

      <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="grid gap-1 border-b pb-5">
          <h2 className="font-medium text-slate-950">افزودن عضو</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            فقط کاربران فعال که هنوز عضو این تیم نیستند نمایش داده می‌شوند.
            کاربران از LDAP تامین می‌شوند؛ عضویت در تیم محلی است.
          </p>
        </div>

        {candidateUsers.length === 0 ? (
          <p className="mt-5 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
            همه کاربران فعال عضو این تیم هستند یا کاربر دیگری برای افزودن
            وجود ندارد.
          </p>
        ) : (
          <form
            action={addTeamMemberAction}
            className="mt-5 grid gap-4 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end"
          >
            <input name="redirectPath" type="hidden" value={redirectPath} />
            <input name="teamId" type="hidden" value={team.id} />
            <div className="grid gap-2">
              <FieldLabel htmlFor="member-user">کاربر</FieldLabel>
              <SelectInput id="member-user" name="userId" defaultValue="">
                <option value="" disabled>
                  انتخاب کاربر…
                </option>
                {candidateUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {user.email}
                  </option>
                ))}
              </SelectInput>
            </div>
            <Button className="w-full md:w-auto" type="submit">
              <UserPlus className="h-4 w-4" />
              افزودن به تیم
            </Button>
          </form>
        )}
      </section>

      <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="grid gap-1 border-b pb-5">
          <h2 className="font-medium text-slate-950">اعضای تیم</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            هر کاربر می‌تواند همزمان عضو چند تیم باشد.
          </p>
        </div>

        {team.members.length === 0 ? (
          <div className="mt-5 rounded-md border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
            این تیم هنوز عضوی ندارد.
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {team.members.map((member) => (
              <div
                className="rounded-lg border bg-background p-4"
                key={member.id}
              >
                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                        member.user.active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {member.user.active ? (
                        <Users className="h-5 w-5" />
                      ) : (
                        <UserX className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-medium text-slate-950">
                          {member.user.name}
                        </h3>
                        <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700">
                          {ROLE_LABELS[member.user.role]}
                        </span>
                        <span
                          className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-medium ${
                            member.user.active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {member.user.active ? "فعال" : "غیرفعال"}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span dir="ltr">{member.user.email}</span>
                      </p>
                    </div>
                  </div>

                  <form action={removeTeamMemberAction}>
                    <input
                      name="redirectPath"
                      type="hidden"
                      value={redirectPath}
                    />
                    <input name="teamId" type="hidden" value={team.id} />
                    <input name="userId" type="hidden" value={member.user.id} />
                    <Button
                      className="w-full lg:w-auto"
                      type="submit"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                      حذف از تیم
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-red-200 bg-card p-5 text-card-foreground shadow-sm">
        <div className="grid gap-1 border-b border-red-100 pb-5">
          <h2 className="font-medium text-red-800">حذف تیم</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            با حذف تیم، همه عضویت‌های آن هم پاک می‌شود. کاربران حذف نمی‌شوند و
            فقط از این تیم خارج می‌شوند.
          </p>
        </div>

        <form action={deleteTeamAction} className="mt-5 flex justify-end">
          <input name="teamId" type="hidden" value={team.id} />
          <Button
            className="w-full bg-red-700 text-white hover:bg-red-800 sm:w-auto"
            type="submit"
          >
            <Trash2 className="h-4 w-4" />
            حذف تیم
          </Button>
        </form>
      </section>
    </div>
  );
}
