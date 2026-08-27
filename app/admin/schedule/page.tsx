import { redirect } from "next/navigation";

type AdminSchedulePageProps = {
  searchParams?: Promise<{
    error?: string;
    exceptionCreated?: string;
    exceptionDeleted?: string;
    exceptionUpdated?: string;
    holidayCreated?: string;
    holidayUpdated?: string;
    holidayDeleted?: string;
    holidayManualPreserved?: string;
    scheduleUpdated?: string;
    view?: string;
  }>;
};

export default async function AdminSchedulePage({
  searchParams,
}: AdminSchedulePageProps) {
  const params = await searchParams;
  const nextParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      nextParams.set(key, value);
    }
  }

  const query = nextParams.toString();
  redirect(query ? `/admin/calendar?${query}` : "/admin/calendar");
}
