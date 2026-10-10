import React from "react";
import { BlockNoteSchema } from "@blocknote/core";
import { createReactBlockSpec, createReactStyleSpec } from "@blocknote/react";
import { createReactMathBlockSpec, createReactInlineMathSpec } from "@blocknote/math-block";
import { createReactDiagramBlockSpec } from "@blocknote/diagram-block";

export const calloutKinds = ["note", "definition", "formula", "example", "warning"];

const callout = createReactBlockSpec({
  type: "callout",
  propSchema: { kind: { default: "note", values: calloutKinds } },
  content: "inline",
}, {
  render: ({ block, editor, contentRef }) => <aside className="notebook-callout" data-kind={block.props.kind}>
    <select aria-label="Callout type" contentEditable={false} value={block.props.kind}
      onChange={event => editor.updateBlock(block, { props: { kind: event.target.value } })}>
      {calloutKinds.map(kind => <option key={kind} value={kind}>{kind === "warning" ? "Common mistake" : kind[0].toUpperCase() + kind.slice(1)}</option>)}
    </select>
    <div ref={contentRef} className="notebook-callout-content" />
  </aside>,
  toExternalHTML: ({ block, contentRef }) => <aside><strong>{block.props.kind}: </strong><span ref={contentRef} /></aside>,
});

export const notebookSchema = BlockNoteSchema.create().extend({
  blockSpecs: { mathBlock: createReactMathBlockSpec(), diagram: createReactDiagramBlockSpec(), callout: callout() },
  inlineContentSpecs: { math: createReactInlineMathSpec() },
  styleSpecs: {
    superscript: createReactStyleSpec({ type: "superscript", propSchema: "boolean" }, { render: ({ contentRef }) => <sup ref={contentRef} /> }),
    subscript: createReactStyleSpec({ type: "subscript", propSchema: "boolean" }, { render: ({ contentRef }) => <sub ref={contentRef} /> }),
  },
});
