import React, { useEffect, useRef, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useUsage } from "@/lib/usage";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import AiPrivacyNote from "@/components/AiPrivacyNote";

export default function AiCompanion({ open, onClose, contextLabel }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { usage, setRemaining, refresh } = useUsage();
  const scroller = useRef(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: "model", text: contextLabel
        ? `Hi. I can help you with ${contextLabel}. Ask me anything.`
        : "Hi. Ask me to explain a topic, give you a practice question, or plan a short study session." }]);
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
    const history = messages
      .filter((m) => m.text)
      .slice(-12)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 2000) }));
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
      setMessages((m) => m.slice(0, -1));
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
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="font-serif text-lg leading-none">Study Companion</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {usage ? `${usage.credits_remaining} helps left` : "..."}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost !p-1.5" onClick={onClose} data-testid="ai-close"><X className="w-4 h-4" /></button>
        </div>

        <div ref={scroller} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-accent text-foreground rounded-bl-sm"
                }`}
                data-testid={`ai-msg-${m.role}`}
              >
                {m.pending
                  ? <span className="inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> thinking</span>
                  : m.text}
              </div>
            </div>
          ))}
        </div>

        {err && <div className="px-4 pb-2 text-destructive text-xs">{err}</div>}
        <AiPrivacyNote className="px-4 py-2 border-t border-border" />
        {outOfCredits ? (
          <div className="p-4 border-t border-border text-center text-sm">
            <div className="mb-2 text-muted-foreground">You've used your helps for the month.</div>
            <Link to="/upgrade" className="btn btn-primary w-full" onClick={onClose} data-testid="ai-upgrade-cta">
              See plans
            </Link>
          </div>
        ) : (
          <div className="p-3 border-t border-border flex items-end gap-2">
            <textarea
              className="input resize-none min-h-[44px] max-h-32"
              rows={1}
              placeholder="Ask something calm..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              data-testid="ai-input"
            />
            <button className="btn btn-primary" onClick={send} disabled={busy || !input.trim()} data-testid="ai-send">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
