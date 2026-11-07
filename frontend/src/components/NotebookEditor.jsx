import React, { useCallback, useImperativeHandle, useState } from "react";
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { en } from "@blocknote/core/locales";
import { combineByGroup } from "@blocknote/core";
import { getMathSlashMenuItems, locales as mathLocales } from "@blocknote/math-block";
import { getDiagramSlashMenuItems, locales as diagramLocales } from "@blocknote/diagram-block";
import { BookOpen, Microscope } from "lucide-react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { notebookBlocks, notebookText } from "@/lib/notebookContent";
import { notebookSchema, calloutKinds } from "./notebookSchema";
import NotebookStudyTools from "./NotebookStudyTools";
import { NotebookIllustrationContext } from "@/features/scientific/ScientificIllustrationBlock";
import { createDocument } from "@/features/scientific/document";
import StudyGuidance from "./StudyGuidance";

const mediaCommands = new Set(["image", "video", "audio", "file"]);

export default function NotebookEditor({ notebook, theme, editorRef, onChange, readOnly = false, saveNow, saveState, saveError, accountId }) {
  const [editingId, setEditingId] = useState(null);
  const editor = useCreateBlockNote({
    schema: notebookSchema,
    dictionary: { ...en, math: mathLocales.en, diagram: diagramLocales.en },
    initialContent: notebookBlocks(notebook),
    placeholders: { default: "Start writing, or type / for headings, lists and more…" },
    domAttributes: { editor: { role: "textbox", "aria-label": "Notebook notes", "aria-multiline": "true", "data-testid": "notebook-notes-editor" } },
  }, []);
  useImperativeHandle(editorRef, () => editor, [editor]);
  const persist = useCallback(activeEditor => {
    if (!readOnly) onChange?.({ rich_content: activeEditor.document, content: notebookText(activeEditor.document) });
  }, [onChange, readOnly]);
  const insertIllustration = useCallback((slash = false) => {
    editor.focus();
    const figure = { type: "scientificIllustration", props: { document: JSON.stringify(createDocument()) } };
    let inserted;
    if (slash) inserted = insertOrUpdateBlockForSlashMenu(editor, figure);
    else {
      const cursor = editor.getTextCursorPosition().block;
      inserted = editor.insertBlocks([figure], cursor, "after")[0];
      if (editor.document.at(-1).id === inserted.id) editor.insertBlocks([{ type: "paragraph" }], inserted, "after");
    }
    persist(editor); setEditingId(inserted.id);
  }, [editor, persist]);
  // Retain the schema for existing media, but offer only writing commands.
  const getSlashItems = useCallback(async query => filterSuggestionItems(
    combineByGroup(getDefaultReactSlashMenuItems(editor).filter(item => !mediaCommands.has(item.key)),
      getMathSlashMenuItems(editor), getDiagramSlashMenuItems(editor),
      [{ title: "Scientific Illustration", subtext: "Compose a scientific figure from licensed artwork", group: "Study", icon: <Microscope size={18} />, aliases: ["biology", "science", "illustration", "ETC", "canvas"], onItemClick: () => insertIllustration(true) }],
      calloutKinds.map(kind => ({
        title: kind === "warning" ? "Common mistake" : kind[0].toUpperCase() + kind.slice(1),
        subtext: `Write a ${kind} in a colored callout`, group: "Study", icon: <BookOpen size={18} />,
        aliases: ["callout", kind],
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "callout", props: { kind } }),
      })),
    ), query,
  ), [editor, insertIllustration]);

  return <NotebookIllustrationContext.Provider value={{ editingId, setEditingId, persist, saveNow, saveState, saveError, accountId }}>
    {!readOnly && <><NotebookStudyTools editor={editor} onIllustration={() => insertIllustration()} />
    <StudyGuidance accountId={accountId} context="notebook"><p>Type / for equations, diagrams and callouts. Open Illustration Studio in the toolbar to create scientific figures with free illustrations and editable templates. Use Insert for study templates, Format for symbols, and Practice to test your recall. Your notes save as you write.</p></StudyGuidance></>}
    <BlockNoteView className="notebook-writing" editor={editor} theme={theme} slashMenu={false} filePanel={false}
    editable={!readOnly} formattingToolbar={readOnly ? false : undefined} sideMenu={readOnly ? false : undefined}
    onChange={() => { if (!readOnly) onChange?.({ rich_content: editor.document, content: notebookText(editor.document) }); }}>
    {!readOnly && <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems}
      shouldOpen={state => !state.selection.$from.parent.type.isInGroup("tableContent")} />}
  </BlockNoteView></NotebookIllustrationContext.Provider>;
}
