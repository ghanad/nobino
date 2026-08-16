import {
  SurveyIdentityMode,
  SurveyKind,
  SurveyQuestionType,
} from "@prisma/client";
import { z } from "zod";

import { isValidJalaliDateParam } from "@/lib/jalali-date";

const TIME_REGEX = /^([01]\d|2[0-3]):00$/;

export const TIME_ERROR = "ساعت باید در قالب HH:00 باشد (مثلاً 09:00 یا 14:00).";

export const createSurveySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "عنوان نظرسنجی الزامی است.")
    .max(200, "عنوان نظرسنجی نمی‌تواند بیش از ۲۰۰ کاراکتر باشد."),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  kind: z.nativeEnum(SurveyKind, {
    errorMap: () => ({ message: "نوع نظرسنجی نامعتبر است." }),
  }),
  identityMode: z.nativeEnum(SurveyIdentityMode, {
    errorMap: () => ({ message: "حالت هویت نامعتبر است." }),
  }),
});

export const updateMetadataSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی نامعتبر است."),
  title: z
    .string()
    .trim()
    .min(1, "عنوان نظرسنجی الزامی است.")
    .max(200, "عنوان نظرسنجی نمی‌تواند بیش از ۲۰۰ کاراکتر باشد."),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  kind: z.nativeEnum(SurveyKind).optional(),
  identityMode: z.nativeEnum(SurveyIdentityMode).optional(),
  startDate: z
    .string()
    .refine(isValidJalaliDateParam, {
      message: "تاریخ شروع نامعتبر است.",
    })
    .optional()
    .or(z.literal("")),
  startTime: z
    .string()
    .regex(TIME_REGEX, TIME_ERROR)
    .optional()
    .or(z.literal("")),
  endDate: z
    .string()
    .refine(isValidJalaliDateParam, {
      message: "تاریخ پایان نامعتبر است.",
    })
    .optional()
    .or(z.literal("")),
  endTime: z
    .string()
    .regex(TIME_REGEX, TIME_ERROR)
    .optional()
    .or(z.literal("")),
});

// S13 Collaborator schemas

export const addCollaboratorSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  targetUserId: z.string().min(1, "شناسه کاربر الزامی است."),
});

export const removeCollaboratorSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  targetUserId: z.string().min(1, "شناسه کاربر الزامی است."),
});

// S13 Audience schemas

export const setAudienceModeSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  audienceMode: z.enum(["ALL_ACTIVE", "TARGETED"], {
    errorMap: () => ({ message: "حالت مخاطب نامعتبر است." }),
  }),
});

export const addAudienceTeamSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  teamId: z.string().min(1, "شناسه تیم الزامی است."),
});

export const removeAudienceTeamSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  teamId: z.string().min(1, "شناسه تیم الزامی است."),
});

export const addAudienceUserSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  targetUserId: z.string().min(1, "شناسه کاربر الزامی است."),
});

export const removeAudienceUserSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  targetUserId: z.string().min(1, "شناسه کاربر الزامی است."),
});

// S14 Question schemas

export const SURVEY_QUESTION_PROMPT_MAX_LENGTH = 2000;
export const SURVEY_QUESTION_HELP_TEXT_MAX_LENGTH = 1000;

export const addQuestionSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  prompt: z
    .string()
    .trim()
    .min(1, "متن سوال الزامی است.")
    .max(
      SURVEY_QUESTION_PROMPT_MAX_LENGTH,
      "متن سوال نمی‌تواند بیش از ۲۰۰۰ کاراکتر باشد.",
    ),
  type: z.nativeEnum(SurveyQuestionType, {
    errorMap: () => ({ message: "نوع سوال نامعتبر است." }),
  }),
  required: z.boolean(),
});

export const updateQuestionSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  questionId: z.string().min(1, "شناسه سوال الزامی است."),
  prompt: z
    .string()
    .trim()
    .min(1, "متن سوال الزامی است.")
    .max(
      SURVEY_QUESTION_PROMPT_MAX_LENGTH,
      "متن سوال نمی‌تواند بیش از ۲۰۰۰ کاراکتر باشد.",
    ),
  helpText: z
    .string()
    .trim()
    .max(
      SURVEY_QUESTION_HELP_TEXT_MAX_LENGTH,
      "متن راهنما نمی‌تواند بیش از ۱۰۰۰ کاراکتر باشد.",
    )
    .optional()
    .or(z.literal("")),
  type: z.nativeEnum(SurveyQuestionType, {
    errorMap: () => ({ message: "نوع سوال نامعتبر است." }),
  }),
  required: z.boolean(),
});

export const deleteQuestionSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  questionId: z.string().min(1, "شناسه سوال الزامی است."),
});

// S15 Option schemas

export const SURVEY_OPTION_LABEL_MAX_LENGTH = 500;

export const addOptionSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  questionId: z.string().min(1, "شناسه سوال الزامی است."),
  label: z
    .string()
    .trim()
    .min(1, "متن گزینه الزامی است.")
    .max(
      SURVEY_OPTION_LABEL_MAX_LENGTH,
      "متن گزینه نمی‌تواند بیش از ۵۰۰ کاراکتر باشد.",
    ),
});

export const updateOptionSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  questionId: z.string().min(1, "شناسه سوال الزامی است."),
  optionId: z.string().min(1, "شناسه گزینه الزامی است."),
  label: z
    .string()
    .trim()
    .min(1, "متن گزینه الزامی است.")
    .max(
      SURVEY_OPTION_LABEL_MAX_LENGTH,
      "متن گزینه نمی‌تواند بیش از ۵۰۰ کاراکتر باشد.",
    ),
});

export const deleteOptionSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  questionId: z.string().min(1, "شناسه سوال الزامی است."),
  optionId: z.string().min(1, "شناسه گزینه الزامی است."),
});

export const reorderOptionsSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  questionId: z.string().min(1, "شناسه سوال الزامی است."),
  optionIds: z
    .array(z.string().min(1))
    .min(1, "حداقل یک گزینه الزامی است."),
});

export const reorderQuestionsSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  questionIds: z
    .array(z.string().min(1))
    .min(1, "حداقل یک سوال الزامی است."),
});

// S15 Extended question update schema with rating/maxSelections

export const updateQuestionWithConfigSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی الزامی است."),
  questionId: z.string().min(1, "شناسه سوال الزامی است."),
  prompt: z
    .string()
    .trim()
    .min(1, "متن سوال الزامی است.")
    .max(
      SURVEY_QUESTION_PROMPT_MAX_LENGTH,
      "متن سوال نمی‌تواند بیش از ۲۰۰۰ کاراکتر باشد.",
    ),
  helpText: z
    .string()
    .trim()
    .max(
      SURVEY_QUESTION_HELP_TEXT_MAX_LENGTH,
      "متن راهنما نمی‌تواند بیش از ۱۰۰۰ کاراکتر باشد.",
    )
    .optional()
    .or(z.literal("")),
  type: z.nativeEnum(SurveyQuestionType, {
    errorMap: () => ({ message: "نوع سوال نامعتبر است." }),
  }),
  required: z.boolean(),
  ratingMin: z.coerce.number().int().min(0).max(10).optional().nullable(),
  ratingMax: z.coerce.number().int().min(0).max(10).optional().nullable(),
  ratingMinLabel: z.string().trim().max(200).optional().or(z.literal("")),
  ratingMaxLabel: z.string().trim().max(200).optional().or(z.literal("")),
  maxSelections: z.coerce.number().int().min(1).optional().nullable(),
});
