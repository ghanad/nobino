"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

export function WikiImportForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      action="/wiki/import"
      className="grid gap-4"
      encType="multipart/form-data"
      method="post"
      onSubmit={() => setIsSubmitting(true)}
    >
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-900" htmlFor="wiki-file">
          فایل خروجی دانشنامه
        </label>
        <input
          accept="application/json,.json"
          className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm file:ml-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id="wiki-file"
          name="wikiFile"
          required
          type="file"
        />
        <p className="text-xs leading-6 text-muted-foreground">
          فقط فایل JSON ساخته‌شده توسط نوبینو، با حجم حداکثر ۱۰ مگابایت.
        </p>
      </div>

      <div>
        <Button disabled={isSubmitting} type="submit">
          <Upload aria-hidden="true" className="h-4 w-4" />
          {isSubmitting ? "در حال ورود..." : "ورود به دانشنامه"}
        </Button>
      </div>
    </form>
  );
}
