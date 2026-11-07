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

function inlineMarkdown(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(inlineMarkdown).join("");
  if (!content) return "";
  if (content.type === "math") {
    const latex = inlineText(content.content).trim();
    return latex ? `$${latex}$` : "";
  }
  if (content.type === "link") {
    const label = inlineMarkdown(content.content) || content.href || "";
    return content.href ? `[${label}](${content.href})` : label;
  }
  let text = typeof content.text === "string" ? content.text : inlineMarkdown(content.content);
  if (!text) return "";
  const styles = content.styles || {};
  if (styles.code) text = `\`${text}\``;
  if (styles.bold) text = `**${text}**`;
  if (styles.italic) text = `*${text}*`;
  if (styles.strike) text = `~~${text}~~`;
  if (styles.superscript) text = `<sup>${text}</sup>`;
  if (styles.subscript) text = `<sub>${text}</sub>`;
  return text;
}

function tableMarkdown(block) {
  const rows = (block.content?.rows || []).map(row =>
    (row.cells || []).map(cell => inlineMarkdown(cell).replace(/\|/g, "\\|").replace(/\n+/g, " ").trim())
  );
  if (!rows.length) return "";
  const width = Math.max(1, ...rows.map(r => r.length));
  const padded = rows.map(r => Array.from({ length: width }, (_, i) => r[i] || ""));
  const header = `| ${padded[0].join(" | ")} |`;
  const divider = `| ${padded[0].map(() => "---").join(" | ")} |`;
  const body = padded.slice(1).map(r => `| ${r.join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

function blocksMarkdown(blocks, depth = 0) {
  const indent = "  ".repeat(depth);
  let numberedIndex = 0;
  return blocks.map(block => {
    if (block.type === "numberedListItem") numberedIndex += 1;
    else numberedIndex = 0;
    let line = "";
    const text = inlineMarkdown(block.content);
    if (block.type === "heading") {
      const level = Math.min(6, Math.max(1, Number(block.props?.level) || 1));
      line = `${"#".repeat(level)} ${text}`;
    } else if (block.type === "bulletListItem") {
      line = `${indent}- ${text}`;
    } else if (block.type === "numberedListItem") {
      line = `${indent}${numberedIndex}. ${text}`;
    } else if (block.type === "checkListItem") {
      line = `${indent}- [${block.props?.checked ? "x" : " "}] ${text}`;
    } else if (block.type === "mathBlock") {
      line = `$$\n${inlineText(block.content).trim()}\n$$`;
    } else if (block.type === "diagram") {
      line = `\`\`\`mermaid\n${inlineText(block.content).trim()}\n\`\`\``;
    } else if (block.type === "callout") {
      const kind = block.props?.kind === "warning" ? "Common mistake" : (block.props?.kind || "note");
      const label = kind[0].toUpperCase() + kind.slice(1);
      line = `> **${label}:** ${text}`;
    } else if (block.type === "table") {
      line = tableMarkdown(block);
    } else if (block.type === "scientificIllustration") {
      const summary = illustrationText(block).split("\n").filter(Boolean);
      const heading = summary[0] || "Scientific illustration";
      const labels = summary.slice(1);
      line = labels.length ? `> **[Figure: ${heading}]**\n> Labels: ${labels.join(" · ")}` : `> **[Figure: ${heading}]**`;
    } else {
      line = `${indent}${text}`;
    }
    if (block.children?.length) {
      const childDepth = ["bulletListItem", "numberedListItem", "checkListItem"].includes(block.type) ? depth + 1 : depth;
      return `${line}\n${blocksMarkdown(block.children, childDepth)}`;
    }
    return line;
  }).join("\n\n");
}

export function notebookMarkdown(notebook) {
  if (!notebook) return "";
  const title = (notebook.title || "").trim();
  const blocks = notebookBlocks(notebook);
  const body = blocksMarkdown(blocks).trim();
  if (title && body) return `# ${title}\n\n${body}\n`;
  if (title) return `# ${title}\n`;
  return body ? `${body}\n` : "";
}
