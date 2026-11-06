import React, { useEffect, useRef, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useUsage } from "@/lib/usage";
import { Sparkles, Loader2, X, Info } from "lucide-react";
import AiPrivacyNote from "@/components/AiPrivacyNote";
import StudyResponse from "@/components/StudyResponse";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

/**
 * ExplainPopover: given a ref to a writing surface, shows a floating "Explain" button
 * near the current selection. Clicking it calls /api/ai/explain and shows the
 * result inline. Also opens on right click (context menu) if there's a selection.
 */
export default function ExplainPopover({ textareaRef, containerRef, getSelectedText, subjectName, extraTestId }) {
  const [pos, setPos] = useState(null); // { top, left, text }
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { text, top, left, source }
  const [err, setErr] = useState("");
  const { setRemaining } = useUsage();
  const menuRef = useRef(null);
  const privacyRef = useRef(null);

  useEffect(() => {
    const el = textareaRef?.current;
    if (!el) return;
    let timer;
    const selectedText = () => {
      if (getSelectedText) return getSelectedText().trim();
      const start = el.selectionStart, end = el.selectionEnd;
      return start == null || end == null || start === end ? "" : (el.value || "").slice(start, end).trim();
    };
    const check = () => {
      const text = selectedText();
      if (!text || text.length < 2 || text.length > 300) { setPos(null); return; }
      const selection = window.getSelection();
      const range = getSelectedText && selection?.rangeCount && el.contains(selection.anchorNode) ? selection.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect?.() || el.getBoundingClientRect();
      const containerRect = containerRef?.current?.getBoundingClientRect() || { top: 0, left: 0 };
      setPos({
        top: rect.top - containerRect.top >= 56 ? rect.top - containerRect.top - 56 : rect.bottom - containerRect.top + 8,
        left: Math.min(rect.right - containerRect.left - 180, rect.left - containerRect.left + rect.width / 2 - 60),
        text,
      });
    };
    const onUp = () => { clearTimeout(timer); timer = setTimeout(check, 0); };
    const onKeyUp = event => { if (event.key !== "Escape") onUp(); };
    const onContextMenu = (e) => {
      if (selectedText()) {
        e.preventDefault();
        onUp();
      }
    };
    el.addEventListener("mouseup", onUp);
    el.addEventListener("keyup", onKeyUp);
    el.addEventListener("select", onUp);
    el.addEventListener("contextmenu", onContextMenu);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("mouseup", onUp);
      el.removeEventListener("keyup", onKeyUp);
      el.removeEventListener("select", onUp);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, [textareaRef, containerRef, getSelectedText]);

  useEffect(() => {
    if (!pos) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !privacyRef.current?.contains(e.target)) setPos(null);
    };
    const dismiss = () => setPos(null);
    const onKeyDown = event => { if (event.key === "Escape") dismiss(); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
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
          className="absolute z-30 inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-lg"
          style={{ top: Math.max(0, pos.top), left: Math.max(4, pos.left) }}
          data-testid={extraTestId || "explain-popover"}
        >
          <button
            type="button"
            aria-label="Explain this"
            aria-description="Uses one help after a successful response."
            onClick={explain}
            disabled={busy}
            className="btn btn-primary text-xs"
            data-testid="explain-btn"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Explain this
            <span aria-hidden="true" className="border-l border-current/25 pl-2 ml-1 font-normal">1 help</span>
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="btn btn-ghost btn-icon" aria-label="AI privacy and usage"><Info className="w-4 h-4" /></button>
            </PopoverTrigger>
            <PopoverContent ref={privacyRef} side="top" align="end" collisionPadding={16} aria-label="AI privacy and usage" className="max-w-[calc(100vw-2rem)]" onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}>
              <p className="text-sm font-medium mb-2">AI privacy and usage</p>
              <AiPrivacyNote />
            </PopoverContent>
          </Popover>
        </div>
      )}
      {result && (
        <div className="mt-4 rounded-lg border border-border p-4 bg-accent/40 relative" data-testid="explain-result">
          <button aria-label="Close explanation" className="btn btn-ghost btn-icon absolute right-2 top-2" onClick={() => setResult(null)}><X className="w-3.5 h-3.5" /></button>
          <div className="inline-flex items-center gap-1.5 text-xs section-title mb-2! pr-10"><Sparkles className="w-3.5 h-3.5" /> Explaining "{result.source.slice(0, 40)}{result.source.length > 40 ? "..." : ""}"</div>
          <StudyResponse text={result.text} />
          <AiPrivacyNote className="mt-3" />
        </div>
      )}
      {err && <div className="text-destructive text-xs mt-2">{err}</div>}
    </>
  );
}
