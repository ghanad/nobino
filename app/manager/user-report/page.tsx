import { redirect } from "next/navigation";

type UserReportPageProps = {
  searchParams?: Promise<{
    date?: string;
    period?: string;
  }>;
};

export default async function UserReportPage({ searchParams }: UserReportPageProps) {
  const params = await searchParams;
  const search = new URLSearchParams();

  search.set("view", "user");

  if (params?.period) {
    search.set("period", params.period);
  }

  if (params?.date) {
    search.set("date", params.date);
  }

  redirect(`/manager/reports?${search.toString()}`);
}
