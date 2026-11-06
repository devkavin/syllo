import React, { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { createDocument, duplicateDocument, parseDocument } from "./document";
import IllustrationSvg from "./IllustrationSvg";
import { generatePreview } from "./export";
import "./studio.css";

const ScientificStudio = lazy(() => import("./ScientificStudio"));
export const NotebookIllustrationContext = createContext({});

function ScientificFigure({ block, editor }) {
  const { editingId, setEditingId, persist, saveNow, saveState, saveError, accountId } = useContext(NotebookIllustrationContext);
  const [localOpen, setLocalOpen] = useState(false), [previewError, setPreviewError] = useState("");
  const parsed = useMemo(() => {
    try { return { document: block.props.document ? parseDocument(block.props.document) : createDocument() }; }
    catch (error) { return { error: error.message }; }
  }, [block.props.document]);
  const open = localOpen || editingId === block.id;
  const close = () => { setLocalOpen(false); setEditingId?.(null); };
  const update = useCallback(props => {
    if (!editor.isEditable || !editor.getBlock(block.id)) throw new Error("This figure is no longer editable in this notebook.");
    editor.updateBlock(block.id, { props });
    persist?.(editor);
  }, [editor, block.id, persist]);
  const draft = useCallback(doc => update({ document: JSON.stringify(doc), preview: "" }), [update]);

  return <figure className="scientific-note-figure" contentEditable={false} style={{ maxWidth: `${block.props.displayWidth}%` }} data-testid="scientific-note-figure">
    {parsed.error ? <p className="scientific-figure-error" role="alert">This saved figure could not be opened: {parsed.error} The original document is retained.</p>
      : <IllustrationSvg document={parsed.document} prefix={`note-${block.id}`} />}
    {editor.isEditable ? <>
      <input className="scientific-caption" aria-label="Figure caption" placeholder="Add a caption…" maxLength={1000} value={block.props.caption} onChange={event => update({ caption: event.target.value })} />
      <div className="scientific-note-actions">
        {!parsed.error && <button aria-label="Edit scientific illustration" onClick={() => setLocalOpen(true)}><Pencil size={13} />Edit illustration</button>}
        {!parsed.error && <button aria-label="Duplicate scientific illustration" onClick={() => {
          editor.insertBlocks([{ type: "scientificIllustration", props: { ...block.props, document: JSON.stringify(duplicateDocument(parsed.document)) } }], block.id, "after"); persist?.(editor);
        }}><Copy size={13} />Duplicate</button>}
        <button aria-label="Remove scientific illustration" onClick={() => { editor.removeBlocks([block.id]); persist?.(editor); }}><Trash2 size={13} />Remove</button>
        <label>Display<select aria-label="Figure display width" value={block.props.displayWidth} onChange={event => update({ displayWidth: Number(event.target.value) })}>{[25, 50, 75, 100].map(width => <option key={width} value={width}>{width}%</option>)}</select></label>
      </div>
    </> : block.props.caption && <figcaption>{block.props.caption}</figcaption>}
    {previewError && <p className="scientific-figure-error" role="status">{previewError}</p>}
    {open && editor.isEditable && !parsed.error && <Suspense fallback={<p role="status">Opening illustration studio…</p>}><ScientificStudio initialDocument={parsed.document} accountId={accountId} onDraft={draft} saveState={saveState} saveError={saveError} onClose={() => {
      close();
      // Leave a writing position after figures at the end of a note.
      const current = editor.getBlock(block.id);
      if (current) { editor.setTextCursorPosition(current, "end"); const next = editor.getTextCursorPosition().nextBlock; if (next?.type === "paragraph") editor.setTextCursorPosition(next, "start"); }
    }} onSave={async doc => {
      // Persist the structure first. A preview failure must never discard edits.
      draft(doc);
      try { const preview = await generatePreview(doc); update({ preview }); setPreviewError(""); }
      catch { setPreviewError("PNG preview unavailable. The editable vector figure is retained and displayed below."); }
      return saveNow ? saveNow() : true;
    }} /></Suspense>}
  </figure>;
}

export const scientificIllustrationBlock = createReactBlockSpec({
  type: "scientificIllustration",
  propSchema: { document: { default: "" }, preview: { default: "" }, caption: { default: "" }, displayWidth: { default: 100 } },
  content: "none",
}, {
  render: props => <ScientificFigure {...props} />,
  toExternalHTML: ({ block }) => {
    let doc;
    try { doc = parseDocument(block.props.document); } catch { return <figure><figcaption>{block.props.caption || "Scientific illustration"}</figcaption></figure>; }
    return <figure>{block.props.preview ? <img src={block.props.preview} alt={doc.title} /> : <IllustrationSvg document={doc} />}<figcaption>{block.props.caption || doc.title}</figcaption></figure>;
  },
});
