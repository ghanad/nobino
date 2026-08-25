"use client";

import { useEffect, useRef, useState } from "react";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  addCollaboratorAction,
  removeCollaboratorAction,
  searchUsersAction,
} from "@/app/surveys/survey-access-actions";

type Collaborator = {
  id: string;
  name: string | null;
  email: string;
};

type SurveyCollaboratorEditorProps = {
  surveyId: string;
  canManage: boolean;
  collaborators: Collaborator[];
};

export function SurveyCollaboratorEditor({
  surveyId,
  canManage,
  collaborators,
}: SurveyCollaboratorEditorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Collaborator[]>([]);
  const [filteredCollaborators, setFilteredCollaborators] = useState<Collaborator[]>(collaborators);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<null | string>(null);
  const [pendingAdd, setPendingAdd] = useState<null | string>(null);

  const existingIds = new Set(collaborators.map((c) => c.id));
  const debouncedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFilteredCollaborators(collaborators);
  }, [collaborators]);

  const runSearch = async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchUsersAction(q);
      setSearchResults(
        results.filter((r) => !existingIds.has(r.id)),
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (debouncedTimer.current) {
      clearTimeout(debouncedTimer.current);
    }
    debouncedTimer.current = setTimeout(() => runSearch(val), 250);
  };

  useEffect(() => {
    return () => {
      if (debouncedTimer.current) {
        clearTimeout(debouncedTimer.current);
      }
    };
  }, []);

  const handleAddCollaborator = async (userId: string) => {
    setPendingAdd(userId);
    setMessage(null);
    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("targetUserId", userId);
    try {
      const result = await addCollaboratorAction({}, form);
      if (result.status === "success") {
        setSearchResults((prev) => prev.filter((r) => r.id !== userId));
        setSearchQuery("");
      } else {
        setMessage(result.message ?? "افزودن دسترسی‌دهنده ناموفق بود.");
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
    } finally {
      setPendingAdd(null);
    }
  };

  const handleRemoveCollaborator = async (userId: string) => {
    setPendingRemove(userId);
    setMessage(null);
    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("targetUserId", userId);
    try {
      const result = await removeCollaboratorAction({}, form);
      if (result.status !== "success") {
        setMessage(result.message ?? "حذف دسترسی‌دهنده ناموفق بود.");
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
    } finally {
      setPendingRemove(null);
    }
  };

  return (
    <fieldset className="grid gap-4 rounded-lg border p-4">
      <legend className="text-sm font-medium">دسترسی‌دهندگان</legend>
      <p className="text-xs text-muted-foreground">
        مدیران و مالک نظرسنجی می‌توانند کاربران دیگر را به عنوان عضو دسترسی اضافه کنند. اعضای دسترسی می‌توانند نظرسنجی را ویرایش و نتایج را ببینند، اما نمی‌توانند نظرسنجی را منتشر کنند.
      </p>

      {message ? (
        <p className="text-xs text-destructive">{message}</p>
      ) : null}

      {/* Add collaborator input */}
      {canManage ? (
        <div className="grid gap-2">
          <label htmlFor="collaborator-search" className="text-xs font-medium">
            افزودن دسترسی‌دهنده
          </label>
          <div className="relative">
            <input
              id="collaborator-search"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              dir="rtl"
              name="collaborator-search"
              onChange={handleInputChange}
              placeholder="جستجوی نام یا ایمیل کاربر..."
              value={searchQuery}
              type="text"
              autoComplete="off"
            />
            {isSearching && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                ...
              </span>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="grid gap-1 rounded-md border bg-card">
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-2 border-b last:border-b-0 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{user.name || "—"}</span>
                    <span className="mr-2 text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                  <Button
                    disabled={pendingAdd === user.id}
                    onClick={() => handleAddCollaborator(user.id)}
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
      ) : null}

      {/* Existing collaborators list */}
      <div className="grid gap-2">
        <span className="text-xs font-medium">لیست دسترسی‌دهندگان</span>
        {filteredCollaborators.length === 0 ? (
          <p className="text-xs text-muted-foreground">هنوز هیچ دسترسی‌دهنده‌ای اضافه نشده است.</p>
        ) : (
          <div className="grid gap-2">
            {filteredCollaborators.map((collab) => (
              <div
                key={collab.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="grid min-w-0 gap-0.5">
                  <span className="font-medium">{collab.name || "—"}</span>
                  <span className="text-xs text-muted-foreground">{collab.email}</span>
                </div>
                {canManage ? (
                  <Button
                    disabled={pendingRemove === collab.id}
                    onClick={() => handleRemoveCollaborator(collab.id)}
                    size="sm"
                    variant="outline"
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </fieldset>
  );
}
