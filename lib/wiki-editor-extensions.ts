import { Extension } from "@tiptap/core";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";

const WikiTextDirection = Extension.create({
  name: "wikiTextDirection",

  addGlobalAttributes() {
    return [
      {
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => element.getAttribute("dir"),
            renderHTML: (attributes) =>
              attributes.dir === "ltr" || attributes.dir === "rtl"
                ? { dir: attributes.dir }
                : {},
          },
        },
        types: ["heading", "paragraph"],
      },
    ];
  },
});

export const WIKI_CONTENT_EXTENSIONS = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3, 4, 5, 6],
    },
    link: {
      autolink: true,
      openOnClick: false,
    },
  }),
  TextAlign.configure({
    defaultAlignment: "right",
    types: ["heading", "paragraph"],
  }),
  WikiTextDirection,
];

export const WIKI_EDITOR_EXTENSIONS = [
  ...WIKI_CONTENT_EXTENSIONS,
  Placeholder.configure({
    placeholder: "متن دانشنامه را اینجا بنویسید...",
    showOnlyWhenEditable: true,
  }),
];
