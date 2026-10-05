import React, { useState } from "react";
import { http, formatError } from "@/lib/api";
import { useUsage } from "@/lib/usage";
import StudyResponse from "@/components/StudyResponse";
import AiPrivacyNote from "@/components/AiPrivacyNote";

export default function WeeklyReflection() {
  const { setRemaining } = useUsage(); const [text, setText] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generate = async () => { setBusy(true); setError(""); try { const { data } = await http.get("/ai/reflection"); setText(data.text); setRemaining(data.credits_remaining); } catch (e) { setError(formatError(e)); } finally { setBusy(false); } };
  return <section aria-labelledby="weekly-reflection-heading" className="text-sm border-t border-border pt-5"><h2 id="weekly-reflection-heading" className="text-lg font-semibold">Your week, in perspective</h2><p className="mt-3 mb-3 text-muted-foreground">A short look back and one next step. Uses one study help.</p>{text ? <StudyResponse text={text} /> : <button className="btn btn-outline" disabled={busy} onClick={generate}>{busy ? "Working…" : "Reflect on my week"}</button>}<AiPrivacyNote className="mt-3" />{error && <p role="alert">{error}</p>}</section>;
}
