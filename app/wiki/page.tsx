import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { canManageWiki } from "@/lib/permissions";
import { getWikiPagePath } from "@/lib/wiki-route";
import { getWikiLandingSlug } from "@/lib/wiki-service";

export default async function WikiIndexPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const landingSlug = await getWikiLandingSlug(user);

  if (landingSlug) {
    redirect(getWikiPagePath(landingSlug));
  }

  return (
    <AppShell user={user}>
      <div className="grid gap-6" dir="rtl">
        <PageHeader
          subtitle="هنوز صفحه‌ای در دانشنامه ثبت نشده است."
          title="دانشنامه"
        />

        <div className="grid gap-4 rounded-2xl border bg-white p-5">
          <p className="text-sm leading-7 text-muted-foreground">
            {canManageWiki(user.role)
              ? "با ساخت اولین صفحه، دانشنامه قابل مرور خواهد شد."
              : "وقتی صفحه‌های منتشرشده‌ای ثبت شوند، از همین‌جا قابل مرور خواهند بود."}
          </p>

          {canManageWiki(user.role) ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/wiki/new">ایجاد صفحه نخست</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/wiki/transfer">ورود از فایل خروجی</Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
