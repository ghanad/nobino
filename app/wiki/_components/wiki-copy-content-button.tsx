"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

type WikiCopyContentButtonProps = {
  contentHtml: string;
  contentText: string;
};

export function WikiCopyContentButton({
  contentHtml,
  contentText,
}: WikiCopyContentButtonProps) {
  const [status, setStatus] = useState<"copied" | "error" | null>(null);

  async function copyContent() {
    try {
      if (typeof ClipboardItem === "undefined") {
        await navigator.clipboard.writeText(contentText);
      } else {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([contentHtml], { type: "text/html" }),
            "text/plain": new Blob([contentText], { type: "text/plain" }),
          }),
        ]);
      }

      setStatus("copied");
    } catch {
      try {
        await navigator.clipboard.writeText(contentText);
        setStatus("copied");
      } catch {
        setStatus("error");
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={copyContent} type="button" variant="outline">
        {status === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {status === "copied" ? "کپی شد" : "کپی محتوا"}
      </Button>
      <span aria-live="polite" className="sr-only">
        {status === "copied"
          ? "محتوای صفحه برای انتقال کپی شد."
          : status === "error"
            ? "کپی محتوا ناموفق بود. دوباره تلاش کنید."
            : ""}
      </span>
    </div>
  );
}
