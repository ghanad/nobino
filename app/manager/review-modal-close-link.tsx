"use client";

import type { AnchorHTMLAttributes } from "react";
import { useEffect } from "react";

type ReviewModalCloseLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  closeHref: string;
  modalId: string;
};

export function ReviewModalCloseLink({
  closeHref,
  modalId,
  onClick,
  ...props
}: ReviewModalCloseLinkProps) {
  useEffect(() => {
    function handleHashChange() {
      if (window.location.hash !== `#${modalId}`) {
        return;
      }

      delete document.getElementById(modalId)?.dataset.closed;
    }

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [modalId]);

  return (
    <a
      href="#"
      onClick={(event) => {
        onClick?.(event);

        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();
        const modal = document.getElementById(modalId);

        if (modal) {
          modal.dataset.closed = "true";
        }

        window.history.replaceState(null, "", closeHref);
      }}
      {...props}
    />
  );
}
