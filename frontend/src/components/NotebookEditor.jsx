import React, { useCallback, useImperativeHandle } from "react";
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { notebookBlocks, notebookText } from "@/lib/notebookContent";

const mediaCommands = new Set(["image", "video", "audio", "file"]);

export default function NotebookEditor({ notebook, theme, editorRef, onChange }) {
  const editor = useCreateBlockNote({
    initialContent: notebookBlocks(notebook),
    placeholders: { default: "Start writing, or type / for headings, lists and more…" },
    domAttributes: { editor: { role: "textbox", "aria-label": "Notebook notes", "aria-multiline": "true", "data-testid": "notebook-notes-editor" } },
  }, []);
  useImperativeHandle(editorRef, () => editor, [editor]);
  // Retain the schema for existing media, but offer only writing commands.
  const getSlashItems = useCallback(async query => filterSuggestionItems(
    getDefaultReactSlashMenuItems(editor).filter(item => !mediaCommands.has(item.key)), query,
  ), [editor]);

  return <BlockNoteView className="notebook-writing" editor={editor} theme={theme} slashMenu={false} filePanel={false}
    onChange={() => onChange({ rich_content: editor.document, content: notebookText(editor.document) })}>
    <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems}
      shouldOpen={state => !state.selection.$from.parent.type.isInGroup("tableContent")} />
  </BlockNoteView>;
}
