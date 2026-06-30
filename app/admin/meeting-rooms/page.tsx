import { UserRole } from "@prisma/client";

import {
  createMeetingRoomAction,
  createMeetingRoomScheduleExceptionAction,
  deleteMeetingRoomScheduleExceptionAction,
  updateMeetingRoomAction,
  updateMeetingRoomScheduleExceptionAction,
  updateMeetingRoomWeeklyScheduleAction,
} from "@/app/admin/meeting-rooms/actions";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatJalaliDateParam,
  JALALI_DATE_INPUT_PLACEHOLDER,
} from "@/lib/jalali-date";
import Link from "next/link";

type AdminMeetingRoomsPageProps = {
  searchParams?: Promise<{
    error?: string;
    exceptionCreated?: string;
    exceptionDeleted?: string;
    exceptionUpdated?: string;
    roomCreated?: string;
    roomId?: string;
    roomUpdated?: string;
    scheduleUpdated?: string;
  }>;
};

const DAY_LABELS = [
  "یک شنبه",
  "دو شنبه",
  "سه شنبه",
  "چهار شنبه",
  "پنج شنبه",
  "جمعه",
  "شنبه",
];

function getToast(params: Awaited<AdminMeetingRoomsPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.roomCreated && "اتاق جلسه ایجاد شد.") ||
    (params?.roomUpdated && "اتاق جلسه به‌روزرسانی شد.") ||
    (params?.scheduleUpdated && "زمان‌بندی اتاق به‌روزرسانی شد.") ||
    (params?.exceptionCreated && "استثنای اتاق ثبت شد.") ||
    (params?.exceptionUpdated && "استثنای اتاق به‌روزرسانی شد.") ||
    (params?.exceptionDeleted && "استثنای اتاق حذف شد.");

  return successMessage
    ? {
        consumeKeys: [
          "roomCreated",
          "roomUpdated",
          "scheduleUpdated",
          "exceptionCreated",
          "exceptionUpdated",
          "exceptionDeleted",
        ],
        message: successMessage,
        variant: "success" as const,
      }
    : null;
}

export default async function AdminMeetingRoomsPage({
  searchParams,
}: AdminMeetingRoomsPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getToast(params);
  const rooms = await db.meetingRoom.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      weeklySchedules: {
        orderBy: { dayOfWeek: "asc" },
      },
      exceptions: {
        orderBy: { date: "asc" },
      },
    },
  });
  const selectedRoom =
    rooms.find((room) => room.id === params?.roomId) ?? rooms[0] ?? null;
  const currentDateParam = formatJalaliDateParam(new Date());

  return (
    <div className="grid gap-6">
      <PageHeader
        subtitle="تعریف اتاق‌ها، تایید خودکار، زمان‌بندی مستقل و استثناهای تاریخ‌محور"
        title="مدیریت اتاق‌های جلسه"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <section className="grid gap-4 rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">اتاق‌ها</h2>
        <div className="flex flex-wrap gap-2">
          {rooms.map((room) => (
            <Button
              asChild
              key={room.id}
              size="sm"
              variant={room.id === selectedRoom?.id ? "default" : "outline"}
            >
              <Link href={`/admin/meeting-rooms?roomId=${room.id}`}>
                {room.name}
              </Link>
            </Button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {rooms.map((room) => (
            <form
              action={updateMeetingRoomAction}
              className="grid gap-3 rounded-md border bg-background p-4"
              key={room.id}
            >
              <input name="roomId" type="hidden" value={room.id} />
              <label className="grid gap-1 text-sm">
                نام
                <input
                  className="h-10 rounded-md border bg-background px-3"
                  defaultValue={room.name}
                  maxLength={100}
                  name="name"
                  type="text"
                />
              </label>
              <label className="grid gap-1 text-sm">
                موقعیت
                <input
                  className="h-10 rounded-md border bg-background px-3"
                  defaultValue={room.location ?? ""}
                  maxLength={120}
                  name="location"
                  type="text"
                />
              </label>
              <label className="grid gap-1 text-sm">
                توضیح
                <input
                  className="h-10 rounded-md border bg-background px-3"
                  defaultValue={room.description ?? ""}
                  maxLength={300}
                  name="description"
                  type="text"
                />
              </label>
              <label className="grid gap-1 text-sm">
                ترتیب
                <input
                  className="h-10 rounded-md border bg-background px-3"
                  defaultValue={room.sortOrder}
                  name="sortOrder"
                  type="number"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  defaultChecked={room.isActive}
                  name="isActive"
                  type="checkbox"
                />
                فعال
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  defaultChecked={room.autoApprovalEnabled}
                  name="autoApprovalEnabled"
                  type="checkbox"
                />
                تایید خودکار
              </label>
              <SubmitButton pendingLabel="در حال ذخیره">ذخیره</SubmitButton>
            </form>
          ))}
          <form
            action={createMeetingRoomAction}
            className="grid gap-3 rounded-md border bg-background p-4"
          >
            <h3 className="text-sm font-semibold">اتاق جدید</h3>
            <input
              className="h-10 rounded-md border bg-background px-3"
              maxLength={100}
              name="name"
              placeholder="نام اتاق"
              type="text"
            />
            <input
              className="h-10 rounded-md border bg-background px-3"
              maxLength={120}
              name="location"
              placeholder="موقعیت"
              type="text"
            />
            <input
              className="h-10 rounded-md border bg-background px-3"
              maxLength={300}
              name="description"
              placeholder="توضیح"
              type="text"
            />
            <input
              className="h-10 rounded-md border bg-background px-3"
              defaultValue={rooms.length + 1}
              name="sortOrder"
              type="number"
            />
            <label className="flex items-center gap-2 text-sm">
              <input defaultChecked name="isActive" type="checkbox" />
              فعال
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="autoApprovalEnabled" type="checkbox" />
              تایید خودکار
            </label>
            <SubmitButton pendingLabel="در حال ایجاد">ایجاد اتاق</SubmitButton>
          </form>
        </div>
      </section>

      {selectedRoom ? (
        <>
          <section className="grid gap-4 rounded-lg border bg-card p-5">
            <h2 className="text-base font-semibold">
              زمان‌بندی هفتگی {selectedRoom.name}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {selectedRoom.weeklySchedules.map((schedule) => (
                <form
                  action={updateMeetingRoomWeeklyScheduleAction}
                  className="grid gap-3 rounded-md border bg-background p-4"
                  key={schedule.id}
                >
                  <input name="scheduleId" type="hidden" value={schedule.id} />
                  <div className="font-medium">
                    {DAY_LABELS[schedule.dayOfWeek] ?? schedule.dayOfWeek}
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      defaultChecked={schedule.isWorkingDay}
                      name="isWorkingDay"
                      type="checkbox"
                    />
                    قابل رزرو
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="h-10 rounded-md border bg-background px-3"
                      defaultValue={schedule.startTime}
                      dir="ltr"
                      name="startTime"
                      type="text"
                    />
                    <input
                      className="h-10 rounded-md border bg-background px-3"
                      defaultValue={schedule.endTime}
                      dir="ltr"
                      name="endTime"
                      type="text"
                    />
                  </div>
                  <SubmitButton pendingLabel="در حال ذخیره">ذخیره</SubmitButton>
                </form>
              ))}
            </div>
          </section>

          <section className="grid gap-4 rounded-lg border bg-card p-5">
            <h2 className="text-base font-semibold">
              استثناهای {selectedRoom.name}
            </h2>
            <form
              action={createMeetingRoomScheduleExceptionAction}
              className="grid gap-3 rounded-md border bg-background p-4 md:grid-cols-6"
            >
              <input name="roomId" type="hidden" value={selectedRoom.id} />
              <input
                className="h-10 rounded-md border bg-background px-3"
                defaultValue={currentDateParam}
                dir="ltr"
                name="date"
                placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
                type="text"
              />
              <label className="flex items-center gap-2 text-sm">
                <input defaultChecked name="isWorkingDay" type="checkbox" />
                قابل رزرو
              </label>
              <input
                className="h-10 rounded-md border bg-background px-3"
                dir="ltr"
                name="startTime"
                placeholder="09:00"
                type="text"
              />
              <input
                className="h-10 rounded-md border bg-background px-3"
                dir="ltr"
                name="endTime"
                placeholder="17:00"
                type="text"
              />
              <input
                className="h-10 rounded-md border bg-background px-3"
                name="reason"
                placeholder="دلیل"
                type="text"
              />
              <SubmitButton pendingLabel="در حال ثبت">ثبت استثنا</SubmitButton>
            </form>
            <div className="grid gap-3">
              {selectedRoom.exceptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  استثنایی برای این اتاق ثبت نشده است.
                </p>
              ) : (
                selectedRoom.exceptions.map((exception) => (
                  <form
                    action={updateMeetingRoomScheduleExceptionAction}
                    className="grid gap-3 rounded-md border bg-background p-4 md:grid-cols-6"
                    key={exception.id}
                  >
                    <input
                      name="exceptionId"
                      type="hidden"
                      value={exception.id}
                    />
                    <div className="text-sm font-medium">
                      {formatJalaliDate(exception.date)}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        defaultChecked={exception.isWorkingDay}
                        name="isWorkingDay"
                        type="checkbox"
                      />
                      قابل رزرو
                    </label>
                    <input
                      className="h-10 rounded-md border bg-background px-3"
                      defaultValue={exception.startTime ?? ""}
                      dir="ltr"
                      name="startTime"
                      type="text"
                    />
                    <input
                      className="h-10 rounded-md border bg-background px-3"
                      defaultValue={exception.endTime ?? ""}
                      dir="ltr"
                      name="endTime"
                      type="text"
                    />
                    <input
                      className="h-10 rounded-md border bg-background px-3"
                      defaultValue={exception.reason ?? ""}
                      name="reason"
                      type="text"
                    />
                    <div className="flex gap-2">
                      <SubmitButton pendingLabel="در حال ذخیره">
                        ذخیره
                      </SubmitButton>
                      <Button
                        formAction={deleteMeetingRoomScheduleExceptionAction}
                        name="exceptionId"
                        type="submit"
                        value={exception.id}
                        variant="outline"
                      >
                        حذف
                      </Button>
                    </div>
                  </form>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
