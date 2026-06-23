"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, FileText, Folder } from "lucide-react";

import { cn } from "@/lib/utils";

export type DocumentTreeItem = {
  children: DocumentTreeItem[];
  id: string;
  parentId: string | null;
  position: number;
  title: string;
  type: "FOLDER" | "PAGE";
};

function TreeItem({ item, selectedId }: { item: DocumentTreeItem; selectedId?: string }) {
  const [expanded, setExpanded] = useState(true);
  const isFolder = item.type === "FOLDER";
  return (
    <li>
      <div className="flex items-center gap-1">
        {isFolder ? (
          <button
            aria-expanded={expanded}
            aria-label={`${expanded ? "بستن" : "باز کردن"} پوشه ${item.title}`}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : <span className="w-6" />}
        {isFolder ? (
          <button className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-right text-sm hover:bg-slate-50" onClick={() => setExpanded((value) => !value)} type="button">
            <Folder className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="truncate">{item.title}</span>
          </button>
        ) : (
          <Link
            aria-current={selectedId === item.id ? "page" : undefined}
            className={cn("flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", selectedId === item.id && "bg-blue-50 font-semibold text-blue-800")}
            href={`/documents/${item.id}`}
          >
            <FileText className="h-4 w-4 shrink-0 text-blue-600" />
            <span className="truncate">{item.title}</span>
          </Link>
        )}
      </div>
      {isFolder && expanded && item.children.length ? (
        <ul className="mr-4 border-r border-slate-200 pr-2">{item.children.map((child) => <TreeItem item={child} key={child.id} selectedId={selectedId} />)}</ul>
      ) : null}
    </li>
  );
}

export function DocumentTree({ items, selectedId }: { items: DocumentTreeItem[]; selectedId?: string }) {
  return <nav aria-label="درخت مستندات"><ul className="space-y-0.5">{items.map((item) => <TreeItem item={item} key={item.id} selectedId={selectedId} />)}</ul></nav>;
}
