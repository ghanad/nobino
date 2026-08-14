import { ReservationStatus, UserRole } from "@prisma/client";

import {
  approveMeetingRoomReservationAction,
  cancelMeetingRoomReservationByManagerAction,
  rejectMeetingRoomReservationAction,
} from "@/app/manager/meeting-rooms/actions";
import { ManagerMeetingRoomReservations } from "@/app/manager/meeting-rooms/manager-meeting-room-reservations";
import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function ManagerMeetingRoomsPage() {
  await requireRole([UserRole.MANAGER, UserRole.ADMIN]);

  const [reservations, rooms] = await Promise.all([
    db.meetingRoomReservation.findMany({
      where: {
        status: {
          in: [ReservationStatus.PENDING, ReservationStatus.APPROVED],
        },
      },
      orderBy: [{ status: "desc" }, { startAt: "asc" }],
      select: {
        endAt: true,
        id: true,
        roomId: true,
        startAt: true,
        status: true,
        title: true,
        room: {
          select: {
            name: true,
          },
        },
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    }),
    db.meetingRoom.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <PageHeader
        subtitle="بررسی و مدیریت درخواست‌های رزرو اتاق جلسه"
        title="مدیریت رزرو اتاق‌های جلسه"
      />
      <ManagerMeetingRoomReservations
        actions={{
          approve: approveMeetingRoomReservationAction,
          cancel: cancelMeetingRoomReservationByManagerAction,
          reject: rejectMeetingRoomReservationAction,
        }}
        initialReservations={reservations}
        rooms={rooms}
      />
    </div>
  );
}
