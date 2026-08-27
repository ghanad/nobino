import type { ReactNode } from "react";

import { CommunicationsSectionShell } from "@/app/admin/_components/communications-section";

export default function BaleLayout({ children }: { children: ReactNode }) {
  return <CommunicationsSectionShell>{children}</CommunicationsSectionShell>;
}
