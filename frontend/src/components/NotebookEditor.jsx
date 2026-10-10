import React, { useCallback, useImperativeHandle } from "react";
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { en } from "@blocknote/core/locales";
import { combineByGroup } from "@blocknote/core";
import { getMathSlashMenuItems, locales as mathLocales } from "@blocknote/math-block";
import { getDiagramSlashMenuItems, locales as diagramLocales } from "@blocknote/diagram-block";
import { BookOpen } from "lucide-react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { notebookBlocks, notebookText } from "@/lib/notebookContent";
import { notebookSchema, calloutKinds } from "./notebookSchema";
import NotebookStudyTools from "./NotebookStudyTools";

const mediaCommands = new Set(["image", "video", "audio", "file"]);

export default function NotebookEditor({ notebook, theme, editorRef, onChange }) {
  const editor = useCreateBlockNote({
    schema: notebookSchema,
    dictionary: { ...en, math: mathLocales.en, diagram: diagramLocales.en },
    initialContent: notebookBlocks(notebook),
    placeholders: { default: "Start writing, or type / for headings, lists and more…" },
    domAttributes: { editor: { role: "textbox", "aria-label": "Notebook notes", "aria-multiline": "true", "data-testid": "notebook-notes-editor" } },
  }, []);
  useImperativeHandle(editorRef, () => editor, [editor]);
  // Retain the schema for existing media, but offer only writing commands.
  const getSlashItems = useCallback(async query => filterSuggestionItems(
    combineByGroup(getDefaultReactSlashMenuItems(editor).filter(item => !mediaCommands.has(item.key)),
      getMathSlashMenuItems(editor), getDiagramSlashMenuItems(editor),
      calloutKinds.map(kind => ({
        title: kind === "warning" ? "Common mistake" : kind[0].toUpperCase() + kind.slice(1),
        subtext: `Write a ${kind} in a colored callout`, group: "Study", icon: <BookOpen size={18} />,
        aliases: ["callout", kind],
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "callout", props: { kind } }),
      })),
    ), query,
  ), [editor]);

  return <>
    <NotebookStudyTools editor={editor} />
    <p className="text-xs text-muted-foreground">Type / for equations, diagrams and callouts. Equations use LaTeX; diagrams use Mermaid.</p>
    <BlockNoteView className="notebook-writing" editor={editor} theme={theme} slashMenu={false} filePanel={false}
    onChange={() => onChange({ rich_content: editor.document, content: notebookText(editor.document) })}>
    <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems}
      shouldOpen={state => !state.selection.$from.parent.type.isInGroup("tableContent")} />
  </BlockNoteView></>;
}
