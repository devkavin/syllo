// Treat old notes as literal text, never as HTML or Markdown.
export function notebookBlocks(notebook) {
  if (Array.isArray(notebook.rich_content) && notebook.rich_content.length) return notebook.rich_content;
  return (notebook.content || "").split("\n").map(text => ({
    type: "paragraph",
    content: text ? [{ type: "text", text, styles: {} }] : [],
  }));
}

function inlineText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(inlineText).join("");
  if (!content) return "";
  if (typeof content.text === "string") return content.text;
  return inlineText(content.content);
}

export function notebookText(blocks) {
  return blocks.map(block => {
    const content = block.type === "table"
      ? (block.content?.rows || []).map(row => row.cells.map(inlineText).join("\t")).join("\n")
      : block.type === "scientificIllustration" ? illustrationText(block) : inlineText(block.content) || block.props?.caption || "";
    return block.children?.length ? `${content}\n${notebookText(block.children)}` : content;
  }).join("\n");
}

function illustrationText(block) {
  try {
    const doc = JSON.parse(block.props.document);
    return [block.props.caption || doc.title, ...(doc.objects || []).filter(obj => obj.type === "text").map(obj => obj.text)].filter(Boolean).join("\n");
  } catch { return block.props?.caption || "Scientific illustration"; }
}
