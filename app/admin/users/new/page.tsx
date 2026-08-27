import Link from "next/link";
import { ChevronRight, UserPlus } from "lucide-react";
import { UserRole } from "@prisma/client";

import { createUserAction } from "@/app/admin/actions";
import {
  FieldLabel,
  SelectInput,
  TextInput,
  UserManagementToast,
  UserRoleOptions,
} from "@/app/admin/users/_components";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";

type NewUserPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function NewUserPage({
  searchParams,
}: NewUserPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;

  return (
    <div className="grid gap-6" dir="rtl">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/users">
              <ChevronRight className="h-4 w-4" />
              بازگشت به کاربران
            </Link>
          </Button>
        }
        subtitle="ساخت حساب کاربری جدید با نقش و رمز موقت اولیه"
        title="کاربر جدید"
      />

      <UserManagementToast params={params} />

      <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <form action={createUserAction} className="grid gap-5">
          <input
            name="errorRedirectPath"
            type="hidden"
            value="/admin/users/new"
          />
          <input
            name="successRedirectPath"
            type="hidden"
            value="/admin/users"
          />

          <div className="flex items-start gap-3 border-b pb-5">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <UserPlus className="h-5 w-5" />
            </span>
            <div className="grid gap-1">
              <h2 className="font-medium text-slate-950">اطلاعات حساب</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                ایمیل پس از ساخت در فرم مدیریت کاربر فقط خواندنی است.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <FieldLabel htmlFor="new-user-name">نام</FieldLabel>
              <TextInput
                dir="rtl"
                id="new-user-name"
                maxLength={100}
                name="name"
                required
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="new-user-email">ایمیل</FieldLabel>
              <TextInput
                dir="ltr"
                id="new-user-email"
                maxLength={200}
                name="email"
                required
                type="email"
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="new-user-role">نقش</FieldLabel>
              <SelectInput
                defaultValue={UserRole.USER}
                id="new-user-role"
                name="role"
              >
                <UserRoleOptions />
              </SelectInput>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="new-user-password">رمز موقت</FieldLabel>
              <TextInput
                dir="ltr"
                id="new-user-password"
                minLength={8}
                name="password"
                placeholder="حداقل ۸ کاراکتر"
                required
                type="password"
              />
            </div>
          </div>

          <div className="flex justify-end border-t pt-5">
            <Button className="w-full sm:w-auto" type="submit">
              <UserPlus className="h-4 w-4" />
              ساخت کاربر
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
