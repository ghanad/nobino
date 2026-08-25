import { redirect } from "next/navigation";

type DeskReportPageProps = {
  searchParams?: Promise<{
    date?: string;
    period?: string;
  }>;
};

export default async function DeskReportPage({ searchParams }: DeskReportPageProps) {
  const params = await searchParams;
  const search = new URLSearchParams();

  search.set("view", "desk");

  if (params?.period) {
    search.set("period", params.period);
  }

  if (params?.date) {
    search.set("date", params.date);
  }

  redirect(`/manager/reports?${search.toString()}`);
}
