import "server-only";

import { createHash } from "node:crypto";

import ExcelJS from "exceljs";
import { SurveyIdentityMode, SurveyQuestionType } from "@prisma/client";

import { db } from "@/lib/db";
import { formatJalaliDateTime } from "@/lib/jalali-date";
import { getSurveyIdentityLabel, getSurveyKindLabel } from "@/lib/survey-status";
import { getSurveyResultAccess } from "@/lib/survey-service/results";
import { SurveyServiceError } from "@/lib/survey-service/shared";

export const SURVEY_MULTI_CHOICE_SEPARATOR = " | ";

type SpreadsheetCell = string | number | null;

export type SurveyExportFile = {
  filename: string;
  content: Buffer;
};

export function escapeSpreadsheetText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/**
 * Builds the raw export only after S24 has made the authoritative disclosure
 * decision. The workbook is intentionally generated on the server.
 */
export async function exportSurveyResults(input: {
  actorUserId: string;
  surveyId: string;
  exportedAt?: Date;
}): Promise<SurveyExportFile> {
  const access = await getSurveyResultAccess({
    actorUserId: input.actorUserId,
    surveyId: input.surveyId,
  });

  if (access.availability !== "AVAILABLE") {
    throw new SurveyServiceError("Survey results are not available.", "ACCESS_DENIED");
  }

  const exportedAt = input.exportedAt ?? new Date();
  const anonymous = access.survey.identityMode === SurveyIdentityMode.ANONYMOUS;
  const questions = await db.surveyQuestion.findMany({
    where: { surveyId: access.survey.id },
    select: { id: true, prompt: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const responseSelect = {
    id: true,
    submittedAt: true,
    answers: {
      select: {
        questionId: true,
        textValue: true,
        numericValue: true,
        question: { select: { type: true } },
        selectedOptions: {
          select: { option: { select: { label: true, sortOrder: true, id: true } } },
        },
      },
    },
  };
  const responses = await db.surveyResponse.findMany({
    where: { surveyId: access.survey.id },
    select: anonymous
      ? responseSelect
      : {
          ...responseSelect,
          user: { select: { name: true, email: true } },
        },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nobino";
  workbook.created = exportedAt;

  const resultsSheet = workbook.addWorksheet("پاسخ‌ها");
  const headers = anonymous
    ? questions.map((question) => escapeSpreadsheetText(question.prompt))
    : ["نام پاسخ‌دهنده", "ایمیل", "زمان ثبت (جلالی)", ...questions.map((question) => escapeSpreadsheetText(question.prompt))];
  resultsSheet.addRow(headers);

  const questionIds = questions.map((question) => question.id);
  const sortedResponses = anonymous
    ? [...responses].sort((left, right) => anonymousRowKey(access.survey.id, left.id).localeCompare(anonymousRowKey(access.survey.id, right.id)))
    : [...responses].sort((left, right) => left.submittedAt.getTime() - right.submittedAt.getTime() || left.id.localeCompare(right.id));

  for (const response of sortedResponses) {
    const answers = new Map(response.answers.map((answer) => [answer.questionId, answer]));
    const values = questionIds.map((questionId) => toCellValue(answers.get(questionId)));
    const respondent: { name: string; email: string } | null = "user" in response
      ? response.user as { name: string; email: string } | null
      : null;
    const identityCells: SpreadsheetCell[] = anonymous
      ? []
      : [
          escapeSpreadsheetText(respondent?.name ?? ""),
          escapeSpreadsheetText(respondent?.email ?? ""),
          escapeSpreadsheetText(formatJalaliDateTime(response.submittedAt)),
        ];
    resultsSheet.addRow([...identityCells, ...values]);
  }

  const legendSheet = workbook.addWorksheet("راهنما");
  legendSheet.addRows([
    ["عنوان نظرسنجی", escapeSpreadsheetText(access.survey.title)],
    ["نوع نظرسنجی", getSurveyKindLabel(access.survey.kind)],
    ["شیوه هویت", getSurveyIdentityLabel(access.survey.identityMode)],
    ["زمان خروجی (جلالی)", escapeSpreadsheetText(formatJalaliDateTime(exportedAt))],
    ["جداکننده گزینه‌های چندانتخابی", SURVEY_MULTI_CHOICE_SEPARATOR],
  ]);

  for (const sheet of [resultsSheet, legendSheet]) {
    sheet.views = [{ rightToLeft: true }];
    sheet.columns.forEach((column) => {
      column.width = 24;
    });
  }

  const content = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    filename: `nobino-survey-results-${exportedAt.toISOString().slice(0, 10)}.xlsx`,
    content,
  };
}

function anonymousRowKey(surveyId: string, responseId: string): string {
  return createHash("sha256").update(`${surveyId}:${responseId}`).digest("hex");
}

function toCellValue(answer: {
  textValue: string | null;
  numericValue: number | null;
  question: { type: SurveyQuestionType };
  selectedOptions: Array<{ option: { label: string; sortOrder: number; id: string } }>;
} | undefined): SpreadsheetCell {
  if (!answer) {
    return "";
  }

  if (answer.question.type === SurveyQuestionType.SINGLE_CHOICE || answer.question.type === SurveyQuestionType.MULTIPLE_CHOICE) {
    return escapeSpreadsheetText(
      answer.selectedOptions
        .map((selected) => selected.option)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
        .map((option) => option.label)
        .join(SURVEY_MULTI_CHOICE_SEPARATOR),
    );
  }

  if (answer.question.type === SurveyQuestionType.RATING) {
    return answer.numericValue ?? "";
  }

  return escapeSpreadsheetText(answer.textValue ?? "");
}
