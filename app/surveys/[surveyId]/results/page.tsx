import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { SurveyResultsDisplay } from "@/components/surveys/survey-results-display";
import { requireCurrentUser } from "@/lib/auth";
import { getSurveyResults } from "@/lib/survey-service/results";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import { z } from "zod";

const routeParamsSchema = z.object({
  surveyId: z.string().min(1).max(128),
});

type SurveyResultsPageProps = {
  params: Promise<{ surveyId: string }>;
};

export default async function SurveyResultsPage({ params }: SurveyResultsPageProps) {
  const parsedParams = routeParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    notFound();
  }

  const user = await requireCurrentUser();

  try {
    const results = await getSurveyResults({
      actorUserId: user.id,
      surveyId: parsedParams.data.surveyId,
    });

    return (
      <div className="space-y-6" dir="rtl">
        <PageHeader title={`نتایج ${results.survey.title}`} subtitle="میزان مشارکت و پاسخ‌های قابل نمایش" />
        <SurveyResultsDisplay results={results} />
      </div>
    );
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      notFound();
    }
    throw error;
  }
}
