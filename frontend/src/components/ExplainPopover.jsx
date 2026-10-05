import React, { useEffect, useRef, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useUsage } from "@/lib/usage";
import { Sparkles, Loader2, X } from "lucide-react";
import AiPrivacyNote from "@/components/AiPrivacyNote";
import StudyResponse from "@/components/StudyResponse";

/**
 * ExplainPopover: given a ref to a textarea, shows a floating "Explain" button
 * near the current selection. Clicking it calls /api/ai/explain and shows the
 * result inline. Also opens on right click (context menu) if there's a selection.
 */
export default function ExplainPopover({ textareaRef, containerRef, subjectName, extraTestId }) {
  const [pos, setPos] = useState(null); // { top, left, text }
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { text, top, left, source }
  const [err, setErr] = useState("");
  const { setRemaining } = useUsage();
  const menuRef = useRef(null);

  useEffect(() => {
    const el = textareaRef?.current;
    if (!el) return;
    const check = () => {
      const start = el.selectionStart, end = el.selectionEnd;
      if (start == null || end == null || start === end) { setPos(null); return; }
      const text = (el.value || "").slice(start, end).trim();
      if (!text || text.length < 2 || text.length > 300) { setPos(null); return; }
      // Position: above the textarea's caret end; approximate using bounding box.
      const rect = el.getBoundingClientRect();
      const containerRect = containerRef?.current?.getBoundingClientRect() || { top: 0, left: 0 };
      // place near center-top of the textarea
      setPos({
        top: rect.top - containerRect.top - 40,
        left: Math.min(rect.right - containerRect.left - 180, rect.left - containerRect.left + rect.width / 2 - 60),
        text,
      });
    };
    const onUp = () => setTimeout(check, 0);
    const onSel = () => setTimeout(check, 0);
    const onContextMenu = (e) => {
      const start = el.selectionStart, end = el.selectionEnd;
      if (start !== end) {
        e.preventDefault();
        onUp();
      }
    };
    el.addEventListener("mouseup", onUp);
    el.addEventListener("keyup", onUp);
    el.addEventListener("select", onSel);
    el.addEventListener("contextmenu", onContextMenu);
    return () => {
      el.removeEventListener("mouseup", onUp);
      el.removeEventListener("keyup", onUp);
      el.removeEventListener("select", onSel);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, [textareaRef, containerRef]);

  useEffect(() => {
    if (!pos) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setPos(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pos]);

  const explain = async () => {
    if (!pos?.text) return;
    setBusy(true); setErr("");
    const source = pos.text;
    try {
      const { data } = await http.post("/ai/explain", { concept: source, subject_name: subjectName });
      setResult({ text: data.text, source });
      setRemaining(data.credits_remaining);
      setPos(null);
    } catch (e) { setErr(formatError(e)); }
    finally { setBusy(false); }
  };

  return (
    <>
      {pos && (
        <div
          ref={menuRef}
          className="absolute z-30"
          style={{ top: Math.max(0, pos.top), left: Math.max(4, pos.left) }}
          data-testid={extraTestId || "explain-popover"}
        >
          <button
            onClick={explain}
            disabled={busy}
            className="btn btn-primary text-xs shadow-lg"
            data-testid="explain-btn"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Explain this
          </button>
          <AiPrivacyNote className="mt-2 w-64 rounded-md bg-card p-2 shadow" />
        </div>
      )}
      {result && (
        <div className="mt-4 rounded-lg border border-border p-4 bg-accent/40 relative" data-testid="explain-result">
          <button className="btn btn-ghost !p-1 absolute right-2 top-2" onClick={() => setResult(null)}><X className="w-3.5 h-3.5" /></button>
          <div className="inline-flex items-center gap-1.5 text-xs section-title !mb-2"><Sparkles className="w-3.5 h-3.5" /> Explaining "{result.source.slice(0, 40)}{result.source.length > 40 ? "..." : ""}"</div>
          <StudyResponse text={result.text} />
          <AiPrivacyNote className="mt-3" />
        </div>
      )}
      {err && <div className="text-destructive text-xs mt-2">{err}</div>}
    </>
  );
}
