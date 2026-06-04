"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

type UnreadNotificationToastProps = {
  notification: {
    id: string;
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
    <div
      className="fixed right-6 top-24 z-50 w-[min(420px,calc(100vw-3rem))] rounded-lg border border-sky-200 bg-background p-4 text-right text-sm text-foreground shadow-lg"
      dir="rtl"
      role="status"
    >
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
        <div className="min-w-0">
          <p className="font-medium">{notification.title}</p>
          <p className="mt-1 line-clamp-3 leading-6 text-muted-foreground">
            {notification.body}
          </p>
          <Link
            className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
            href="/notifications"
          >
            مشاهده اعلان‌ها
          </Link>
        </div>
      </div>
    </div>
  );
}
