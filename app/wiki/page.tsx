import { redirect } from "next/navigation";

import { WikiChat } from "@/app/wiki/_components/wiki-chat";
import { WikiWorkspace } from "@/app/wiki/_components/wiki-workspace";
import { AppShell } from "@/components/app/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { canManageWiki } from "@/lib/permissions";
import { getWikiAiSettings } from "@/lib/wiki-ai-settings-service";
import {
  getWikiTreeForUser,
  type WikiPageTreeNode,
} from "@/lib/wiki-service";

/*
THESIS: `/wiki` is one evidence desk for asking and verifying, not another article page with a chat widget.
OWN-WORLD: Nobino's white and cool-neutral Quiet Service Desk, thin rules, compact controls, and restrained blue action.
STORY: An employee asks in Persian, watches a grounded answer arrive, then opens first-party wiki sources before acting.
FIRST VIEWPORT: Wiki tree on the right, question heading and one large conversation workspace on the left; the composer remains reachable on mobile.
FORM: Code-led extension of the established Operate/Read surface; source links are the signature completion state.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md.
*/

function getSuggestionTitles(
  nodes: WikiPageTreeNode[],
  titles: string[] = [],
): string[] {
  for (const node of nodes) {
    if (node.contentText.trim() && titles.length < 3) {
      titles.push(node.title);
    }

    getSuggestionTitles(node.children, titles);
  }

  return titles;
}

export default async function WikiIndexPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [tree, settings] = await Promise.all([
    getWikiTreeForUser(user),
    getWikiAiSettings(),
  ]);
  const suggestionTitles = getSuggestionTitles(tree);
  const suggestions = suggestionTitles.map(
    (title) => `دربارهٔ «${title}» توضیح بده.`,
  );
  const isAdmin = canManageWiki(user.role);
  const hasContent = suggestionTitles.length > 0;

  return (
    <AppShell user={user}>
      <WikiWorkspace activeSlug="" isAdmin={isAdmin} tree={tree}>
        <div dir="rtl">
          <WikiChat
            enabled={settings.enabled}
            hasContent={hasContent}
            suggestions={suggestions}
          />
        </div>
      </WikiWorkspace>
    </AppShell>
  );
}
