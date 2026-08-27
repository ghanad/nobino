import type { ReactNode } from "react";

import { CommunicationsSectionShell } from "@/app/admin/_components/communications-section";

export default function AnnouncementsLayout({ children }: { children: ReactNode }) {
  return <CommunicationsSectionShell>{children}</CommunicationsSectionShell>;
}
