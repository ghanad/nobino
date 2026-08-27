import { Activity, Bot, RotateCcw, Save } from "lucide-react";

import {
  resetWikiAiSystemPromptAction,
  testWikiAiConnectionAction,
  updateWikiAiSettingsAction,
} from "@/app/admin/wiki-ai/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { getWikiAiSettings } from "@/lib/wiki-ai-settings-service";

type WikiAiAdminPageProps = {
  searchParams?: Promise<{
    error?: string;
    latency?: string;
    modelMissing?: string;
    reset?: string;
    tested?: string;
    updated?: string;
  }>;
};

function getToast(params: Awaited<WikiAiAdminPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  if (params?.modelMissing) {
    return {
      consumeKeys: ["tested", "latency", "modelMissing"],
      message:
        "اتصال برقرار شد، اما نام مدل انتخاب‌شده در فهرست سرویس وجود ندارد.",
      variant: "error" as const,
    };
  }

  if (params?.tested) {
    const latency = Number(params.latency);
    const latencyLabel = Number.isFinite(latency)
      ? `${new Intl.NumberFormat("fa-IR").format(latency)} میلی‌ثانیه`
      : "موفق";

    return {
      consumeKeys: ["tested", "latency"],
      message: `اتصال به مدل برقرار شد؛ زمان پاسخ فهرست مدل‌ها ${latencyLabel} بود.`,
      variant: "success" as const,
    };
  }

  if (params?.updated) {
    return {
      consumeKeys: ["updated"],
      message: "تنظیمات دستیار دانش‌نامه ذخیره شد.",
      variant: "success" as const,
    };
  }

  if (params?.reset) {
    return {
      consumeKeys: ["reset"],
      message: "دستورهای رفتاری دستیار به نسخه پیش‌فرض بازگردانده شد.",
      variant: "success" as const,
    };
  }

  return null;
}

const inputClassName =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-left text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export default async function WikiAiAdminPage({
  searchParams,
}: WikiAiAdminPageProps) {
  const [settings, params] = await Promise.all([
    getWikiAiSettings(),
    searchParams,
  ]);
  const toast = getToast(params);

  return (
    <div className="grid gap-5 text-right" dir="rtl">
      {toast ? <UrlToast {...toast} /> : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Bot aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="font-semibold text-slate-950">اتصال فعال</h2>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                OpenAI-compatible
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              نوبینو از Chat Completions استفاده می‌کند، پاسخ را به‌صورت زنده
              نمایش می‌دهد و بخش reasoning مدل را در اختیار کاربر نمی‌گذارد.
            </p>
          </div>
        </div>

        <form className="grid gap-0" action={updateWikiAiSettingsAction}>
          <div className="grid gap-4 border-b border-slate-100 p-4 sm:p-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">اتصال به مدل</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                نشانی سرویس و مدل مورد استفاده دستیار را مشخص کنید.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-800">
              نشانی پایه سرویس
              <input
                className={inputClassName}
                defaultValue={settings.baseUrl}
                dir="ltr"
                name="baseUrl"
                placeholder="http://server:8000/v1"
                required
                type="url"
              />
              <span className="text-xs font-normal leading-5 text-muted-foreground">
                مسیر باید شامل نسخه API، مانند <span dir="ltr">/v1</span>، باشد.
                میزبان نیز باید در متغیر محیطی WIKI_AI_ALLOWED_HOSTS مجاز شده باشد.
              </span>
              </label>

              <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-800">
              نام مدل
              <input
                className={inputClassName}
                defaultValue={settings.model}
                dir="ltr"
                name="model"
                placeholder="Qwen3.6"
                required
                type="text"
              />
                <span className="text-xs font-normal leading-5 text-muted-foreground">
                باید دقیقاً با شناسهٔ برگشتی مسیر models یکسان باشد.
                </span>
              </label>
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-100 p-4 sm:p-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">رفتار پاسخ</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                محدودیت‌های زمانی و اندازه پاسخ مدل را کنترل کنید.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
              <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-800">
              مهلت پاسخ
              <span className="relative">
                <input
                  className={`${inputClassName} pl-16`}
                  defaultValue={settings.timeoutSeconds}
                  max={300}
                  min={5}
                  name="timeoutSeconds"
                  required
                  type="number"
                />
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">
                  ثانیه
                </span>
              </span>
              </label>

              <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-800">
              حداکثر طول پاسخ
              <span className="relative">
                <input
                  className={`${inputClassName} pl-14`}
                  defaultValue={settings.maxOutputTokens}
                  max={8000}
                  min={100}
                  name="maxOutputTokens"
                  required
                  type="number"
                />
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">
                  توکن
                </span>
              </span>
              </label>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-100 p-4 sm:p-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">دسترسی کاربران</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                مشخص کنید کاربران بتوانند از دستیار دانش‌نامه پرسش کنند یا نه.
              </p>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-sm text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50">
              <input
                className="h-4 w-4 accent-primary"
                defaultChecked={settings.enabled}
                name="enabled"
                type="checkbox"
              />
              <span>پرسش از دانش‌نامه برای کاربران فعال باشد</span>
            </label>
          </div>

          <div className="grid gap-3 border-b border-slate-100 p-4 sm:p-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                دستورهای رفتاری دستیار
              </h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                لحن، شیوه راهنمایی و ساختار پاسخ را مشخص کنید. قواعد امنیتی،
                اتکا به دانش‌نامه و ثبت منابع به‌صورت ثابت توسط نوبینو اضافه
                می‌شوند و از این بخش قابل تغییر نیستند.
              </p>
            </div>
            <textarea
              className="min-h-72 w-full resize-y rounded-md border border-input bg-background px-3 py-3 text-right text-sm leading-7 text-slate-900 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={settings.systemPrompt}
              dir="rtl"
              maxLength={12000}
              name="systemPrompt"
              required
              spellCheck={false}
            />
          </div>

          <div className="flex flex-wrap gap-2 p-4 sm:p-5">
            <SubmitButton pendingLabel="در حال ذخیره">
              <Save aria-hidden="true" className="h-4 w-4" />
              ذخیره تنظیمات
            </SubmitButton>
            <SubmitButton
              formAction={resetWikiAiSystemPromptAction}
              formNoValidate
              pendingLabel="در حال بازگردانی"
              variant="outline"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              بازگردانی متن پیش‌فرض
            </SubmitButton>
            <SubmitButton
              formAction={testWikiAiConnectionAction}
              pendingLabel="در حال آزمایش"
              variant="outline"
            >
              <Activity aria-hidden="true" className="h-4 w-4" />
              آزمایش اتصال
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-700">
        <h2 className="font-semibold text-slate-950">حریم اطلاعات</h2>
        <p>
          فقط محتوای قابل مشاهده برای هر کاربر به مدل ارسال می‌شود. صفحات مخفی
          و زیرشاخه‌های آن‌ها برای کاربران عادی وارد زمینهٔ پاسخ نمی‌شوند.
        </p>
      </section>
    </div>
  );
}
