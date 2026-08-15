"use client";

import { useEffect, useRef } from "react";

type WikiRenderedContentProps = {
  html: string;
};

const copyIcon = `<svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="16"><rect height="14" rx="2" ry="2" width="14" x="8" y="8"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const copiedIcon = `<svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="16"><path d="M20 6 9 17l-5-5"/></svg>`;

async function copyCode(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.className = "fixed -left-full top-0";
  document.body.append(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Copy failed");
  }
}

export function WikiRenderedContent({ html }: WikiRenderedContentProps) {
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const codeBlocks = contentRef.current?.querySelectorAll("pre") ?? [];
    const cleanupCallbacks: Array<() => void> = [];

    codeBlocks.forEach((codeBlock) => {
      const code = codeBlock.querySelector("code");

      if (!code) {
        return;
      }

      codeBlock.classList.add("wiki-code-block");
      const codeText = code.textContent ?? "";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "wiki-code-copy-button";
      button.innerHTML = copyIcon;
      button.setAttribute("aria-label", "کپی بلوک کد");
      button.title = "کپی بلوک کد";

      const status = document.createElement("span");
      status.className = "sr-only";
      status.setAttribute("aria-live", "polite");

      let resetTimeout: number | undefined;

      async function handleCopy() {
        try {
          await copyCode(codeText);
          button.innerHTML = copiedIcon;
          button.setAttribute("aria-label", "بلوک کد کپی شد");
          button.title = "بلوک کد کپی شد";
          status.textContent = "بلوک کد برای انتقال کپی شد.";
        } catch {
          button.innerHTML = copyIcon;
          button.setAttribute("aria-label", "کپی بلوک کد ناموفق بود");
          button.title = "کپی بلوک کد ناموفق بود";
          status.textContent = "کپی بلوک کد ناموفق بود. دوباره تلاش کنید.";
        }

        window.clearTimeout(resetTimeout);
        resetTimeout = window.setTimeout(() => {
          button.innerHTML = copyIcon;
          button.setAttribute("aria-label", "کپی بلوک کد");
          button.title = "کپی بلوک کد";
        }, 2000);
      }

      button.addEventListener("click", handleCopy);
      codeBlock.append(button, status);

      cleanupCallbacks.push(() => {
        window.clearTimeout(resetTimeout);
        button.removeEventListener("click", handleCopy);
        button.remove();
        status.remove();
        codeBlock.classList.remove("wiki-code-block");
      });
    });

    return () => cleanupCallbacks.forEach((cleanup) => cleanup());
  }, [html]);

  return (
    <article
      className="wiki-content"
      dangerouslySetInnerHTML={{ __html: html }}
      ref={contentRef}
    />
  );
}
