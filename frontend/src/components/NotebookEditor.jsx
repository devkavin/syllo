import React, { useImperativeHandle } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { notebookBlocks, notebookText } from "@/lib/notebookContent";

export default function NotebookEditor({ notebook, theme, editorRef, onChange }) {
  const editor = useCreateBlockNote({
    initialContent: notebookBlocks(notebook),
    placeholders: { default: "Start writing, or type / for headings, lists and more…" },
    domAttributes: { editor: { role: "textbox", "aria-label": "Notebook notes", "aria-multiline": "true", "data-testid": "notebook-notes-editor" } },
  }, []);
  useImperativeHandle(editorRef, () => editor, [editor]);

  return <BlockNoteView className="notebook-writing" editor={editor} theme={theme}
    onChange={() => onChange({ rich_content: editor.document, content: notebookText(editor.document) })} />;
}
