import { redirect } from "next/navigation";

import { canCreateSurvey } from "@/lib/permissions";
import { requireCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/app/page-header";
import { SurveyMetadataForm } from "@/components/surveys/survey-metadata-form";
import { createSurveyAction } from "@/app/surveys/actions";

export default async function NewSurveyPage() {
  const user = await requireCurrentUser();

  if (!canCreateSurvey(user)) {
    redirect("/surveys");
  }

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="نظرسنجی جدید"
        subtitle="اطلاعات اولیه را وارد کنید؛ سوال‌ها را در مرحله بعد اضافه می‌کنید."
      />

      <div className="mx-auto max-w-2xl">
        <SurveyMetadataForm
          action={createSurveyAction}
          canChangeKindIdentity={true}
          isEditing={false}
        />
      </div>
    </div>
  );
}
