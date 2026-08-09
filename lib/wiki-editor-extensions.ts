import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";

export const WIKI_CONTENT_EXTENSIONS = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3, 4, 5, 6],
    },
  }),
  Link.configure({
    autolink: true,
    openOnClick: false,
  }),
  TextAlign.configure({
    defaultAlignment: "right",
    types: ["heading", "paragraph"],
  }),
];

export const WIKI_EDITOR_EXTENSIONS = [
  ...WIKI_CONTENT_EXTENSIONS,
  Placeholder.configure({
    placeholder: "متن دانشنامه را اینجا بنویسید...",
    showOnlyWhenEditable: true,
  }),
];

