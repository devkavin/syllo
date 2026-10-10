import React from "react";

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-medium">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded-sm bg-accent px-1 font-mono text-xs">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return /^https?:\/\//i.test(link[2]) ? <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{link[1]}</a> : link[1];
    return part;
  });
}

// Model output is treated as text throughout; no HTML is interpreted.
export default function StudyResponse({ text }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) { i++; continue; }
    if (lines[i].startsWith("```")) {
      const code = []; i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={blocks.length} className="overflow-x-auto rounded-md bg-accent p-3 text-xs"><code>{code.join("\n")}</code></pre>);
      continue;
    }
    if (/^#{1,6}\s/.test(lines[i])) {
      blocks.push(<p key={blocks.length} className="font-medium">{inline(lines[i++].replace(/^#{1,6}\s+/, ""))}</p>);
      continue;
    }
    const ordered = /^\d+[.)]\s/.test(lines[i]);
    if (ordered || /^[-*]\s/.test(lines[i])) {
      const items = [], start = ordered ? Number(lines[i].match(/^\d+/)[0]) : undefined;
      const pattern = ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/;
      while (i < lines.length && pattern.test(lines[i])) items.push(<li key={items.length}>{inline(lines[i++].replace(pattern, ""))}</li>);
      blocks.push(ordered ? <ol key={blocks.length} start={start} className="list-decimal space-y-1 pl-5">{items}</ol> : <ul key={blocks.length} className="list-disc space-y-1 pl-5">{items}</ul>);
      continue;
    }
    const paragraph = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|[-*]\s|\d+[.)]\s|```)/.test(lines[i])) paragraph.push(lines[i++]);
    blocks.push(<p key={blocks.length} className="whitespace-pre-wrap">{inline(paragraph.join("\n"))}</p>);
  }
  return <div className="space-y-3 break-words text-sm leading-relaxed">{blocks}</div>;
}
