import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";
import {
  SurveyAudienceMode,
  SurveyIdentityMode,
  SurveyKind,
  SurveyQuestionType,
  SurveyState,
  UserRole,
} from "@prisma/client";

import { exportSurveyResults, SURVEY_MULTI_CHOICE_SEPARATOR } from "@/lib/survey-service/export-results";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import { adminId, db, passwordHash, registerBusinessRuleTestHooks, userId } from "./business-rules-helpers";

registerBusinessRuleTestHooks();

async function createExportSurvey(input: {
  kind?: SurveyKind;
  identityMode?: SurveyIdentityMode;
}) {
  return db.survey.create({
    data: {
      title: "نظرسنجی خروجی",
      kind: input.kind ?? SurveyKind.SATISFACTION,
      identityMode: input.identityMode ?? SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      state: SurveyState.PUBLISHED,
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
      ownerId: adminId,
    },
  });
}

async function addAnonymousResponse(surveyId: string, questionId: string, index: number) {
  const participantId = `anonymous-export-user-${index}`;
  await db.user.create({
    data: {
      id: participantId,
      email: `${participantId}@example.test`,
      name: `Anonymous Export User ${index}`,
      passwordHash,
      role: UserRole.USER,
    },
  });
  await db.surveyRecipient.create({ data: { surveyId, userId: participantId, hasSubmitted: true } });
  await db.surveyResponse.create({
    data: { surveyId, userId: null, answers: { create: { questionId, textValue: `پاسخ ${index}` } } },
  });
}

test("S26 export escapes formulas, preserves Persian, and joins multiple choices", async () => {
  const survey = await createExportSurvey({});
  const text = await db.surveyQuestion.create({
    data: { surveyId: survey.id, prompt: "=پرسش", type: SurveyQuestionType.LONG_TEXT, sortOrder: 1 },
  });
  const multiple = await db.surveyQuestion.create({
    data: { surveyId: survey.id, prompt: "انتخاب‌ها", type: SurveyQuestionType.MULTIPLE_CHOICE, sortOrder: 2 },
  });
  const first = await db.surveyOption.create({ data: { questionId: multiple.id, label: "=اول", sortOrder: 1 } });
  const second = await db.surveyOption.create({ data: { questionId: multiple.id, label: "+دوم", sortOrder: 2 } });
  await db.surveyResponse.create({
    data: {
      surveyId: survey.id,
      userId,
      answers: {
        create: [
          { questionId: text.id, textValue: "@متن فارسی" },
          { questionId: multiple.id, selectedOptions: { create: [{ optionId: second.id }, { optionId: first.id }] } },
        ],
      },
    },
  });

  const file = await exportSurveyResults({ actorUserId: adminId, surveyId: survey.id, exportedAt: new Date("2026-08-21T10:00:00Z") });
  assert.match(file.filename, /^nobino-survey-results-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.content as never);
  const resultSheet = workbook.getWorksheet("پاسخ‌ها");
  assert.ok(resultSheet);
  assert.equal(resultSheet.getCell("D1").value, "'=پرسش");
  assert.equal(resultSheet.getCell("D2").value, "'@متن فارسی");
  assert.equal(resultSheet.getCell("E2").value, "'=اول | +دوم");
  assert.match(String(resultSheet.getCell("C2").value), /[۰-۹]/);
  assert.equal(workbook.getWorksheet("راهنما")?.getCell("B5").value, SURVEY_MULTI_CHOICE_SEPARATOR);
});

test("S26 export uses S24 embargoes and authorization", async () => {
  const vote = await createExportSurvey({ kind: SurveyKind.VOTE });
  const voteQuestion = await db.surveyQuestion.create({
    data: { surveyId: vote.id, prompt: "رأی", type: SurveyQuestionType.SHORT_TEXT },
  });
  await db.surveyResponse.create({ data: { surveyId: vote.id, userId, answers: { create: { questionId: voteQuestion.id, textValue: "مخفی" } } } });
  await assert.rejects(
    exportSurveyResults({ actorUserId: adminId, surveyId: vote.id }),
    (error: unknown) => error instanceof SurveyServiceError && error.code === "ACCESS_DENIED",
  );

  await assert.rejects(
    exportSurveyResults({ actorUserId: userId, surveyId: vote.id }),
    (error: unknown) => error instanceof SurveyServiceError && error.code === "ACCESS_DENIED",
  );

  const anonymous = await createExportSurvey({ identityMode: SurveyIdentityMode.ANONYMOUS });
  const anonymousQuestion = await db.surveyQuestion.create({
    data: { surveyId: anonymous.id, prompt: "نظر", type: SurveyQuestionType.LONG_TEXT },
  });
  for (let index = 0; index < 4; index += 1) {
    await addAnonymousResponse(anonymous.id, anonymousQuestion.id, index);
  }
  await assert.rejects(
    exportSurveyResults({ actorUserId: adminId, surveyId: anonymous.id }),
    (error: unknown) => error instanceof SurveyServiceError && error.code === "ACCESS_DENIED",
  );
});
