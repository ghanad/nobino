"use client";

import { SurveyIdentityMode, SurveyKind } from "@prisma/client";
import { useActionState, useEffect, useState } from "react";


import { FieldLabel } from "@/app/admin/_components/admin-form-fields";
import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatJalaliDateParam } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

const KIND_OPTIONS = [
  {
    description: "نتایج در زمان فعال بودن قابل مشاهده است.",
    label: "رضایت‌سنجی",
    value: SurveyKind.SATISFACTION,
  },
  {
    description: "برای جمع‌آوری پاسخ و نمایش نتایج در طول اجرا.",
    label: "جمع‌آوری اطلاعات",
    value: SurveyKind.DATA_COLLECTION,
  },
  {
    description: "نتایج پس از بسته شدن نظرسنجی نمایش داده می‌شوند.",
    label: "رای‌گیری",
    value: SurveyKind.VOTE,
  },
] as const;

const IDENTITY_OPTIONS = [
  {
    description: "پاسخ هر کاربر با نام او ثبت می‌شود.",
    label: "مشخص",
    value: SurveyIdentityMode.NAMED,
  },
  {
    description: "پاسخ‌ها به نام پاسخ‌دهنده ثبت نمی‌شوند.",
    label: "ناشناس",
    value: SurveyIdentityMode.ANONYMOUS,
  },
] as const;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, "0");
  return { label: `${h}:00`, value: `${h}:00` };
});

type SurveyFormActionState = {
  errors?: Record<string, string[] | undefined>;
  message?: string;
  status: "error" | "idle" | "success";
};

type SurveyFormAction = (
  prevState: SurveyFormActionState,
  formData: FormData,
) => Promise<SurveyFormActionState>;

type SurveyMetadataFormProps = {
  action: SurveyFormAction;
  initial?: {
    surveyId: string;
    title: string;
    description: string | null;
    kind: SurveyKind;
    identityMode: SurveyIdentityMode;
    startsAt: Date | null;
    endsAt: Date | null;
  };
  canChangeKindIdentity: boolean;
  isEditing: boolean;
  formId?: string;
  hideSubmit?: boolean;
};

export function SurveyMetadataForm({
  action,
  initial,
  canChangeKindIdentity,
  isEditing,
  formId,
  hideSubmit = false,
}: SurveyMetadataFormProps) {
  const [state, formAction] = useActionState(action, {
    errors: undefined,
    message: "",
    status: "idle",
  });

  const savedStartDate = initial?.startsAt
    ? formatJalaliDateParam(initial.startsAt)
    : "";
  const savedStartTime = initial?.startsAt
    ? `${initial.startsAt.getHours().toString().padStart(2, "0")}:00`
    : "";
  const savedEndDate = initial?.endsAt
    ? formatJalaliDateParam(initial.endsAt)
    : "";
  const savedEndTime = initial?.endsAt
    ? `${initial.endsAt.getHours().toString().padStart(2, "0")}:00`
    : "";

  const [startDate, setStartDate] = useState(savedStartDate);
  const [startTime, setStartTime] = useState(savedStartTime);
  const [endDate, setEndDate] = useState(savedEndDate);
  const [endTime, setEndTime] = useState(savedEndTime);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const selectedKind = initial?.kind ?? SurveyKind.SATISFACTION;
  const selectedIdentityMode = initial?.identityMode ?? SurveyIdentityMode.NAMED;

  useEffect(() => {
    if (state.status === "success" && state.message) {
      setSuccessMessage(state.message);
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  useEffect(() => {
    setStartDate(savedStartDate);
    setStartTime(savedStartTime);
    setEndDate(savedEndDate);
    setEndTime(savedEndTime);
  }, [savedEndDate, savedEndTime, savedStartDate, savedStartTime]);

  return (
    <form
      action={formAction}
      className={cn("space-y-6", !isEditing && "space-y-5")}
      dir="rtl"
      id={formId}
    >
      {isEditing && initial ? (
        <input name="surveyId" type="hidden" value={initial.surveyId} />
      ) : null}

      {successMessage ? (
        <div
          className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          role="alert"
        >
          {successMessage}
        </div>
      ) : null}

      {state.message && state.status === "error" ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {state.message}
        </div>
      ) : null}

      <section className="grid gap-3 border-b pb-5">
        <h2 className="text-base font-semibold">اطلاعات پایه</h2>
        <div className="grid gap-2">
          <FieldLabel htmlFor="title">عنوان نظرسنجی</FieldLabel>
          <input
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue={initial?.title ?? ""}
            id="title"
            maxLength={200}
            name="title"
            placeholder="عنوان نظرسنجی را وارد کنید"
            required
            type="text"
          />
          {state.errors?.title ? (
            <p className="text-xs text-red-600">{state.errors.title[0]}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="description">
            توضیحات <span className="font-normal text-muted-foreground">(اختیاری)</span>
          </FieldLabel>
          <textarea
            className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue={initial?.description ?? ""}
            id="description"
            maxLength={4000}
            name="description"
            placeholder="توضیح کوتاه برای مخاطبان بنویسید"
          />
          {state.errors?.description ? (
            <p className="text-xs text-red-600">{state.errors.description[0]}</p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-base font-semibold">تنظیمات پاسخ</h2>
        <div className="grid gap-2">
          <span className="text-sm font-medium">نوع نظرسنجی</span>
          {canChangeKindIdentity ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                {KIND_OPTIONS.map((option) => (
                  <label
                    className="flex min-h-16 cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    key={option.value}
                  >
                    <input
                      className="mt-0.5"
                      defaultChecked={selectedKind === option.value}
                      name="kind"
                      type="radio"
                      value={option.value}
                    />
                    <span className="grid gap-0.5">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs leading-4 text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {state.errors?.kind ? (
                <p className="text-xs text-red-600">{state.errors.kind[0]}</p>
              ) : null}
            </>
          ) : (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {KIND_OPTIONS.find((o) => o.value === initial?.kind)?.label ??
                "نوع نظرسنجی"}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">حالت هویت پاسخ‌دهندگان</span>
          {canChangeKindIdentity ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {IDENTITY_OPTIONS.map((option) => (
                  <label
                    className="flex min-h-16 cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    key={option.value}
                  >
                    <input
                      className="mt-0.5"
                      defaultChecked={selectedIdentityMode === option.value}
                      name="identityMode"
                      type="radio"
                      value={option.value}
                    />
                    <span className="grid gap-0.5">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs leading-4 text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {state.errors?.identityMode ? (
                <p className="text-xs text-red-600">
                  {state.errors.identityMode[0]}
                </p>
              ) : null}
            </>
          ) : (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {IDENTITY_OPTIONS.find((o) => o.value === initial?.identityMode)
                ?.label ?? "حالت هویت"}
            </div>
          )}
        </div>
      </section>

      {!isEditing ? (
        <details className="text-xs leading-6 text-muted-foreground">
          <summary className="w-fit cursor-pointer rounded-sm font-medium text-foreground marker:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            تفاوت حالت‌ها چیست؟
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-1 border-r pr-3">
            <li>
              <strong>مشخص:</strong> پاسخ هر کاربر با نام او ثبت می‌شود. نتایج در
              حین فعال بودن نظرسنجی قابل مشاهده است.
            </li>
            <li>
              <strong>ناشناس:</strong> پاسخ‌ها بدون ارتباط با کاربر ثبت می‌شوند.
              برای انتشار حداقل ۵ دریافت‌کننده نیاز است و نتایج تا جمع‌آوری ۵ پاسخ
              نمایش داده نمی‌شوند.
            </li>
            <li>
              <strong>رای‌گیری:</strong> هیچ‌کس (حتی مدیر) تا پایان نظرسنجی یا
              بسته شدن آن نمی‌تواند نتایج را ببیند. فقط تعداد شرکت‌کنندگان قابل
              مشاهده است.
            </li>
          </ul>
        </details>
      ) : null}

      {/* Schedule (only visible when editing) */}
      {isEditing ? (
        <div className="grid gap-4 border-t pt-6">
          <h2 className="text-base font-semibold">زمان‌بندی</h2>
          <p className="text-xs text-muted-foreground">
            در صورت تنظیم نکردن زمان شروع و پایان، نظرسنجی پس از انتشار فعال می‌شود
            و تا بسته شدن دستی ادامه می‌یابد.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Start */}
            <div className="grid gap-2">
              <FieldLabel htmlFor="startDate">تاریخ شروع</FieldLabel>
              <JalaliDatePicker
                name="startDate"
                onValueChange={setStartDate}
                value={startDate}
              />
              {state.errors?.startDate ? (
                <p className="text-xs text-red-600">
                  {state.errors.startDate[0]}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <FieldLabel htmlFor="startTime">ساعت شروع</FieldLabel>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                id="startTime"
                name="startTime"
                onChange={(event) => setStartTime(event.target.value)}
                value={startTime}
              >
                <option value="">انتخاب کنید</option>
                {HOUR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {state.errors?.startTime ? (
                <p className="text-xs text-red-600">
                  {state.errors.startTime[0]}
                </p>
              ) : null}
            </div>

            {/* End */}
            <div className="grid gap-2">
              <FieldLabel htmlFor="endDate">تاریخ پایان</FieldLabel>
              <JalaliDatePicker
                name="endDate"
                onValueChange={setEndDate}
                value={endDate}
              />
              {state.errors?.endDate ? (
                <p className="text-xs text-red-600">
                  {state.errors.endDate[0]}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <FieldLabel htmlFor="endTime">ساعت پایان</FieldLabel>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                id="endTime"
                name="endTime"
                onChange={(event) => setEndTime(event.target.value)}
                value={endTime}
              >
                <option value="">انتخاب کنید</option>
                {HOUR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {state.errors?.endTime ? (
                <p className="text-xs text-red-600">
                  {state.errors.endTime[0]}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Submit */}
      {!hideSubmit ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
          <SubmitButton pendingLabel="در حال ذخیره">
            {isEditing ? "ذخیره تغییرات" : "ایجاد نظرسنجی"}
          </SubmitButton>
          {!isEditing ? (
            <p className="text-xs text-muted-foreground">
              پس از ایجاد، وارد ویرایشگر سوال‌ها می‌شوید.
            </p>
          ) : null}
          {isEditing && initial ? (
            <Button
              onClick={() => window.history.back()}
              type="button"
              variant="outline"
            >
              انصراف
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
