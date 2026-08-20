"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

import { SwipeDismissToast } from "@/components/ui/swipe-dismiss-toast";

type UnreadNotificationToastProps = {
  notification: {
    id: string;
    actionHref: string | null;
    title: string;
    body: string;
  } | null;
};

export function UnreadNotificationToast({
  notification,
}: UnreadNotificationToastProps) {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);
  const isNotificationsPage =
    pathname === "/notifications" || pathname.startsWith("/notifications/");

  useEffect(() => {
    if (!notification || isNotificationsPage) {
      return;
    }

    const storageKey = `nobino-seen-notification-${notification.id}`;

    if (window.localStorage.getItem(storageKey)) {
      return;
    }

    window.localStorage.setItem(storageKey, "1");
    setIsVisible(true);

    const timeout = window.setTimeout(() => setIsVisible(false), 6_000);

    return () => window.clearTimeout(timeout);
  }, [isNotificationsPage, notification]);

  if (!notification || !isVisible || isNotificationsPage) {
    return null;
  }

  return (
    <SwipeDismissToast
      className="fixed right-4 top-20 z-50 w-[min(420px,calc(100vw-2rem))] rounded-lg border border-sky-200 bg-background p-4 pl-12 text-right text-sm text-foreground shadow-lg md:right-6 md:top-24 md:w-[min(420px,calc(100vw-3rem))]"
      dir="rtl"
      onDismiss={() => setIsVisible(false)}
      role="status"
    >
      <button
        aria-label="بستن اعلان"
        className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setIsVisible(false)}
        type="button"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
        <div className="min-w-0">
          <p className="font-medium">{notification.title}</p>
          <p className="mt-1 line-clamp-3 leading-6 text-muted-foreground">
            {notification.body}
          </p>
          <Link
            className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
            href={notification.actionHref ?? "/notifications"}
          >
            {notification.actionHref ? "مشاهده نظرسنجی" : "مشاهده اعلان‌ها"}
          </Link>
        </div>
      </div>
    </SwipeDismissToast>
  );
}
