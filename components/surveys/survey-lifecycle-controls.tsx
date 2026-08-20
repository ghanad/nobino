"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import {
  publishSurveyAction,
  extendSurveyEndTimeAction,
  closeSurveyAction,
  archiveSurveyAction,
  deleteSurveyDraftAction,
  sendSurveyReminderAction,
  type LifecycleActionState,
} from "@/app/surveys/survey-lifecycle-actions";
import { formatJalaliDateParam, formatJalaliDateTime } from "@/lib/jalali-date";
import type { SurveyDisplayState } from "@/lib/survey-status";

type SurveyLifecycleControlsProps = {
  surveyId: string;
  surveyTitle: string;
  displayState: SurveyDisplayState;
  isOwnerOrAdmin: boolean;
  endsAt: Date | null;
  lastReminderAt: Date | null;
  kind: string;
  isAnonymous: boolean;
  ready: boolean;
  hasAnonymousThreshold: boolean;
};

export function SurveyLifecycleControls({
  surveyId,
  surveyTitle,
  displayState,
  isOwnerOrAdmin,
  endsAt,
  lastReminderAt,
  kind,
  isAnonymous,
  ready,
  hasAnonymousThreshold,
}: SurveyLifecycleControlsProps) {
  const [publishState, publishAction, publishPending] = useActionState<
    LifecycleActionState,
    FormData
  >(publishSurveyAction, { status: "idle" });

  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showExtendForm, setShowExtendForm] = useState(false);
  const [showReminderConfirm, setShowReminderConfirm] = useState(false);

  const [newEndDate, setNewEndDate] = useState(
    endsAt ? formatJalaliDateParam(endsAt) : "",
  );
  const [newEndTime, setNewEndTime] = useState("");
  const [extendState, extendAction, extendPending] = useActionState<
    LifecycleActionState,
    FormData
  >(extendSurveyEndTimeAction, { status: "idle" });

  const [closeState, closeFormAction, closePending] = useActionState<
    LifecycleActionState,
    FormData
  >(closeSurveyAction, { status: "idle" });

  const [archiveState, archiveFormAction, archivePending] = useActionState<
    LifecycleActionState,
    FormData
  >(archiveSurveyAction, { status: "idle" });

  const [deleteState, deleteFormAction, deletePending] = useActionState<
    LifecycleActionState,
    FormData
  >(deleteSurveyDraftAction, { status: "idle" });
  const [reminderState, reminderFormAction] = useActionState<
    LifecycleActionState,
    FormData
  >(sendSurveyReminderAction, { status: "idle" });

  const isVote = kind === "VOTE";

  if (!isOwnerOrAdmin) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border p-4" dir="rtl">
      <h3 className="text-sm font-medium">مدیریت نظرسنجی</h3>

      {/* Status messages */}
      {publishState.status === "success" && publishState.message ? (
        <div
          className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          role="alert"
        >
          {publishState.message}
        </div>
      ) : null}
      {publishState.status === "error" && publishState.message ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {publishState.message}
        </div>
      ) : null}
      {extendState.status === "success" && extendState.message ? (
        <div
          className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          role="alert"
        >
          {extendState.message}
        </div>
      ) : null}
      {extendState.status === "error" && extendState.message ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {extendState.message}
        </div>
      ) : null}
      {closeState.status === "error" && closeState.message ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {closeState.message}
        </div>
      ) : null}
      {archiveState.status === "error" && archiveState.message ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {archiveState.message}
        </div>
      ) : null}
      {reminderState.message ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${reminderState.status === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}
          role="alert"
        >
          {reminderState.message}
        </div>
      ) : null}

      {/* ── Draft controls ── */}
      {displayState === "DRAFT" ? (
        <div className="space-y-3">
          {/* Immutable-after-publish warning */}
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            پس از انتشار، نوع نظرسنجی، حالت هویت، سوالات، گزینه‌ها، شرط‌ها و
            مخاطبان قابل ویرایش نخواهند بود.
          </div>

          {/* Vote embargo notice */}
          {isVote ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              نتایج رای‌گیری تا پایان یا بسته شدن نظرسنجی برای هیچ‌کس (حتی مدیر)
              قابل مشاهده نیست.
            </div>
          ) : null}

          {/* Anonymous threshold notice */}
          {isAnonymous && hasAnonymousThreshold ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              نتایج تا جمع‌آوری حداقل ۵ پاسخ نمایش داده نمی‌شوند.
            </div>
          ) : null}

          {/* Publish */}
          {!showPublishConfirm ? (
            <Button
              disabled={!ready}
              onClick={() => setShowPublishConfirm(true)}
              size="sm"
            >
              انتشار نظرسنجی
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border bg-muted p-3">
              <p className="text-sm font-medium">آیا برای انتشار اطمینان دارید؟</p>
              <p className="text-xs text-muted-foreground">
                پس از انتشار، سوالات و تنظیمات قابل تغییر نیستند.
              </p>
              <form action={publishAction} className="flex gap-2">
                <input type="hidden" name="surveyId" value={surveyId} />
                <SubmitButton pendingLabel="در حال انتشار" size="sm">
                  انتشار
                </SubmitButton>
                <Button
                  onClick={() => setShowPublishConfirm(false)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  انصراف
                </Button>
              </form>
            </div>
          )}

          {/* Delete draft */}
          {!showDeleteConfirm ? (
            <Button
              onClick={() => setShowDeleteConfirm(true)}
              size="sm"
              variant="destructive"
            >
              حذف پیش‌نویس
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">
                آیا از حذف این پیش‌نویس اطمینان دارید؟
              </p>
              <p className="text-xs text-red-600">
                این عملیات قابل بازگشت نیست. تمام اطلاعات نظرسنجی حذف می‌شود.
              </p>
              <form action={deleteFormAction} className="flex gap-2">
                <input type="hidden" name="surveyId" value={surveyId} />
                <SubmitButton
                  pendingLabel="در حال حذف"
                  size="sm"
                  variant="destructive"
                >
                  حذف
                </SubmitButton>
                <Button
                  onClick={() => setShowDeleteConfirm(false)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  انصراف
                </Button>
              </form>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Scheduled survey controls ── */}
      {displayState === "SCHEDULED" ? (
        <div className="space-y-3">
          {/* Close early */}
          {!showCloseConfirm ? (
            <Button
              onClick={() => setShowCloseConfirm(true)}
              size="sm"
              variant="destructive"
            >
              بستن نظرسنجی
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">
                آیا از بستن زودهنگام نظرسنجی اطمینان دارید؟
              </p>
              <p className="text-xs text-red-600">
                پس از بسته شدن، نظرسنجی قابل بازگشایی نیست. پاسخ‌های جدید ثبت
                نخواهند شد.
              </p>
              <form action={closeFormAction} className="flex gap-2">
                <input type="hidden" name="surveyId" value={surveyId} />
                <SubmitButton
                  pendingLabel="در حال بستن"
                  size="sm"
                  variant="destructive"
                >
                  بستن
                </SubmitButton>
                <Button
                  onClick={() => setShowCloseConfirm(false)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  انصراف
                </Button>
              </form>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Active survey controls ── */}
      {displayState === "ACTIVE" ? (
        <div className="space-y-3">
          <div className="space-y-2 rounded-md border bg-muted p-3">
            <p className="text-sm font-medium">یادآوری پاسخ به نظرسنجی</p>
            <p className="text-xs text-muted-foreground">
              فقط برای دریافت‌کنندگانی که هنوز پاسخ نداده‌اند، اعلان ثبت می‌شود.
              {lastReminderAt
                ? ` آخرین یادآوری: ${formatJalaliDateTime(lastReminderAt)}`
                : " هنوز یادآوری ارسال نشده است."}
            </p>
            {!showReminderConfirm ? (
              <Button onClick={() => setShowReminderConfirm(true)} size="sm" variant="outline">
                ارسال یادآوری
              </Button>
            ) : (
              <form action={reminderFormAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="surveyId" value={surveyId} />
                <p className="w-full text-xs">یادآوری فقط برای پاسخ‌نداده‌ها ارسال شود؟</p>
                <SubmitButton pendingLabel="در حال ثبت یادآوری" size="sm">
                  تایید ارسال
                </SubmitButton>
                <Button onClick={() => setShowReminderConfirm(false)} size="sm" type="button" variant="outline">
                  انصراف
                </Button>
              </form>
            )}
          </div>

          {/* Extend end time */}
          {!showExtendForm ? (
            <Button
              onClick={() => setShowExtendForm(true)}
              size="sm"
              variant="outline"
            >
              تمدید زمان پایان
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border bg-muted p-3">
              <p className="text-sm font-medium">تمدید زمان پایان</p>
              <form action={extendAction} className="space-y-2">
                <input type="hidden" name="surveyId" value={surveyId} />
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <label
                      className="text-xs text-muted-foreground"
                      htmlFor="newEndDate"
                    >
                      تاریخ پایان جدید
                    </label>
                    <JalaliDatePicker
                      name="newEndDate"
                      onValueChange={setNewEndDate}
                      value={newEndDate}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label
                      className="text-xs text-muted-foreground"
                      htmlFor="newEndTime"
                    >
                      ساعت پایان جدید
                    </label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                      defaultValue={newEndTime}
                      name="newEndTime"
                    >
                      <option value="">انتخاب کنید</option>
                      {Array.from({ length: 24 }, (_, i) => {
                        const h = i.toString().padStart(2, "0");
                        return (
                          <option key={h} value={`${h}:00`}>
                            {`${h}:00`}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <SubmitButton pendingLabel="در حال تمدید" size="sm">
                    تمدید
                  </SubmitButton>
                  <Button
                    onClick={() => setShowExtendForm(false)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    انصراف
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Close early */}
          {!showCloseConfirm ? (
            <Button
              onClick={() => setShowCloseConfirm(true)}
              size="sm"
              variant="destructive"
            >
              بستن نظرسنجی
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">
                آیا از بستن زودهنگام نظرسنجی اطمینان دارید؟
              </p>
              <p className="text-xs text-red-600">
                پس از بسته شدن، نظرسنجی قابل بازگشایی نیست. پاسخ‌های جدید ثبت
                نخواهند شد.
              </p>
              <form action={closeFormAction} className="flex gap-2">
                <input type="hidden" name="surveyId" value={surveyId} />
                <SubmitButton
                  pendingLabel="در حال بستن"
                  size="sm"
                  variant="destructive"
                >
                  بستن
                </SubmitButton>
                <Button
                  onClick={() => setShowCloseConfirm(false)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  انصراف
                </Button>
              </form>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Ended/Closed survey controls ── */}
      {(displayState === "ENDED") ? (
        <div className="space-y-3">
          {!showArchiveConfirm ? (
            <Button
              onClick={() => setShowArchiveConfirm(true)}
              size="sm"
              variant="outline"
            >
              بایگانی نظرسنجی
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border bg-muted p-3">
              <p className="text-sm font-medium">
                آیا از بایگانی این نظرسنجی اطمینان دارید؟
              </p>
              <form action={archiveFormAction} className="flex gap-2">
                <input type="hidden" name="surveyId" value={surveyId} />
                <SubmitButton pendingLabel="در حال بایگانی" size="sm">
                  بایگانی
                </SubmitButton>
                <Button
                  onClick={() => setShowArchiveConfirm(false)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  انصراف
                </Button>
              </form>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
