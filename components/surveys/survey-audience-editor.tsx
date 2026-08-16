"use client";

import { useEffect, useRef, useState } from "react";

import { AlertTriangle, Info, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  addAudienceTeamAction,
  addAudienceUserAction,
  removeAudienceTeamAction,
  removeAudienceUserAction,
  searchTeamsAction,
  searchUsersAction,
  setAudienceModeAction,
} from "@/app/surveys/survey-access-actions";
import type { SurveyAudienceMode, SurveyIdentityMode, SurveyState } from "@prisma/client";

type AudienceEditorData = {
  collaborators: { id: string; name: string | null; email: string }[];
  currentCollaboratorIds: string[];
  audienceMode: SurveyAudienceMode;
  currentTeamIds: string[];
  currentUserIdSelections: string[];
  state: SurveyState;
  previewCount: number;
  audienceUserDetails?: { id: string; name: string | null; email: string }[];
  identityMode: SurveyIdentityMode;
};

type SurveyAudienceEditorProps = {
  surveyId: string;
  canManage: boolean;
  isDraft: boolean;
  identityMode: SurveyIdentityMode;
  initial: AudienceEditorData;
  teams: { id: string; name: string }[];
};

export function SurveyAudienceEditor({
  surveyId,
  canManage,
  isDraft,
  identityMode,
  initial,
  teams,
}: SurveyAudienceEditorProps) {
  const canManageAndDraft = canManage && isDraft;
  const mountedRef = useRef(true);

  const [audienceMode, setAudienceMode] = useState<SurveyAudienceMode>(
    initial.audienceMode,
  );

  // Selection state
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(
    () => new Set(initial.currentTeamIds),
  );
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    () => new Set(initial.currentUserIdSelections),
  );

  // Pending states
  const [pendingTeamAdd, setPendingTeamAdd] = useState<string | null>(null);
  const [pendingTeamRemove, setPendingTeamRemove] = useState<string | null>(null);
  const [pendingUserAdd, setPendingUserAdd] = useState<string | null>(null);
  const [pendingUserRemove, setPendingUserRemove] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Team search
  const [teamQuery, setTeamQuery] = useState("");
  const [teamResults, setTeamResults] = useState<
    { id: string; name: string }[]
  >([]);
  const [isTeamSearching, setIsTeamSearching] = useState(false);

  // User search
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<
    { id: string; name: string | null; email: string }[]
  >([]);
  const [isUserSearching, setIsUserSearching] = useState(false);

  // Debounce refs
  const teamDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (teamDebounceRef.current) clearTimeout(teamDebounceRef.current);
      if (userDebounceRef.current) clearTimeout(userDebounceRef.current);
    };
  }, []);

  // Team search with debounce
  useEffect(() => {
    if (teamDebounceRef.current) clearTimeout(teamDebounceRef.current);
    if (!teamQuery.trim()) {
      setTeamResults([]);
      return;
    }
    teamDebounceRef.current = setTimeout(async () => {
      setIsTeamSearching(true);
      try {
        const results = await searchTeamsAction(teamQuery);
        if (mountedRef.current) {
          setTeamResults(results.filter((r) => !selectedTeamIds.has(r.id)));
        }
      } finally {
        if (mountedRef.current) setIsTeamSearching(false);
      }
    }, 250);
  }, [teamQuery, selectedTeamIds]);

  // User search with debounce
  useEffect(() => {
    if (userDebounceRef.current) clearTimeout(userDebounceRef.current);
    if (!userQuery.trim()) {
      setUserResults([]);
      return;
    }
    userDebounceRef.current = setTimeout(async () => {
      setIsUserSearching(true);
      try {
        const results = await searchUsersAction(userQuery);
        if (mountedRef.current) {
          setUserResults(results.filter((r) => !selectedUserIds.has(r.id)));
        }
      } finally {
        if (mountedRef.current) setIsUserSearching(false);
      }
    }, 250);
  }, [userQuery, selectedUserIds]);

  const handleAddTeam = async (teamId: string) => {
    if (!canManageAndDraft) return;
    setPendingTeamAdd(teamId);
    setMessage(null);
    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("teamId", teamId);
    try {
      const result = await addAudienceTeamAction({}, form);
      if (result.status === "success") {
        setSelectedTeamIds((prev) => new Set([...prev, teamId]));
        setTeamQuery("");
        setTeamResults([]);
      } else {
        setMessage(result.message ?? "افزودن تیم ناموفق بود.");
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
    } finally {
      setPendingTeamAdd(null);
    }
  };

  const handleRemoveTeam = async (teamId: string) => {
    if (!canManageAndDraft) return;
    setPendingTeamRemove(teamId);
    setMessage(null);
    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("teamId", teamId);
    try {
      const result = await removeAudienceTeamAction({}, form);
      if (result.status === "success") {
        setSelectedTeamIds((prev) => {
          const next = new Set(prev);
          next.delete(teamId);
          return next;
        });
        setTeamQuery("");
        setTeamResults([]);
      } else {
        setMessage(result.message ?? "حذف تیم ناموفق بود.");
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
    } finally {
      setPendingTeamRemove(null);
    }
  };

  const handleAddUser = async (userId: string) => {
    if (!canManageAndDraft) return;
    setPendingUserAdd(userId);
    setMessage(null);
    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("targetUserId", userId);
    try {
      const result = await addAudienceUserAction({}, form);
      if (result.status === "success") {
        setSelectedUserIds((prev) => new Set([...prev, userId]));
        setUserQuery("");
        setUserResults([]);
      } else {
        setMessage(result.message ?? "افزودن کاربر ناموفق بود.");
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
    } finally {
      setPendingUserAdd(null);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!canManageAndDraft) return;
    setPendingUserRemove(userId);
    setMessage(null);
    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("targetUserId", userId);
    try {
      const result = await removeAudienceUserAction({}, form);
      if (result.status === "success") {
        setSelectedUserIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
        setUserQuery("");
        setUserResults([]);
      } else {
        setMessage(result.message ?? "حذف کاربر ناموفق بود.");
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
    } finally {
      setPendingUserRemove(null);
    }
  };

  const handleModeChange = async (mode: SurveyAudienceMode) => {
    if (!canManageAndDraft) return;
    setPendingMode(true);
    setMessage(null);
    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("audienceMode", mode);
    try {
      const result = await setAudienceModeAction({}, form);
      if (result.status === "success") {
        setAudienceMode(mode);
      } else {
        setMessage(result.message ?? "تغییر حالت مخاطب ناموفق بود.");
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
    } finally {
      setPendingMode(false);
    }
  };

  return (
    <fieldset className="grid gap-4 rounded-lg border p-4">
      <legend className="text-sm font-medium">مخاطبان نظرسنجی</legend>
      <p className="text-xs text-muted-foreground">
        مخاطبان نظرسنجی لیستی از کاربرانی هستند که باید نظرسنجی را ببینند و پاسخ دهند. این لیست پس از انتشار فریز می‌شود و دیگر تغییر نخواهد کرد.
      </p>

      {message ? (
        <p className="text-xs text-destructive">{message}</p>
      ) : null}

      {/* Audience mode selection */}
      {canManageAndDraft ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50 ${
              audienceMode === "ALL_ACTIVE"
                ? "border-primary bg-primary/5"
                : ""
            }`}
          >
            <input
              className="mt-0.5"
              checked={audienceMode === "ALL_ACTIVE"}
              name="audienceMode"
              onChange={() => handleModeChange("ALL_ACTIVE")}
              type="radio"
              value="ALL_ACTIVE"
            />
            <span className="grid gap-1">
              <span className="font-medium">همه کاربران فعال</span>
              <span className="text-xs leading-5 text-muted-foreground">
                تمام کاربران فعال سیستم به صورت خودکار مخاطب خواهند بود.
              </span>
            </span>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50 ${
              audienceMode === "TARGETED"
                ? "border-primary bg-primary/5"
                : ""
            }`}
          >
            <input
              className="mt-0.5"
              checked={audienceMode === "TARGETED"}
              name="audienceMode"
              onChange={() => handleModeChange("TARGETED")}
              type="radio"
              value="TARGETED"
            />
            <span className="grid gap-1">
              <span className="font-medium">انتخاب تیم و کاربر</span>
              <span className="text-xs leading-5 text-muted-foreground">
                فقط تیم‌ها و کاربران انتخاب شده مخاطب خواهند بود.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {/* Audience preview */}
      <div className="rounded-md border px-3 py-2 text-xs">
        {audienceMode === "ALL_ACTIVE" ? (
          <div className="flex items-center gap-2 text-muted-foreground border-blue-200 bg-blue-50 rounded-md p-2">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>همه کاربران فعال سیستم</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground border-muted px-2 py-1">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>
              تعداد مخاطب انتخاب شده: {initial.previewCount}
            </span>
          </div>
        )}
        {identityMode === "ANONYMOUS" && initial.previewCount < 5 ? (
          <div className="mt-2 flex items-center gap-2 text-amber-900 border-amber-200 bg-amber-50 rounded-md p-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              برای نظرسنجی ناشناس حداقل ۵ مخاطب الزامی است.
            </span>
          </div>
        ) : null}
      </div>

      {/* TARGETED mode: selected teams */}
      {audienceMode === "TARGETED" && selectedTeamIds.size > 0 ? (
        <div className="grid gap-2">
          <span className="text-xs font-medium">تیم‌های انتخاب شده</span>
          <div className="grid gap-1.5">
            {teams
              .filter((t) => selectedTeamIds.has(t.id))
              .map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs"
                >
                  <span className="truncate font-medium text-purple-900">
                    {team.name}
                  </span>
                  {canManageAndDraft ? (
                    <Button
                      disabled={pendingTeamRemove === team.id}
                      onClick={() => handleRemoveTeam(team.id)}
                      size="sm"
                      variant="ghost"
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  ) : null}
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {/* TARGETED mode: selected users */}
      {audienceMode === "TARGETED" && selectedUserIds.size > 0 ? (
        <div className="grid gap-2">
          <span className="text-xs font-medium">کاربران انتخاب شده</span>
          <div className="grid gap-1.5">
            {(initial.audienceUserDetails ?? [])
              .filter((user) => selectedUserIds.has(user.id))
              .map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs"
                >
                  <span className="truncate text-purple-900">
                    {user.name || "—"} ({user.email})
                  </span>
                  {canManageAndDraft ? (
                    <Button
                      disabled={pendingUserRemove === user.id}
                      onClick={() => handleRemoveUser(user.id)}
                      size="sm"
                      variant="ghost"
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  ) : null}
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {/* Frozen warning */}
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
        توجه: لیست مخاطبان پس از انتشار نظرسنجی تغییر نخواهد کرد.
        تغییرات تیم‌ها یا کاربران پس از انتشار بر مخاطبان تأثیر نمی‌گذارد.
      </div>

      {/* TARGETED mode: add users/teams */}
      {audienceMode === "TARGETED" && canManageAndDraft ? (
        <div className="grid gap-2 pt-2">
          {/* Add team */}
          <div className="grid gap-2">
            <label htmlFor="team-audience-search" className="text-xs font-medium">
              افزودن تیم به مخاطبان
            </label>
            <div className="relative">
              <input
                id="team-audience-search"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                dir="rtl"
                value={teamQuery}
                onChange={(e) => setTeamQuery(e.target.value)}
                placeholder="جستجوی تیم..."
                type="text"
                autoComplete="off"
              />
              {isTeamSearching && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  ...
                </span>
              )}
            </div>

            {teamResults.length > 0 && (
              <div className="grid gap-1 rounded-md border bg-card">
                {teamResults.map((team) => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between gap-2 border-b last:border-b-0 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{team.name}</span>
                    <Button
                      disabled={pendingTeamAdd === team.id}
                      onClick={() => handleAddTeam(team.id)}
                      size="sm"
                      type="button"
                    >
                      افزودن
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add user */}
          <div className="grid gap-2 pt-2">
            <label htmlFor="user-audience-search" className="text-xs font-medium">
              افزودن کاربر به مخاطبان
            </label>
            <div className="relative">
              <input
                id="user-audience-search"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                dir="rtl"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="جستجوی نام یا ایمیل کاربر..."
                type="text"
                autoComplete="off"
              />
              {isUserSearching && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  ...
                </span>
              )}
            </div>

            {userResults.length > 0 && (
              <div className="grid gap-1 rounded-md border bg-card">
                {userResults.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between gap-2 border-b last:border-b-0 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">
                        {user.name || "—"}
                      </span>
                      <span className="mr-2 text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </div>
                    <Button
                      disabled={pendingUserAdd === user.id}
                      onClick={() => handleAddUser(user.id)}
                      size="sm"
                      type="button"
                    >
                      افزودن
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
