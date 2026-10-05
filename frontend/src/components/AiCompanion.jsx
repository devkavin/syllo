import React, { useEffect, useRef, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useUsage } from "@/lib/usage";
import { BookOpen, X, Send, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import AiPrivacyNote from "@/components/AiPrivacyNote";
import { recentChatContext } from "@/lib/chatContext";
import HelpUsage from "@/components/HelpUsage";
import StudyResponse from "@/components/StudyResponse";
import { TODAY_STARTER } from "@/lib/studyPrompts";

export default function AiCompanion({ open, onClose, contextLabel }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { usage, setRemaining, refresh } = useUsage();
  const scroller = useRef(null);
  const composer = useRef(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: "model", isGreeting: true, text: contextLabel
        ? `What would you like to understand about ${contextLabel}?`
        : "Ask about a topic, try a practice question, or work out what to study next." }]);
    }
  }, [open, contextLabel, messages.length]);

  useEffect(() => {
    scroller.current?.scrollTo?.({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput(""); setErr("");
    const history = recentChatContext(messages);
    setMessages((m) => [...m, { role: "user", text }, { role: "model", text: "", pending: true }]);
    setBusy(true);
    try {
      const { data } = await http.post("/ai/chat", { message: text, history });
      setMessages((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = { role: "model", text: data.text || "..." };
        return copy;
      });
      setRemaining(data.credits_remaining);
    } catch (e) {
      const msg = formatError(e);
      setErr(msg);
      setMessages((m) => m.slice(0, -2));
      setInput(text);
      refresh();
    } finally { setBusy(false); }
  };

  if (!open) return null;
  const outOfCredits = usage && usage.credits_remaining <= 0;

  return (
    <div className="fixed inset-0 z-50" data-testid="ai-companion">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-card border-l border-border shadow-xl flex flex-col fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: "hsl(267 30% 92%)", color: "hsl(267 40% 32%)" }}>
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="font-serif text-lg leading-none">Study Companion</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {usage ? `${usage.credits_remaining} helps left` : "..."}
              </div>
            </div>
          </div>
          <button aria-label="Close Study Companion" className="btn btn-ghost !p-1.5" onClick={onClose} data-testid="ai-close"><X className="w-4 h-4" /></button>
        </div>

        <div ref={scroller} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`px-3.5 py-2.5 text-sm ${
                  m.role === "user"
                    ? "max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm whitespace-pre-wrap"
                    : "max-w-full text-foreground"
                }`}
                data-testid={`ai-msg-${m.role}`}
              >
                {m.pending
                  ? <span role="status" className="inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Working…</span>
                  : m.role === "model" ? <StudyResponse text={m.text} /> : m.text}
              </div>
            </div>
          ))}
          {!messages.some((m) => m.role === "user") && !outOfCredits && (
            <button className="w-full rounded-lg border border-border p-3 text-left text-sm leading-relaxed text-muted-foreground hover:bg-accent" onClick={() => { setInput(TODAY_STARTER); composer.current?.focus(); }}>{TODAY_STARTER}</button>
          )}
        </div>

        {err && <div className="px-4 pb-2 text-destructive text-xs">{err}</div>}
        <HelpUsage usage={usage} className="px-4 py-3 border-t border-border" />
        <AiPrivacyNote className="px-4 py-2 border-t border-border" />
        {outOfCredits ? (
          <div className="p-4 border-t border-border text-center text-sm">
            <div className="mb-2 text-muted-foreground">Your Study Companion helps are used for now. Your notes, tasks and focus timer are still available.</div>
            {usage?.billing_enabled && <Link to="/upgrade" className="btn btn-primary w-full" onClick={onClose} data-testid="ai-upgrade-cta">See plans</Link>}
          </div>
        ) : (
          <div className="p-3 border-t border-border flex items-end gap-2">
            <textarea
              className="input resize-none min-h-[44px] max-h-32"
              ref={composer}
              rows={1}
              maxLength={3000}
              aria-label="Your study question"
              placeholder="Ask a study question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              data-testid="ai-input"
            />
            <button aria-label="Send question" className="btn btn-primary" onClick={send} disabled={busy || !input.trim()} data-testid="ai-send">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
