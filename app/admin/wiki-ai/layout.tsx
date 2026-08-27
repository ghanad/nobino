import type { ReactNode } from "react";

import { WikiAiSectionShell } from "@/app/admin/_components/wiki-ai-section";

export default function WikiAiLayout({ children }: { children: ReactNode }) {
  return <WikiAiSectionShell>{children}</WikiAiSectionShell>;
}
