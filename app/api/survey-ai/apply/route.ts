import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { applySurveyAiProposal } from "@/lib/survey-ai-service";
import { SurveyServiceError } from "@/lib/survey-service/shared";
export async function POST(request: Request) { try { const user = await requireCurrentUser(); const body = await request.json(); return NextResponse.json(await applySurveyAiProposal({ actorUserId: user.id, ...body })); } catch (error) { if (error instanceof SurveyServiceError) return NextResponse.json({ error: error.message }, { status: error.message.includes("تغییر کرده") ? 409 : 400 }); return NextResponse.json({ error: "اعمال پیشنهاد ناموفق بود." }, { status: 500 }); } }
