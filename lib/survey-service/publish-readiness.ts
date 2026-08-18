import "server-only";

import { SurveyIdentityMode, SurveyKind, SurveyState } from "@prisma/client";

import { db } from "@/lib/db";
import { assertSurveyMetadataReadyForPublish } from "@/lib/survey-service/metadata";

type ReadinessIssue = {
  category: "schedule" | "audience" | "questions" | "branching" | "privacy";
  severity: "error" | "warning";
  message: string;
};

export type PublishReadinessReport = {
  ready: boolean;
  issues: ReadinessIssue[];
  recipientCount: number;
  questionCount: number;
  hasAnonymousThreshold: boolean;
  isVoteKind: boolean;
};

/**
 * Checks whether a draft survey is ready to publish and returns a structured
 * readiness report.  This never throws — every problem is recorded as an
 * issue so the UI can display a complete summary.
 */
export async function checkPublishReadiness(
  surveyId: string,
): Promise<PublishReadinessReport> {
  const issues: ReadinessIssue[] = [];

  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      state: true,
      title: true,
      description: true,
      kind: true,
      identityMode: true,
      startsAt: true,
      endsAt: true,
      audienceMode: true,
    },
  });

  if (!survey) {
    return {
      ready: false,
      issues: [
        {
          category: "schedule",
          severity: "error",
          message: "نظرسنجی یافت نشد.",
        },
      ],
      recipientCount: 0,
      questionCount: 0,
      hasAnonymousThreshold: false,
      isVoteKind: false,
    };
  }

  const isVoteKind = survey.kind === SurveyKind.VOTE;
  const isAnonymous = survey.identityMode === SurveyIdentityMode.ANONYMOUS;

  // ── Metadata validation ──
  try {
    assertSurveyMetadataReadyForPublish({
      title: survey.title,
      description: survey.description,
    });
  } catch {
    issues.push({
      category: "questions",
      severity: "error",
      message: "عنوان یا توضیحات نظرسنجی معتبر نیست.",
    });
  }

  // ── Schedule ──
  if (!survey.startsAt || !survey.endsAt) {
    issues.push({
      category: "schedule",
      severity: "error",
      message: "تاریخ و ساعت شروع و پایان باید مشخص شوند.",
    });
  } else if (survey.endsAt.getTime() <= survey.startsAt.getTime()) {
    issues.push({
      category: "schedule",
      severity: "error",
      message: "زمان پایان باید بعد از زمان شروع باشد.",
    });
  }

  // ── Questions ──
  const questions = await db.surveyQuestion.findMany({
    where: { surveyId },
    select: {
      id: true,
      prompt: true,
      type: true,
      options: { select: { id: true } },
      targetCondition: { select: { id: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const questionCount = questions.length;

  if (questionCount < 1) {
    issues.push({
      category: "questions",
      severity: "error",
      message: "حداقل یک سوال باید اضافه شود.",
    });
  }

  for (const q of questions) {
    if (!q.prompt.trim()) {
      issues.push({
        category: "questions",
        severity: "error",
        message: "متن یک سوال خالی است.",
      });
    }

    // Choice questions need at least 2 options
    if (
      (q.type === "SINGLE_CHOICE" || q.type === "MULTIPLE_CHOICE") &&
      q.options.length < 2
    ) {
      issues.push({
        category: "questions",
        severity: "error",
        message: `سوال "${q.prompt.slice(0, 40)}" حداقل به ۲ گزینه نیاز دارد.`,
      });
    }
  }

  // ── Branching ──
  const conditions = await db.surveyQuestionCondition.findMany({
    where: { targetQuestion: { surveyId } },
    select: {
      id: true,
      sourceQuestionId: true,
      sourceOption: { select: { questionId: true } },
      targetQuestion: { select: { id: true, prompt: true } },
    },
  });

  for (const cond of conditions) {
    // Source option must belong to the source question
    if (cond.sourceOption.questionId !== cond.sourceQuestionId) {
      issues.push({
        category: "branching",
        severity: "error",
        message: `شرط نمایش سوال "${cond.targetQuestion.prompt.slice(0, 40)}" نامعتبر است: گزینه منبع به سوال دیگری تعلق دارد.`,
      });
    }
  }

  // ── Audience ──
  const audienceUserIds = await resolveAudienceCount(surveyId);
  const recipientCount = audienceUserIds.length;

  if (recipientCount < 1) {
    issues.push({
      category: "audience",
      severity: "error",
      message: "حداقل یک دریافت‌کننده باید مشخص شود.",
    });
  }

  // ── Anonymous threshold ──
  const hasAnonymousThreshold = isAnonymous && recipientCount >= 5;

  if (isAnonymous && recipientCount < 5) {
    issues.push({
      category: "privacy",
      severity: "error",
      message: `نظرسنجی ناشناس حداقل به ۵ دریافت‌کننده نیاز دارد (در حال حاضر ${recipientCount} دریافت‌کننده).`,
    });
  }

  if (isAnonymous && recipientCount >= 5) {
    issues.push({
      category: "privacy",
      severity: "warning",
      message: `نتایج تا جمع‌آوری حداقل ۵ پاسخ نمایش داده نمی‌شوند.`,
    });
  }

  // ── Vote embargo ──
  if (isVoteKind) {
    issues.push({
      category: "privacy",
      severity: "warning",
      message:
        "نتایج رای‌گیری تا پایان یا بسته شدن نظرسنجی برای هیچ‌کس (حتی مدیر) قابل مشاهده نیست.",
    });
  }

  return {
    ready: issues.length === 0 || issues.every((i) => i.severity === "warning"),
    issues,
    recipientCount,
    questionCount,
    hasAnonymousThreshold,
    isVoteKind,
  };
}

async function resolveAudienceCount(
  surveyId: string,
): Promise<string[]> {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: { audienceMode: true },
  });

  if (!survey) return [];

  if (survey.audienceMode === "ALL_ACTIVE") {
    const users = await db.user.findMany({
      where: { active: true, deletedAt: null },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  // TARGETED
  const teamMembers = await db.team.findMany({
    where: { surveyAudienceSelections: { some: { surveyId } } },
    select: {
      members: {
        where: { user: { active: true, deletedAt: null } },
        select: { userId: true },
      },
    },
  });

  const teamMemberIds = new Set(
    teamMembers.flatMap((t) => t.members.map((m) => m.userId)),
  );

  const explicitUsers = await db.surveyAudienceUser.findMany({
    where: {
      surveyId,
      user: { active: true, deletedAt: null },
    },
    select: { userId: true },
  });

  for (const sel of explicitUsers) {
    teamMemberIds.add(sel.userId);
  }

  return [...teamMemberIds];
}
