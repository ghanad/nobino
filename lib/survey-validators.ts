import { SurveyIdentityMode, SurveyKind } from "@prisma/client";
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
