import "server-only";

import {
  SurveyQuestionType,
  SurveyState,
  type Prisma,
} from "@prisma/client";

import { db } from "@/lib/db";
import { canEditSurveyDraft } from "@/lib/survey-permissions";
import type { SurveyActor } from "@/lib/survey-permissions";
import {
  SurveyServiceError,
  loadActiveActorUser,
  resolveSurveyActor,
  type DbClient,
} from "@/lib/survey-service/shared";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function normalizeQuestionSortOrder(
  surveyId: string,
  tx: DbClient,
): Promise<void> {
  const questions = await tx.surveyQuestion.findMany({
    where: { surveyId },
    select: { id: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  for (let i = 0; i < questions.length; i++) {
    if (questions[i].sortOrder !== i) {
      await tx.surveyQuestion.update({
        where: { id: questions[i].id },
        data: { sortOrder: i },
      });
    }
  }
}

async function normalizeOptionSortOrder(
  questionId: string,
  tx: DbClient,
): Promise<void> {
  const options = await tx.surveyOption.findMany({
    where: { questionId },
    select: { id: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  for (let i = 0; i < options.length; i++) {
    if (options[i].sortOrder !== i) {
      await tx.surveyOption.update({
        where: { id: options[i].id },
        data: { sortOrder: i },
      });
    }
  }
}

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────

function assertQuestionTypeConfig(
  type: SurveyQuestionType,
  config: {
    ratingMin?: number | null | undefined;
    ratingMax?: number | null | undefined;
    ratingMinLabel?: string | null | undefined;
    ratingMaxLabel?: string | null | undefined;
    maxSelections?: number | null | undefined;
    randomizeOptions?: boolean | null | undefined;
  },
): void {
  const hasRatingConfig =
    config.ratingMin !== null && config.ratingMin !== undefined ||
    config.ratingMax !== null && config.ratingMax !== undefined ||
    config.ratingMinLabel !== null && config.ratingMinLabel !== undefined ||
    config.ratingMaxLabel !== null && config.ratingMaxLabel !== undefined;

  if (type === SurveyQuestionType.RATING) {
    const min = config.ratingMin;
    const max = config.ratingMax;

    if (
      min === null ||
      min === undefined ||
      max === null ||
      max === undefined
    ) {
      throw new SurveyServiceError("Rating bounds are required.");
    }
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new SurveyServiceError("Rating bounds must be integers.");
    }
    if (min < 0 || max > 10) {
      throw new SurveyServiceError(
        "Rating bounds must be between 0 and 10.",
      );
    }
    if (min >= max) {
      throw new SurveyServiceError(
        "Rating minimum must be less than maximum.",
      );
    }
  } else if (hasRatingConfig) {
    throw new SurveyServiceError(
      "Rating configuration is only valid for rating questions.",
    );
  }

  if (type === SurveyQuestionType.MULTIPLE_CHOICE) {
    if (
      config.maxSelections !== null &&
      config.maxSelections !== undefined
    ) {
      if (
        !Number.isInteger(config.maxSelections) ||
        config.maxSelections < 1
      ) {
        throw new SurveyServiceError(
          "Maximum selections must be a positive integer.",
        );
      }
    }
  } else if (
    config.maxSelections !== null &&
    config.maxSelections !== undefined
  ) {
    throw new SurveyServiceError(
      "Maximum selections is only valid for multiple choice questions.",
    );
  }

  const isChoiceType =
    type === SurveyQuestionType.SINGLE_CHOICE ||
    type === SurveyQuestionType.MULTIPLE_CHOICE;

  if (!isChoiceType && config.randomizeOptions) {
    throw new SurveyServiceError(
      "Option randomization is only valid for choice questions.",
    );
  }
}

function isChoiceQuestionType(type: SurveyQuestionType): boolean {
  return (
    type === SurveyQuestionType.SINGLE_CHOICE ||
    type === SurveyQuestionType.MULTIPLE_CHOICE
  );
}

async function auditConditionCleanup(
  input: {
    actorUserId: string;
    surveyId: string;
    where: Prisma.SurveyQuestionConditionWhereInput;
  },
  tx: DbClient,
): Promise<void> {
  const conditions = await tx.surveyQuestionCondition.findMany({
    where: input.where,
    select: {
      id: true,
      targetQuestionId: true,
      sourceQuestionId: true,
      sourceOptionId: true,
    },
  });

  for (const condition of conditions) {
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: input.surveyId,
        action: "SURVEY_CONDITION_REMOVED",
        oldValue: {
          conditionId: condition.id,
          targetQuestionId: condition.targetQuestionId,
          sourceQuestionId: condition.sourceQuestionId,
          sourceOptionId: condition.sourceOptionId,
        },
      },
    });
  }
}

// ──────────────────────────────────────────────
// Selects
// ──────────────────────────────────────────────

const questionSelect = {
  id: true,
  surveyId: true,
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
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SurveyQuestionSelect;

const optionSelect = {
  id: true,
  questionId: true,
  label: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SurveyOptionSelect;

// ──────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────

async function authEditDraft(
  input: { actorUserId: string; surveyId: string },
  tx: DbClient,
): Promise<SurveyActor> {
  const user = await loadActiveActorUser(input.actorUserId, tx);

  const survey = await tx.survey.findUnique({
    where: { id: input.surveyId },
    select: { id: true, state: true, ownerId: true },
  });

  if (!survey) {
    throw new SurveyServiceError("Survey was not found.");
  }

  const actor = await resolveSurveyActor(tx, {
    actorUserId: input.actorUserId,
    surveyId: survey.id,
    ownerId: survey.ownerId,
    user,
  });

  if (!canEditSurveyDraft(actor, survey.state)) {
    throw new SurveyServiceError(
      survey.state === SurveyState.DRAFT
        ? "You do not have permission to edit this survey."
        : "Published survey content cannot be edited.",
    );
  }

  return actor;
}

// ──────────────────────────────────────────────
// Question operations
// ──────────────────────────────────────────────

export async function addQuestion(input: {
  actorUserId: string;
  surveyId: string;
  prompt: string;
  helpText?: string | null;
  type: SurveyQuestionType;
  required?: boolean;
  randomizeOptions?: boolean;
  ratingMin?: number | null;
  ratingMax?: number | null;
  ratingMinLabel?: string | null;
  ratingMaxLabel?: string | null;
  maxSelections?: number | null;
}) {
  const prompt = input.prompt.trim();
  const ratingMinLabel = input.ratingMinLabel?.trim() || null;
  const ratingMaxLabel = input.ratingMaxLabel?.trim() || null;
  const ratingMin =
    input.type === SurveyQuestionType.RATING ? (input.ratingMin ?? 1) : null;
  const ratingMax =
    input.type === SurveyQuestionType.RATING ? (input.ratingMax ?? 5) : null;

  if (!prompt) {
    throw new SurveyServiceError("Question prompt is required.");
  }

  assertQuestionTypeConfig(input.type, {
    ratingMin:
      input.type === SurveyQuestionType.RATING ? ratingMin : input.ratingMin,
    ratingMax:
      input.type === SurveyQuestionType.RATING ? ratingMax : input.ratingMax,
    ratingMinLabel,
    ratingMaxLabel,
    maxSelections: input.maxSelections,
    randomizeOptions: input.randomizeOptions,
  });

  return db.$transaction(async (tx) => {
    await authEditDraft(
      { actorUserId: input.actorUserId, surveyId: input.surveyId },
      tx,
    );

    await normalizeQuestionSortOrder(input.surveyId, tx);
    const sortOrder = await tx.surveyQuestion.count({
      where: { surveyId: input.surveyId },
    });

    const question = await tx.surveyQuestion.create({
      data: {
        surveyId: input.surveyId,
        prompt,
        helpText: input.helpText?.trim() || null,
        type: input.type,
        required: input.required ?? false,
        sortOrder,
        randomizeOptions: input.randomizeOptions ?? false,
        ratingMin,
        ratingMax,
        ratingMinLabel:
          input.type === SurveyQuestionType.RATING ? ratingMinLabel : null,
        ratingMaxLabel:
          input.type === SurveyQuestionType.RATING ? ratingMaxLabel : null,
        maxSelections: input.maxSelections ?? null,
      },
      select: questionSelect,
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: input.surveyId,
        action: "SURVEY_QUESTION_ADDED",
        newValue: {
          questionId: question.id,
          type: question.type,
          prompt: question.prompt,
        },
      },
    });

    return question;
  });
}

export async function updateQuestion(input: {
  actorUserId: string;
  surveyId: string;
  questionId: string;
  type?: SurveyQuestionType;
  prompt?: string;
  helpText?: string | null;
  required?: boolean;
  randomizeOptions?: boolean;
  ratingMin?: number | null;
  ratingMax?: number | null;
  ratingMinLabel?: string | null;
  ratingMaxLabel?: string | null;
  maxSelections?: number | null;
}) {
  return db.$transaction(async (tx) => {
    await authEditDraft(
      { actorUserId: input.actorUserId, surveyId: input.surveyId },
      tx,
    );

    const question = await tx.surveyQuestion.findUnique({
      where: { id: input.questionId },
      select: {
        id: true,
        surveyId: true,
        type: true,
        prompt: true,
        ratingMin: true,
        ratingMax: true,
        ratingMinLabel: true,
        ratingMaxLabel: true,
        maxSelections: true,
        randomizeOptions: true,
      },
    });

    if (!question) {
      throw new SurveyServiceError("Question was not found.");
    }

    if (question.surveyId !== input.surveyId) {
      throw new SurveyServiceError(
        "Cross-survey question ID is not allowed.",
      );
    }

    const nextType = input.type ?? question.type;
    const nextIsChoice = isChoiceQuestionType(nextType);
    const changesFromChoiceToNonChoice =
      isChoiceQuestionType(question.type) && !nextIsChoice;
    const ratingMinLabel =
      input.ratingMinLabel === undefined
        ? question.ratingMinLabel
        : input.ratingMinLabel?.trim() || null;
    const ratingMaxLabel =
      input.ratingMaxLabel === undefined
        ? question.ratingMaxLabel
        : input.ratingMaxLabel?.trim() || null;
    const ratingMin =
      nextType === SurveyQuestionType.RATING
        ? input.ratingMin !== undefined
          ? input.ratingMin
          : question.type === SurveyQuestionType.RATING
            ? question.ratingMin
            : 1
        : null;
    const ratingMax =
      nextType === SurveyQuestionType.RATING
        ? input.ratingMax !== undefined
          ? input.ratingMax
          : question.type === SurveyQuestionType.RATING
            ? question.ratingMax
            : 5
        : null;
    const maxSelections =
      nextType === SurveyQuestionType.MULTIPLE_CHOICE
        ? input.maxSelections !== undefined
          ? input.maxSelections
          : question.type === SurveyQuestionType.MULTIPLE_CHOICE
            ? question.maxSelections
            : null
        : null;
    const randomizeOptions = nextIsChoice
      ? input.randomizeOptions !== undefined
        ? input.randomizeOptions
        : isChoiceQuestionType(question.type)
          ? question.randomizeOptions
          : false
      : false;

    assertQuestionTypeConfig(nextType, {
      ratingMin:
        nextType === SurveyQuestionType.RATING ? ratingMin : input.ratingMin,
      ratingMax:
        nextType === SurveyQuestionType.RATING ? ratingMax : input.ratingMax,
      ratingMinLabel:
        nextType === SurveyQuestionType.RATING
          ? ratingMinLabel
          : input.ratingMinLabel?.trim() || null,
      ratingMaxLabel:
        nextType === SurveyQuestionType.RATING
          ? ratingMaxLabel
          : input.ratingMaxLabel?.trim() || null,
      maxSelections:
        nextType === SurveyQuestionType.MULTIPLE_CHOICE
          ? maxSelections
          : input.maxSelections,
      randomizeOptions:
        nextIsChoice ? randomizeOptions : input.randomizeOptions,
    });

    const data: Prisma.SurveyQuestionUpdateInput = {};

    if (input.type !== undefined) {
      data.type = input.type;
    }

    if (input.prompt !== undefined) {
      const trimmed = input.prompt.trim();
      if (!trimmed) {
        throw new SurveyServiceError("Question prompt is required.");
      }
      data.prompt = trimmed;
    }

    if (input.helpText !== undefined) {
      data.helpText = input.helpText?.trim() || null;
    }

    if (input.required !== undefined) {
      data.required = input.required;
    }

    data.randomizeOptions = randomizeOptions;
    data.ratingMin = ratingMin;
    data.ratingMax = ratingMax;
    data.ratingMinLabel =
      nextType === SurveyQuestionType.RATING ? ratingMinLabel : null;
    data.ratingMaxLabel =
      nextType === SurveyQuestionType.RATING ? ratingMaxLabel : null;
    data.maxSelections = maxSelections;

    if (changesFromChoiceToNonChoice) {
      await auditConditionCleanup(
        {
          actorUserId: input.actorUserId,
          surveyId: input.surveyId,
          where: { sourceOption: { questionId: question.id } },
        },
        tx,
      );
      await tx.surveyOption.deleteMany({
        where: { questionId: question.id },
      });
    }

    const updated = await tx.surveyQuestion.update({
      where: { id: question.id },
      data,
      select: questionSelect,
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: input.surveyId,
        action: "SURVEY_QUESTION_UPDATED",
        oldValue: {
          questionId: question.id,
          type: question.type,
          prompt: question.prompt,
        },
        newValue: {
          questionId: updated.id,
          type: updated.type,
          prompt: updated.prompt,
        },
      },
    });

    return updated;
  });
}

export async function deleteQuestion(input: {
  actorUserId: string;
  surveyId: string;
  questionId: string;
}) {
  return db.$transaction(async (tx) => {
    await authEditDraft(
      { actorUserId: input.actorUserId, surveyId: input.surveyId },
      tx,
    );

    const question = await tx.surveyQuestion.findUnique({
      where: { id: input.questionId },
      select: { id: true, surveyId: true, prompt: true, type: true },
    });

    if (!question) {
      throw new SurveyServiceError("Question was not found.");
    }

    if (question.surveyId !== input.surveyId) {
      throw new SurveyServiceError(
        "Cross-survey question ID is not allowed.",
      );
    }

    await auditConditionCleanup(
      {
        actorUserId: input.actorUserId,
        surveyId: input.surveyId,
        where: {
          OR: [
            { sourceQuestionId: question.id },
            { targetQuestionId: question.id },
            { sourceOption: { questionId: question.id } },
          ],
        },
      },
      tx,
    );

    // Cascade delete removes options, conditions, and answers
    await tx.surveyQuestion.delete({ where: { id: question.id } });

    await normalizeQuestionSortOrder(input.surveyId, tx);

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: input.surveyId,
        action: "SURVEY_QUESTION_DELETED",
        oldValue: {
          questionId: question.id,
          prompt: question.prompt,
          type: question.type,
        },
      },
    });
  });
}

export async function reorderQuestions(input: {
  actorUserId: string;
  surveyId: string;
  questionIds: string[];
}) {
  return db.$transaction(async (tx) => {
    await authEditDraft(
      { actorUserId: input.actorUserId, surveyId: input.surveyId },
      tx,
    );

    const existingQuestions = await tx.surveyQuestion.findMany({
      where: { surveyId: input.surveyId },
      select: { id: true },
    });

    const existingIds = new Set(existingQuestions.map((q) => q.id));

    if (input.questionIds.length !== existingIds.size) {
      throw new SurveyServiceError(
        "The reordered question list must contain all questions.",
      );
    }

    for (const id of input.questionIds) {
      if (!existingIds.has(id)) {
        throw new SurveyServiceError(
          "Cross-survey question ID is not allowed in the reordered list.",
        );
      }
    }

    if (new Set(input.questionIds).size !== input.questionIds.length) {
      throw new SurveyServiceError(
        "Duplicate question IDs are not allowed in the reordered list.",
      );
    }

    for (let i = 0; i < input.questionIds.length; i++) {
      await tx.surveyQuestion.update({
        where: { id: input.questionIds[i] },
        data: { sortOrder: i },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: input.surveyId,
        action: "SURVEY_QUESTIONS_REORDERED",
        newValue: { questionIds: input.questionIds },
      },
    });
  });
}

// ──────────────────────────────────────────────
// Option operations
// ──────────────────────────────────────────────

export async function addOption(input: {
  actorUserId: string;
  surveyId: string;
  questionId: string;
  label: string;
}) {
  const label = input.label.trim();

  if (!label) {
    throw new SurveyServiceError("Option label is required.");
  }

  return db.$transaction(async (tx) => {
    await authEditDraft(
      { actorUserId: input.actorUserId, surveyId: input.surveyId },
      tx,
    );

    const question = await tx.surveyQuestion.findUnique({
      where: { id: input.questionId },
      select: { id: true, surveyId: true, type: true },
    });

    if (!question) {
      throw new SurveyServiceError("Question was not found.");
    }

    if (question.surveyId !== input.surveyId) {
      throw new SurveyServiceError(
        "Cross-survey question ID is not allowed.",
      );
    }

    if (!isChoiceQuestionType(question.type)) {
      throw new SurveyServiceError(
        "Options can only be added to choice questions.",
      );
    }

    const existing = await tx.surveyOption.findFirst({
      where: { questionId: question.id, label },
    });

    if (existing) {
      throw new SurveyServiceError(
        "An option with this label already exists for this question.",
      );
    }

    await normalizeOptionSortOrder(question.id, tx);
    const sortOrder = await tx.surveyOption.count({
      where: { questionId: question.id },
    });

    const option = await tx.surveyOption.create({
      data: {
        questionId: question.id,
        label,
        sortOrder,
      },
      select: optionSelect,
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: input.surveyId,
        action: "SURVEY_OPTION_ADDED",
        newValue: {
          optionId: option.id,
          questionId: question.id,
          label: option.label,
        },
      },
    });

    return option;
  });
}

export async function updateOption(input: {
  actorUserId: string;
  surveyId: string;
  questionId: string;
  optionId: string;
  label: string;
}) {
  const label = input.label.trim();

  if (!label) {
    throw new SurveyServiceError("Option label is required.");
  }

  return db.$transaction(async (tx) => {
    await authEditDraft(
      { actorUserId: input.actorUserId, surveyId: input.surveyId },
      tx,
    );

    const option = await tx.surveyOption.findUnique({
      where: { id: input.optionId },
      select: {
        id: true,
        questionId: true,
        label: true,
        question: { select: { surveyId: true } },
      },
    });

    if (!option) {
      throw new SurveyServiceError("Option was not found.");
    }

    if (option.question.surveyId !== input.surveyId) {
      throw new SurveyServiceError(
        "Cross-survey option ID is not allowed.",
      );
    }

    if (option.questionId !== input.questionId) {
      throw new SurveyServiceError(
        "Option does not belong to the specified question.",
      );
    }

    const existing = await tx.surveyOption.findFirst({
      where: {
        questionId: option.questionId,
        label,
        id: { not: option.id },
      },
    });

    if (existing) {
      throw new SurveyServiceError(
        "An option with this label already exists for this question.",
      );
    }

    const updated = await tx.surveyOption.update({
      where: { id: option.id },
      data: { label },
      select: optionSelect,
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: input.surveyId,
        action: "SURVEY_OPTION_UPDATED",
        oldValue: { optionId: option.id, label: option.label },
        newValue: { optionId: updated.id, label: updated.label },
      },
    });

    return updated;
  });
}

export async function deleteOption(input: {
  actorUserId: string;
  surveyId: string;
  questionId: string;
  optionId: string;
}) {
  return db.$transaction(async (tx) => {
    await authEditDraft(
      { actorUserId: input.actorUserId, surveyId: input.surveyId },
      tx,
    );

    const option = await tx.surveyOption.findUnique({
      where: { id: input.optionId },
      select: {
        id: true,
        questionId: true,
        label: true,
        question: { select: { surveyId: true } },
      },
    });

    if (!option) {
      throw new SurveyServiceError("Option was not found.");
    }

    if (option.question.surveyId !== input.surveyId) {
      throw new SurveyServiceError(
        "Cross-survey option ID is not allowed.",
      );
    }

    if (option.questionId !== input.questionId) {
      throw new SurveyServiceError(
        "Option does not belong to the specified question.",
      );
    }

    await auditConditionCleanup(
      {
        actorUserId: input.actorUserId,
        surveyId: input.surveyId,
        where: { sourceOptionId: option.id },
      },
      tx,
    );

    // Cascade delete removes the conditions
    await tx.surveyOption.delete({ where: { id: option.id } });

    await normalizeOptionSortOrder(input.questionId, tx);

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: input.surveyId,
        action: "SURVEY_OPTION_DELETED",
        oldValue: {
          optionId: option.id,
          questionId: option.questionId,
          label: option.label,
        },
      },
    });
  });
}

export async function reorderOptions(input: {
  actorUserId: string;
  surveyId: string;
  questionId: string;
  optionIds: string[];
}) {
  return db.$transaction(async (tx) => {
    await authEditDraft(
      { actorUserId: input.actorUserId, surveyId: input.surveyId },
      tx,
    );

    const question = await tx.surveyQuestion.findUnique({
      where: { id: input.questionId },
      select: { id: true, surveyId: true },
    });

    if (!question) {
      throw new SurveyServiceError("Question was not found.");
    }

    if (question.surveyId !== input.surveyId) {
      throw new SurveyServiceError(
        "Cross-survey question ID is not allowed.",
      );
    }

    const existingOptions = await tx.surveyOption.findMany({
      where: { questionId: question.id },
      select: { id: true },
    });

    const existingIds = new Set(existingOptions.map((o) => o.id));

    if (input.optionIds.length !== existingIds.size) {
      throw new SurveyServiceError(
        "The reordered option list must contain all options.",
      );
    }

    for (const id of input.optionIds) {
      if (!existingIds.has(id)) {
        throw new SurveyServiceError(
          "Cross-survey or unknown option ID is not allowed in the reordered list.",
        );
      }
    }

    if (new Set(input.optionIds).size !== input.optionIds.length) {
      throw new SurveyServiceError(
        "Duplicate option IDs are not allowed in the reordered list.",
      );
    }

    for (let i = 0; i < input.optionIds.length; i++) {
      await tx.surveyOption.update({
        where: { id: input.optionIds[i] },
        data: { sortOrder: i },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: input.surveyId,
        action: "SURVEY_OPTIONS_REORDERED",
        newValue: {
          questionId: question.id,
          optionIds: input.optionIds,
        },
      },
    });
  });
}

export async function assertSurveyQuestionsReadyForPublish(
  surveyId: string,
  tx: DbClient,
): Promise<void> {
  const questions = await tx.surveyQuestion.findMany({
    where: { surveyId },
    select: {
      type: true,
      randomizeOptions: true,
      ratingMin: true,
      ratingMax: true,
      ratingMinLabel: true,
      ratingMaxLabel: true,
      maxSelections: true,
      options: {
        select: { label: true },
      },
    },
  });

  for (const question of questions) {
    assertQuestionTypeConfig(question.type, question);

    if (isChoiceQuestionType(question.type)) {
      const normalizedLabels = question.options.map((option) =>
        option.label.trim(),
      );

      if (
        normalizedLabels.length < 2 ||
        normalizedLabels.some((label) => label.length === 0) ||
        new Set(normalizedLabels).size !== normalizedLabels.length
      ) {
        throw new SurveyServiceError(
          "Choice questions require at least two non-empty unique options before publishing.",
        );
      }

      if (
        question.type === SurveyQuestionType.MULTIPLE_CHOICE &&
        question.maxSelections !== null &&
        question.maxSelections > normalizedLabels.length
      ) {
        throw new SurveyServiceError(
          "Maximum selections cannot exceed the number of options.",
        );
      }
    } else if (question.options.length > 0) {
      throw new SurveyServiceError(
        "Non-choice questions cannot retain options.",
      );
    }
  }
}
