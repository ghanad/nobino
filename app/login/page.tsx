import { redirect } from "next/navigation";

import { ProductSignature } from "@/components/app/product-signature";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getAuthProvider } from "@/lib/ldap-auth";
import { loginAction } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [params, currentUser] = await Promise.all([
    searchParams,
    getCurrentUser(),
  ]);

  if (currentUser) {
    redirect("/reservations");
  }

  const hasInvalidLogin = params.error === "invalid";
  const authProvider = getAuthProvider();
  const shouldShowCompanyEmailHint =
    authProvider === "ldap" || authProvider === "hybrid";

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-12"
    >
      <div className="grid w-full max-w-sm gap-4">
        <section className="w-full rounded-lg border bg-card p-6 text-right text-card-foreground shadow-sm">
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">
              نوبینو
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal">
              ورود به سامانه
            </h1>
          </div>

          {hasInvalidLogin ? (
            <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              ایمیل یا رمز عبور نادرست است.
            </div>
          ) : null}

          <form action={loginAction} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              ایمیل
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                name="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                required
              />
              {shouldShowCompanyEmailHint ? (
                <span className="text-xs font-normal leading-5 text-muted-foreground">
                  از ایمیل شرکت استفاده کنید؛ مثل{" "}
                  <span dir="ltr" className="inline-block">
                    user@balout.co
                  </span>
                </span>
              ) : null}
            </label>
            <label className="grid gap-2 text-sm font-medium">
              رمز عبور
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                name="password"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                required
              />
            </label>
            <Button type="submit" className="w-full">
              ورود
            </Button>
          </form>
        </section>
        <ProductSignature />
      </div>
    </main>
  );
}
