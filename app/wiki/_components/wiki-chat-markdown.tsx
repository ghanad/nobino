import { Fragment, type ReactNode } from "react";

type MarkdownBlock =
  | { content: string; level: 1 | 2 | 3; type: "heading" }
  | { items: string[]; ordered: boolean; type: "list" }
  | { content: string; type: "paragraph" };

const headingPattern = /^(#{1,3})\s+(.+)$/;
const orderedListPattern = /^\s*\d+[.)]\s+(.+)$/;
const unorderedListPattern = /^\s*[-*+]\s+(.+)$/;

function parseBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const paragraphLines: string[] = [];
  let list: Extract<MarkdownBlock, { type: "list" }> | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length) {
      blocks.push({ content: paragraphLines.join("\n"), type: "paragraph" });
      paragraphLines.length = 0;
    }
  };

  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const line of content.split("\n")) {
    const heading = line.match(headingPattern);
    const orderedItem = line.match(orderedListPattern);
    const unorderedItem = line.match(unorderedListPattern);

    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        content: heading[2],
        level: heading[1].length as 1 | 2 | 3,
        type: "heading",
      });
      continue;
    }

    const listItem = orderedItem ?? unorderedItem;

    if (listItem) {
      flushParagraph();
      const ordered = Boolean(orderedItem);

      if (!list || list.ordered !== ordered) {
        flushList();
        list = { items: [], ordered, type: "list" };
      }

      list.items.push(listItem[1]);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderInline(content: string): ReactNode[] {
  const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em] text-slate-900" key={index}>
          {part.slice(1, -1)}
        </code>
      );
    }

    return <Fragment key={index}>{part}</Fragment>;
  });
}

/**
 * Render the small Markdown subset the assistant is allowed to produce.
 * Deliberately rendering React nodes instead of HTML keeps model output inert.
 */
export function WikiChatMarkdown({ content }: { content: string }) {
  return (
    <div className="grid gap-3 text-sm leading-7 text-slate-800">
      {parseBlocks(content).map((block, index) => {
        if (block.type === "heading") {
          const Heading = `h${block.level}` as const;
          return (
            <Heading
              className="font-semibold text-slate-950"
              key={`${block.type}-${index}`}
            >
              {renderInline(block.content)}
            </Heading>
          );
        }

        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              className={block.ordered ? "list-decimal space-y-1 pr-5" : "list-disc space-y-1 pr-5"}
              key={`${block.type}-${index}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </List>
          );
        }

        return (
          <p className="whitespace-pre-wrap" key={`${block.type}-${index}`}>
            {renderInline(block.content)}
          </p>
        );
      })}
    </div>
  );
}
