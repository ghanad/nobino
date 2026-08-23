import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { SurveyPreview } from "@/components/surveys/survey-preview";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canEditSurveyDraft,
  isSurveyManager,
  type SurveyActorUser,
} from "@/lib/survey-permissions";
import { resolveSurveyActor } from "@/lib/survey-service/shared";

type SurveyPreviewPageProps = {
  params: Promise<{ surveyId: string }>;
};

export default async function SurveyPreviewPage({
  params,
}: SurveyPreviewPageProps) {
  const parsedParams = z
    .object({ surveyId: z.string().min(1).max(128) })
    .safeParse(await params);
  if (!parsedParams.success) {
    notFound();
  }

  const { surveyId } = parsedParams.data;
  const user = await requireCurrentUser();
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      title: true,
      description: true,
      identityMode: true,
      kind: true,
      state: true,
      ownerId: true,
      questions: {
        select: {
          id: true,
          prompt: true,
          helpText: true,
          type: true,
          required: true,
          sortOrder: true,
          randomizeOptions: true,
          ratingMin: true,
          ratingMax: true,
          ratingMinLabel: true,
          ratingMaxLabel: true,
          maxSelections: true,
          options: {
            select: { id: true, label: true, sortOrder: true },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
          targetCondition: {
            select: {
              sourceQuestionId: true,
              sourceQuestion: { select: { prompt: true } },
              sourceOptionId: true,
              sourceOption: { select: { label: true } },
              operator: true,
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!survey) {
    notFound();
  }

  const actorUser: SurveyActorUser = {
    role: user.role,
    active: user.active,
    canCreateSurveys: user.canCreateSurveys,
  };
  const actor = await resolveSurveyActor(db, {
    actorUserId: user.id,
    surveyId: survey.id,
    ownerId: survey.ownerId,
    user: actorUser,
  });

  if (!canEditSurveyDraft(actor, survey.state) && !isSurveyManager(actor)) {
    redirect("/surveys");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8" dir="rtl">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold sm:text-2xl">پیش‌نمایش نظرسنجی</h1>
          <p className="text-sm text-muted-foreground">
            نمایی از فرم برای شرکت‌کنندگان، بدون ثبت پاسخ
          </p>
        </div>
        <Button asChild size="sm" type="button" variant="outline">
          <Link href={`/surveys/${survey.id}/edit`}>
            <ArrowRight className="h-4 w-4" />
            بازگشت به ویرایش
          </Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-2xl pb-8">
        <SurveyPreview
          description={survey.description}
          identityMode={survey.identityMode}
          isAnonymous={survey.identityMode === "ANONYMOUS"}
          surveyId={survey.id}
          surveyKind={survey.kind}
          questions={survey.questions.map((question) => ({
            ...question,
            condition: question.targetCondition
              ? {
                  sourceQuestionId:
                    question.targetCondition.sourceQuestionId,
                  sourceQuestionPrompt:
                    question.targetCondition.sourceQuestion.prompt,
                  sourceOptionId: question.targetCondition.sourceOptionId,
                  sourceOptionLabel:
                    question.targetCondition.sourceOption.label,
                  operator: question.targetCondition.operator,
                }
              : null,
          }))}
          title={survey.title}
        />
      </main>
    </div>
  );
}
