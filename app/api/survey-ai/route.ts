import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { createSurveyAiProposal } from "@/lib/survey-ai-service";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import { rejectCrossSiteWrite } from "@/lib/csrf";

const schema = z.object({ surveyId: z.string().min(1), mode: z.enum(["suggest", "rewrite", "review"]), brief: z.string().optional(), instruction: z.string().optional(), questionId: z.string().optional() }).strict();
export async function POST(request: Request) { const csrfError = rejectCrossSiteWrite(request); if (csrfError) return csrfError; try { const user = await requireCurrentUser(); let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); } const parsed = schema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); return NextResponse.json(await createSurveyAiProposal({ actorUserId: user.id, ...parsed.data })); } catch (error) { if (error instanceof SurveyServiceError) return NextResponse.json({ error: error.message }, { status: 409 }); return NextResponse.json({ error: "دریافت پیشنهاد هوش مصنوعی ناموفق بود." }, { status: 502 }); } }
