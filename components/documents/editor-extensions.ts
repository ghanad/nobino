import { Extension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import StarterKit from "@tiptap/starter-kit";

const DocumentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      imageId: { default: null, rendered: false },
    };
  },
});

const TextDirection = Extension.create({
  name: "textDirection",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => element.getAttribute("dir"),
            renderHTML: (attributes) => attributes.dir ? { dir: attributes.dir } : {},
          },
        },
      },
    ];
  },
});

export const documentEditorExtensions = [
  StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
  TextDirection,
  Link.configure({ openOnClick: true, autolink: false }),
  DocumentImage.configure({ allowBase64: false, inline: false }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];
