import { describe, expect, it } from "vitest";
import { notebookBlocks, notebookMarkdown, notebookText } from "./notebookContent";

describe("notebook content", () => {
  it("opens legacy text literally and preserves blank lines", () => {
    const blocks = notebookBlocks({ content: "<b>Not HTML</b>\n\nLast line\n" });
    expect(blocks).toHaveLength(4);
    expect(blocks[0].content[0].text).toBe("<b>Not HTML</b>");
    expect(notebookText(blocks)).toBe("<b>Not HTML</b>\n\nLast line\n");
  });
  it("restores rich formatting instead of interpreting the plain text", () => {
    const rich = [{ type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Cells", styles: { textColor: "blue" } }] }];
    expect(notebookBlocks({ content: "Cells", rich_content: rich })).toEqual(rich);
  });
  it("extracts readable plain text from nested lists, links, and tables", () => {
    const blocks = [
      { type: "bulletListItem", content: [{ type: "text", text: "Read " }, { type: "link", href: "https://example.com", content: [{ type: "text", text: "chapter" }] }], children: [{ type: "paragraph", content: [{ type: "text", text: "Then revise" }] }] },
      { type: "table", content: { type: "tableContent", rows: [{ cells: [[{ type: "text", text: "Stage" }], { type: "tableCell", content: [{ type: "text", text: "Detail" }] }] }, { cells: [[{ type: "text", text: "Prophase" }], [{ type: "text", text: "Chromosomes condense" }]] }] } },
    ];
    expect(notebookText(blocks)).toBe("Read chapter\nThen revise\nStage\tDetail\nProphase\tChromosomes condense");
  });
  it("opens an empty notebook with one editable paragraph", () => {
    expect(notebookBlocks({ content: "" })).toEqual([{ type: "paragraph", content: [] }]);
    expect(notebookText(notebookBlocks({ content: "" }))).toBe("");
  });
  it("keeps equation and diagram source readable in plain-text saves", () => {
    expect(notebookText([
      { type: "mathBlock", content: [{ type: "text", text: "x^2", styles: {} }] },
      { type: "paragraph", content: [{ type: "text", text: "Energy: " }, { type: "math", content: [{ type: "text", text: "E=mc^2", styles: {} }] }] },
      { type: "diagram", content: [{ type: "text", text: "graph TD\n A --> B", styles: {} }] },
    ])).toBe("x^2\nEnergy: E=mc^2\ngraph TD\n A --> B");
  });
  it("serializes rich notes, equations, callouts, tables and figures to portable Markdown", () => {
    const md = notebookMarkdown({
      title: "Bioenergetics",
      rich_content: [
        { type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Free energy", styles: {} }] },
        { type: "paragraph", content: [{ type: "text", text: "Given ", styles: { bold: true } }, { type: "math", content: [{ type: "text", text: "\\Delta G < 0", styles: {} }] }, { type: "text", text: " for H", styles: {} }, { type: "text", text: "2", styles: { subscript: true } }, { type: "text", text: "O", styles: {} }] },
        { type: "mathBlock", content: [{ type: "text", text: "\\Delta G = \\Delta H - T\\Delta S", styles: {} }] },
        { type: "callout", props: { kind: "warning" }, content: [{ type: "text", text: "Check temperature units in Kelvin.", styles: {} }] },
        { type: "checkListItem", props: { checked: true }, content: [{ type: "text", text: "Review glycolysis", styles: {} }] },
        { type: "table", content: { rows: [{ cells: [[{ type: "text", text: "Step" }], [{ type: "text", text: "ATP" }]] }, { cells: [[{ type: "text", text: "Payoff" }], [{ type: "text", text: "4" }]] }] } },
        { type: "scientificIllustration", props: { caption: "Mitochondrial gradient", document: JSON.stringify({ title: "ETC", objects: [{ type: "text", text: "ATP synthase" }] }) } },
      ],
    });
    expect(md).toContain("# Bioenergetics");
    expect(md).toContain("## Free energy");
    expect(md).toContain("**Given **$\\Delta G < 0$ for H<sub>2</sub>O");
    expect(md).toContain("$$\n\\Delta G = \\Delta H - T\\Delta S\n$$");
    expect(md).toContain("> **Common mistake:** Check temperature units in Kelvin.");
    expect(md).toContain("- [x] Review glycolysis");
    expect(md).toContain("| Step | ATP |\n| --- | --- |\n| Payoff | 4 |");
    expect(md).toContain("> **[Figure: Mitochondrial gradient]**\n> Labels: ATP synthase");
  });
});
