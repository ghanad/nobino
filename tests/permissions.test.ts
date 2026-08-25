import assert from "node:assert/strict";
import { test } from "node:test";

import { UserRole } from "@prisma/client";

import { canCreateSurvey } from "@/lib/permissions";

test("only active users with the survey permission can create surveys, except admins", () => {
  assert.equal(
    canCreateSurvey({ active: true, canCreateSurveys: false, role: UserRole.ADMIN }),
    true,
  );
  assert.equal(
    canCreateSurvey({ active: false, canCreateSurveys: false, role: UserRole.ADMIN }),
    false,
  );
  assert.equal(
    canCreateSurvey({ active: true, canCreateSurveys: true, role: UserRole.MANAGER }),
    true,
  );
  assert.equal(
    canCreateSurvey({ active: true, canCreateSurveys: false, role: UserRole.MANAGER }),
    false,
  );
  assert.equal(
    canCreateSurvey({ active: true, canCreateSurveys: true, role: UserRole.USER }),
    true,
  );
  assert.equal(
    canCreateSurvey({ active: false, canCreateSurveys: true, role: UserRole.USER }),
    false,
  );
});
