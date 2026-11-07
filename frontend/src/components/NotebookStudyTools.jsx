import React, { useEffect, useRef, useState } from "react";
import { Microscope } from "lucide-react";

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

const equationTemplates = {
  "Quadratic formula": "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
  "Water potential": "\\Psi = \\Psi_s + \\Psi_p",
  "Gibbs free energy": "\\Delta G = \\Delta H - T\\Delta S",
  "Henderson–Hasselbalch": "\\text{pH} = \\text{p}K_a + \\log\\left(\\frac{[\\text{A}^-]}{[\\text{HA}]}\\right)",
  "Michaelis–Menten": "v = \\frac{V_{\\max}[S]}{K_m + [S]}",
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

export default function NotebookStudyTools({ editor, onIllustration }) {
  const [outline, setOutline] = useState(() => headingOutline(editor.document));
  const [styles, setStyles] = useState(() => editor.getActiveStyles());
  const [openMenu, setOpenMenu] = useState(null);
  const toolbarRef = useRef(null);
  const closeMenu = () => setOpenMenu(null);
  const toggleMenu = (event, name) => {
    event.preventDefault();
    setOpenMenu(current => current === name ? null : name);
  };

  useEffect(() => {
    if (!openMenu) return;
    const onOutside = event => {
      const menu = toolbarRef.current?.querySelector("details[open]");
      if (menu && !menu.contains(event.target)) setOpenMenu(null);
    };
    const onEscape = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      toolbarRef.current?.querySelector("details[open] > summary")?.focus();
      setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("focusin", onOutside, true);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("focusin", onOutside, true);
      document.removeEventListener("keydown", onEscape, true);
    };
  }, [openMenu]);

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

  function insertMathBlock(latex = "") {
    editor.focus();
    const current = editor.getTextCursorPosition().block.id;
    const inserted = editor.insertBlocks([{ type: "mathBlock", content: latex ? [{ type: "text", text: latex, styles: {} }] : [] }], current, "after");
    if (inserted.length) editor.setTextCursorPosition(inserted[0].id, "end");
    editor.focus();
  }

  function insertInlineMath(latex = "") {
    editor.focus();
    editor.insertInlineContent([{ type: "math", content: latex ? [{ type: "text", text: latex, styles: {} }] : [] }]);
    editor.focus();
  }

  return <div ref={toolbarRef} role="toolbar" aria-label="Notebook study tools" className="relative flex flex-wrap items-center gap-1 border-b border-border pb-2 mb-3 text-sm">
    <details className="static" open={openMenu === "insert"}>
      <summary className="btn btn-ghost cursor-pointer" aria-expanded={openMenu === "insert"} onMouseDown={preserveSelection} onClick={event => toggleMenu(event, "insert")}>Insert</summary>
      <div className="absolute left-0 top-full z-30 mt-1 w-64 max-w-full max-h-[60dvh] overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-md">
        {onIllustration && <><button type="button" className="btn btn-ghost w-full justify-start" onMouseDown={preserveSelection} onClick={() => { closeMenu(); onIllustration(); }}><Microscope size={17} />Scientific Illustration</button><p className="px-3 py-2 text-xs text-muted-foreground">Scientific vectors and labels. No AI credits.</p></>}
        <p className="px-3 py-2 text-xs font-semibold text-muted-foreground border-t border-border">Equations (LaTeX)</p>
        <button type="button" className="btn btn-ghost w-full justify-start" onMouseDown={preserveSelection} onClick={() => { insertMathBlock(); closeMenu(); }}>Block equation</button>
        <button type="button" className="btn btn-ghost w-full justify-start" onMouseDown={preserveSelection} onClick={() => { insertInlineMath(); closeMenu(); }}>Inline equation</button>
        {Object.entries(equationTemplates).map(([name, latex]) => <button key={name} type="button" className="btn btn-ghost w-full justify-start text-xs" onMouseDown={preserveSelection} onClick={() => { insertMathBlock(latex); closeMenu(); }}>{name}</button>)}
        <p className="px-3 py-2 text-xs font-semibold text-muted-foreground border-t border-border">Study templates</p>
        {Object.keys(templates).map(name => <button key={name} type="button" className="btn btn-ghost w-full justify-start" onMouseDown={preserveSelection} onClick={() => { insertTemplate(name); closeMenu(); }}>{name}</button>)}
        <p className="px-3 py-2 text-xs text-muted-foreground">Insert after the current block.</p>
      </div>
    </details>
    <details className="static" open={openMenu === "format"}>
      <summary className="btn btn-ghost cursor-pointer" aria-expanded={openMenu === "format"} onMouseDown={preserveSelection} onClick={event => toggleMenu(event, "format")}>Format</summary>
      <div className="absolute left-0 top-full z-30 mt-1 w-72 max-w-full max-h-[60dvh] overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-md">
        <div className="flex flex-wrap gap-2 border-b border-border pb-2 mb-3">
          <button type="button" className="btn btn-ghost" aria-label="Superscript" aria-pressed={!!styles.superscript} onMouseDown={preserveSelection} onClick={() => { scriptStyle("superscript", "subscript"); closeMenu(); }}>x<sup>2</sup><span className="text-xs">Superscript</span></button>
          <button type="button" className="btn btn-ghost" aria-label="Subscript" aria-pressed={!!styles.subscript} onMouseDown={preserveSelection} onClick={() => { scriptStyle("subscript", "superscript"); closeMenu(); }}>x<sub>2</sub><span className="text-xs">Subscript</span></button>
        </div>
        {Object.entries(symbolGroups).map(([group, symbols]) => <fieldset key={group} className="mb-2 last:mb-0">
          <legend className="text-xs text-muted-foreground mb-1">{group}</legend>
          <div className="flex flex-wrap gap-1">{symbols.map(symbol => <button key={symbol} type="button" className="btn btn-ghost min-w-10 px-2 font-mono" aria-label={`Insert ${symbol}`} onMouseDown={preserveSelection}
            onClick={() => { editor.focus(); editor.insertInlineContent(symbol); closeMenu(); }}>{symbol}</button>)}</div>
        </fieldset>)}
      </div>
    </details>
    <details className="static" open={openMenu === "outline"}>
      <summary className="btn btn-ghost cursor-pointer" aria-expanded={openMenu === "outline"} onMouseDown={preserveSelection} onClick={event => toggleMenu(event, "outline")}>Outline</summary>
      <nav aria-label="Notebook outline" className="absolute left-0 top-full z-30 mt-1 w-64 max-w-full max-h-[60dvh] overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-md">
        {outline.length ? outline.map(heading => <button key={heading.id} type="button" className="btn btn-ghost w-full justify-start text-left" style={{ paddingLeft: `${0.5 + (heading.level - 1) * 0.75}rem` }} onMouseDown={preserveSelection}
          onClick={() => {
            editor.setTextCursorPosition(heading.id, "start"); editor.focus(); closeMenu();
            Array.from(editor.domElement?.querySelectorAll("[data-id]") || []).find(node => node.dataset.id === heading.id)
              ?.scrollIntoView?.({ block: "start", behavior: "smooth" });
          }}>{heading.text}</button>) : <p className="p-2 text-muted-foreground">Add headings to navigate your notes.</p>}
      </nav>
    </details>
    {onIllustration && <button type="button" className="btn btn-outline ml-auto gap-2 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10" aria-haspopup="dialog" title="Create a scientific diagram with licensed illustrations and editable templates. No AI credits." onMouseDown={preserveSelection} onClick={() => { closeMenu(); onIllustration(); }}><Microscope size={17} aria-hidden="true" /><span>Illustration Studio</span><span aria-hidden="true" className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold">Free</span></button>}
  </div>;
}
