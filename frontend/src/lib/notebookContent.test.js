import { describe, expect, it } from "vitest";
import { notebookBlocks, notebookText } from "./notebookContent";

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
});
