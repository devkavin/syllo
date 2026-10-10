import React, { useEffect, useState } from "react";

const symbolGroups = {
  Greek: ["α", "β", "γ", "δ", "ε", "θ", "λ", "μ", "π", "ρ", "σ", "φ", "ω", "Δ", "Σ", "Ω"],
  Math: ["±", "×", "÷", "≈", "≠", "≤", "≥", "∞", "√", "∑", "∫", "∂", "∈", "∝"],
  Arrows: ["→", "←", "↔", "↑", "↓", "⇒", "⇌"],
  Units: ["°", "°C", "°F", "µm", "µg", "Ω", "Å", "mol", "kg", "m/s", "m/s²"],
};

const templates = {
  "Cornell notes": [
    ["heading", "Topic and date"], ["paragraph", "Topic:  | Date: "],
    ["heading", "Cues and questions"], ["bulletListItem", "What question does this section answer?"],
    ["heading", "Notes"], ["paragraph", "Record the main ideas, evidence and examples."],
    ["heading", "Summary"], ["paragraph", "Explain the main idea in your own words."],
  ],
  "Lab report": [
    ["heading", "Aim"], ["paragraph", "What are you investigating?"],
    ["heading", "Hypothesis"], ["paragraph", "Prediction and scientific reasoning:"],
    ["heading", "Materials and method"], ["numberedListItem", "Record materials, steps and controlled variables."],
    ["heading", "Results"], ["paragraph", "Observations, measurements and units:"],
    ["heading", "Discussion"], ["paragraph", "Interpret results and identify uncertainty or limitations."],
    ["heading", "Conclusion"], ["paragraph", "Answer the aim using your evidence."],
  ],
  "Worked problem": [
    ["heading", "Problem"], ["paragraph", "Write the question."],
    ["heading", "Given and required"], ["bulletListItem", "Known values and units:"], ["bulletListItem", "Find:"],
    ["heading", "Method"], ["paragraph", "Choose a formula or strategy and explain why."],
    ["heading", "Working"], ["numberedListItem", "Show each step."],
    ["heading", "Answer and check"], ["paragraph", "State the answer with units; check that it makes sense."],
  ],
  Vocabulary: [
    ["heading", "Word or term"], ["paragraph", "Term:"],
    ["heading", "Meaning"], ["paragraph", "Definition in your own words:"],
    ["heading", "Example"], ["paragraph", "Use the term in a sentence or give a real example."],
    ["heading", "Connections"], ["bulletListItem", "Related words, synonyms or contrasts:"],
    ["heading", "Recall"], ["paragraph", "Write a question to test yourself later."],
  ],
};

function inlineText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(item => item.text || inlineText(item.content)).join("");
}

function headingOutline(blocks) {
  return blocks.flatMap(block => [
    ...(block.type === "heading" ? [{ id: block.id, level: block.props?.level || 1, text: inlineText(block.content) || "Untitled heading" }] : []),
    ...headingOutline(block.children || []),
  ]);
}

const preserveSelection = event => event.preventDefault();
const closeMenu = event => { event.currentTarget.closest("details").open = false; };

export default function NotebookStudyTools({ editor }) {
  const [outline, setOutline] = useState(() => headingOutline(editor.document));
  const [styles, setStyles] = useState(() => editor.getActiveStyles());

  useEffect(() => {
    const refresh = () => setOutline(headingOutline(editor.document));
    refresh();
    return editor.onChange(refresh);
  }, [editor]);

  useEffect(() => {
    const refresh = () => setStyles(editor.getActiveStyles());
    refresh();
    return editor.onSelectionChange?.(refresh);
  }, [editor]);

  function scriptStyle(style, opposite) {
    editor.focus();
    editor.removeStyles({ [opposite]: true });
    editor.toggleStyles({ [style]: true });
    setStyles(editor.getActiveStyles());
  }

  function insertTemplate(name) {
    editor.focus();
    const current = editor.getTextCursorPosition().block.id;
    const blocks = [
      { type: "heading", props: { level: 1 }, content: name },
      ...templates[name].map(([type, content]) => ({ type, ...(type === "heading" ? { props: { level: 2 } } : {}), content })),
    ];
    const inserted = editor.insertBlocks(blocks, current, "after");
    if (inserted.length) editor.setTextCursorPosition(inserted[0].id, "end");
    editor.focus();
  }

  return <div role="toolbar" aria-label="Notebook study tools" className="flex flex-wrap items-center gap-2 border-b border-border pb-3 mb-3 text-sm">
    <details className="relative">
      <summary className="btn btn-ghost cursor-pointer">Symbols</summary>
      <div className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[80vw] rounded-lg border border-border bg-popover p-3 shadow-md">
        {Object.entries(symbolGroups).map(([group, symbols]) => <fieldset key={group} className="mb-2 last:mb-0">
          <legend className="text-xs text-muted-foreground mb-1">{group}</legend>
          <div className="flex flex-wrap gap-1">{symbols.map(symbol => <button key={symbol} type="button" className="btn btn-ghost min-w-10 px-2 font-mono" aria-label={`Insert ${symbol}`} onMouseDown={preserveSelection}
            onClick={event => { editor.focus(); editor.insertInlineContent(symbol); closeMenu(event); }}>{symbol}</button>)}</div>
        </fieldset>)}
      </div>
    </details>
    <button type="button" className="btn btn-ghost" aria-label="Superscript" aria-pressed={!!styles.superscript} onMouseDown={preserveSelection} onClick={() => scriptStyle("superscript", "subscript")}>x<sup>2</sup></button>
    <button type="button" className="btn btn-ghost" aria-label="Subscript" aria-pressed={!!styles.subscript} onMouseDown={preserveSelection} onClick={() => scriptStyle("subscript", "superscript")}>x<sub>2</sub></button>
    <details className="relative">
      <summary className="btn btn-ghost cursor-pointer">Templates</summary>
      <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-popover p-2 shadow-md">
        <p className="px-2 py-1 text-xs text-muted-foreground">Insert after the current block.</p>
        {Object.keys(templates).map(name => <button key={name} type="button" className="btn btn-ghost w-full justify-start" onMouseDown={preserveSelection} onClick={event => { insertTemplate(name); closeMenu(event); }}>{name}</button>)}
      </div>
    </details>
    <details className="relative">
      <summary className="btn btn-ghost cursor-pointer">Outline</summary>
      <nav aria-label="Notebook outline" className="absolute right-0 top-full z-30 mt-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-md">
        {outline.length ? outline.map(heading => <button key={heading.id} type="button" className="btn btn-ghost w-full justify-start text-left" style={{ paddingLeft: `${0.5 + (heading.level - 1) * 0.75}rem` }} onMouseDown={preserveSelection}
          onClick={event => {
            editor.setTextCursorPosition(heading.id, "start"); editor.focus(); closeMenu(event);
            Array.from(editor.domElement?.querySelectorAll("[data-id]") || []).find(node => node.dataset.id === heading.id)
              ?.scrollIntoView?.({ block: "start", behavior: "smooth" });
          }}>{heading.text}</button>) : <p className="p-2 text-muted-foreground">Add headings to navigate your notes.</p>}
      </nav>
    </details>
  </div>;
}
