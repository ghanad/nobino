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
    <div className="space-y-8" dir="rtl">
      <PageHeader
        title="نظرسنجی جدید"
        subtitle="ایجاد یک نظرسنجی جدید با تنظیمات اولیه"
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
