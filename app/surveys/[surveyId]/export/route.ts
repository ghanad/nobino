import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { exportSurveyResults } from "@/lib/survey-service/export-results";
import { SurveyServiceError } from "@/lib/survey-service/shared";

export const runtime = "nodejs";

const routeParamsSchema = z.object({
  surveyId: z.string().min(1).max(128),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ surveyId: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const parsedParams = routeParamsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const file = await exportSurveyResults({
      actorUserId: user.id,
      surveyId: parsedParams.data.surveyId,
    });

    return new NextResponse(file.content, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return new NextResponse("Not found", { status: 404 });
    }
    throw error;
  }
}
