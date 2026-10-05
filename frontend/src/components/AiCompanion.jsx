import React, { useEffect, useRef, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useUsage } from "@/lib/usage";
import { BookOpen, Send, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Link } from "react-router-dom";
import AiPrivacyNote from "@/components/AiPrivacyNote";
import { recentChatContext } from "@/lib/chatContext";
import HelpUsage from "@/components/HelpUsage";
import StudyResponse from "@/components/StudyResponse";
import { TODAY_STARTER } from "@/lib/studyPrompts";

export default function AiCompanion({ open, onClose, contextLabel, fallbackFocusRef }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { usage, setRemaining, refresh } = useUsage();
  const scroller = useRef(null);
  const composer = useRef(null);
  const returnFocus = useRef(document.activeElement);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: "model", isGreeting: true, text: contextLabel
        ? `What would you like to understand about ${contextLabel}?`
        : "Ask about a topic, try a practice question, or work out what to study next." }]);
    }
  }, [open, contextLabel, messages.length]);

  useEffect(() => {
    scroller.current?.scrollTo?.({ top: scroller.current.scrollHeight, behavior: "auto" });
  }, [messages]);

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
    <Sheet open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <SheetContent className="w-full sm:w-[440px] sm:max-w-[440px] bg-card flex flex-col p-0 gap-0" data-testid="ai-companion" closeLabel="Close Study Companion" closeTestId="ai-close" aria-describedby={undefined}
        onOpenAutoFocus={event => { if (composer.current) { event.preventDefault(); composer.current.focus(); } }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const opener = returnFocus.current;
          const target = opener?.isConnected && opener !== document.body && opener !== document.documentElement ? opener : fallbackFocusRef?.current;
          target?.focus();
        }}>
        <div className="flex items-center justify-between px-5 py-4 pr-16 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg grid place-items-center bg-secondary text-primary">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <SheetTitle className="font-display text-lg">Study Companion</SheetTitle>
              <div className="text-xs text-muted-foreground mt-0.5">
                {usage ? `${usage.credits_remaining} helps left` : "..."}
              </div>
            </div>
          </div>
        </div>

        <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4">
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

        {err && <div role="alert" className="px-4 pb-2 text-destructive text-sm">{err}</div>}
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
              className="input resize-none !min-h-11 max-h-32"
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
            <button aria-label="Send question" className="btn btn-primary btn-icon" onClick={send} disabled={busy || !input.trim()} data-testid="ai-send">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
