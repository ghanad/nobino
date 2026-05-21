import { ReservationStatus } from "@prisma/client";

import { createReservationAction } from "@/app/reservations/actions";
import { CreateReservationForm } from "@/components/reservation/create-reservation-form";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type ReservationsPageProps = {
  searchParams?: Promise<{
    created?: string;
    error?: string;
  }>;
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatusClass(status: ReservationStatus): string {
  if (status === ReservationStatus.PENDING) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === ReservationStatus.APPROVED) {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }

  return "bg-muted text-muted-foreground ring-border";
}

export default async function ReservationsPage({
  searchParams,
}: ReservationsPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const [resourcePools, reservations] = await Promise.all([
    db.resourcePool.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        capacity: true,
      },
    }),
    db.reservation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        reason: true,
        resourcePool: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  return (
    <div className="grid gap-6">
      {params?.created ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Reservation request created and sent for manager approval.
        </div>
      ) : null}

      {params?.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {params.error}
        </div>
      ) : null}

      <CreateReservationForm
        action={createReservationAction}
        resourcePools={resourcePools}
      />

      <section className="rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">My recent requests</h2>
          <p className="text-sm text-muted-foreground">
            Pending requests are visible here but do not consume capacity.
          </p>
        </div>

        {reservations.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">
            No reservation requests yet.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="pb-3 font-medium">Pool</th>
                  <th className="pb-3 font-medium">Start</th>
                  <th className="pb-3 font-medium">End</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td className="py-3">{reservation.resourcePool.name}</td>
                    <td className="py-3">{formatDateTime(reservation.startAt)}</td>
                    <td className="py-3">{formatDateTime(reservation.endAt)}</td>
                    <td className="py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClass(
                          reservation.status,
                        )}`}
                      >
                        {reservation.status}
                      </span>
                    </td>
                    <td className="max-w-72 truncate py-3 text-muted-foreground">
                      {reservation.reason || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
