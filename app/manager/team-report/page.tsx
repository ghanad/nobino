import { redirect } from "next/navigation";

type TeamReportPageProps = {
  searchParams?: Promise<{
    date?: string;
    period?: string;
  }>;
};

export default async function TeamReportPage({ searchParams }: TeamReportPageProps) {
  const params = await searchParams;
  const search = new URLSearchParams();

  search.set("view", "team");

  if (params?.period) {
    search.set("period", params.period);
  }

  if (params?.date) {
    search.set("date", params.date);
  }

  redirect(`/manager/reports?${search.toString()}`);
}
