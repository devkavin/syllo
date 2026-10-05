import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ArrowRight, Users } from "lucide-react";

export default function Circles() {
  const { user } = useAuth();
  const [circles, setCircles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingInvite] = useState(() => {
    try { const value = JSON.parse(sessionStorage.getItem("syllo.circleInvite")); return /^[A-Za-z0-9_-]{30,64}$/.test(value?.token) ? value : null; } catch { return null; }
  });
  async function load(id = selected) {
    if (id !== detail?.id) setDetail(null);
    const { data } = await http.get("/circles");
    setCircles(data);
    if (id && data.some(c => c.id === id)) setDetail((await http.get(`/circles/${id}`)).data);
    else { setSelected(null); setDetail(null); }
  }
  useEffect(() => { load().catch(e => setError(formatError(e))).finally(() => setLoading(false)); }, []);
  async function act(action) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) { setError(formatError(e)); } finally { setBusy(false); }
  }
  return <section className="max-w-4xl space-y-6">
    <header><h1 className="font-serif text-3xl">Circles</h1><p className="text-muted-foreground mt-2">A small study group, on your terms. No public feed or rankings.</p></header>
    {pendingInvite && (
      <section aria-labelledby="pending-circle-heading" className="rounded-xl border border-primary/30 bg-accent/60 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Users className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Invitation waiting</p>
            <h2 id="pending-circle-heading" className="mt-1 text-xl font-semibold leading-snug">You have a circle invitation</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">See who you’ll study with before joining. Your notes and tasks stay private.</p>
            <Link className="btn btn-primary mt-4 min-h-11 w-full justify-center gap-2 sm:w-auto" to={`/join/${pendingInvite.token}?ref=${encodeURIComponent(pendingInvite.ref || "")}`}>View invitation<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    )}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Loading your circles…</p> : <>
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); act(async () => { const { data } = await http.post("/circles", { title: name }); setName(""); setSelected(data.id); await load(data.id); }); }}>
        <input aria-label="Circle name" className="input max-w-sm" maxLength={80} required value={name} onChange={e => setName(e.target.value)} placeholder="Name your study circle" />
        <button className="btn btn-primary" disabled={busy || !name.trim()}>Create circle</button>
      </form>
      {!circles.length && <p className="py-6 text-muted-foreground">Create a private circle and invite a few friends. Your notes and tasks stay personal.</p>}
      <nav aria-label="Your circles" className="flex flex-wrap gap-2">{circles.map(c => <button key={c.id} aria-pressed={selected === c.id} className={`btn ${selected === c.id ? "btn-primary" : "btn-outline"}`} disabled={busy} onClick={() => act(async () => { setSelected(c.id); await load(c.id); })}>{c.name}</button>)}</nav>
    </>}
    {detail && <div className="space-y-6 border-t border-border pt-6">
      <div className="flex flex-wrap gap-3 items-center justify-between"><h2 className="font-serif text-2xl">{detail.name}</h2><button className="btn btn-outline" disabled={busy} onClick={() => act(async () => { await navigator.clipboard.writeText(detail.invite_url); setNotice("Invite link copied. Share it only with people you trust."); })}>Copy invite link</button></div>
      <p className="text-sm text-muted-foreground">Anyone with the link can request to join. A new signup uses your existing friend-code allowance; joining or rejoining never earns extra helps.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={detail.share_weekly_time} disabled={busy} onChange={e => { const checked = e.target.checked; act(async () => { await http.patch(`/circles/${selected}/privacy`, { share_weekly_time: checked }); await load(); }); }} />Share my total focus time this week (UTC). Off by default.</label>
      <section><h3 className="font-medium mb-2">Members · {detail.members.length}/30</h3><ul className="divide-y divide-border">{detail.members.map(m => <li key={m.id} className="flex flex-wrap items-center gap-3 py-3"><span>{m.name}{m.id === user.user_id ? " (you)" : ""}</span><span className="text-sm text-muted-foreground">{m.weekly_minutes === null ? "Study time private" : `${m.weekly_minutes} min this week`}</span>{detail.owner_id === user.user_id && m.id !== user.user_id && <button className="btn btn-ghost ml-auto text-xs" disabled={busy} onClick={() => { if (window.confirm(`Remove ${m.name} from this circle?`)) act(async () => { await http.delete(`/circles/${selected}/members/${m.id}`); await load(); }); }}>Remove</button>}</li>)}</ul></section>
      <section><h3 className="font-medium">Our next steps</h3><p className="text-sm text-muted-foreground mt-1">Share a goal, not your private notes. Only you can mark your goal complete.</p>
        <form className="flex flex-wrap gap-2 my-3" onSubmit={e => { e.preventDefault(); act(async () => { await http.post(`/circles/${selected}/goals`, { title: goal }); setGoal(""); await load(); }); }}><input className="input max-w-sm" aria-label="Study goal" maxLength={160} required value={goal} onChange={e => setGoal(e.target.value)} placeholder="For example: practise three limits" /><button className="btn btn-outline" disabled={busy || !goal.trim()}>Share goal</button></form>
        {!detail.goals.length && <p className="text-muted-foreground text-sm py-3">What would you like to work on together?</p>}
        <ul className="divide-y divide-border">{detail.goals.map(g => <li key={g.id} className="flex gap-3 py-3 items-center"><input type="checkbox" aria-label={`Complete ${g.title}`} checked={g.completed} disabled={busy || g.user_id !== user.user_id} onChange={e => { const completed = e.target.checked; act(async () => { await http.patch(`/circles/${selected}/goals/${g.id}`, { completed }); await load(); }); }} /><span className={g.completed ? "line-through text-muted-foreground" : ""}>{g.title}<small className="block text-muted-foreground">{detail.members.find(m => m.id === g.user_id)?.name}</small></span>{g.user_id === user.user_id && <button className="btn btn-ghost text-xs ml-auto" disabled={busy} onClick={() => act(async () => { await http.delete(`/circles/${selected}/goals/${g.id}`); await load(); })}>Remove goal</button>}</li>)}</ul>
      </section>
      <footer className="flex flex-wrap gap-3 border-t border-border pt-4">{detail.owner_id === user.user_id ? <><button className="btn btn-outline" disabled={busy} onClick={() => { if (window.confirm("Replace this invite link? The old link will stop working.")) act(async () => { await http.post(`/circles/${selected}/rotate-invite`); await load(); setNotice("Invite replaced."); }); }}>Replace invite link</button><button className="btn btn-ghost text-destructive" disabled={busy} onClick={() => { if (window.confirm("Delete this circle and its shared goals? Personal study data will stay untouched.")) act(async () => { await http.delete(`/circles/${selected}`); await load(); }); }}>Delete circle</button></> : <button className="btn btn-outline" disabled={busy} onClick={() => { if (window.confirm("Leave this circle and remove your shared goals?")) act(async () => { await http.delete(`/circles/${selected}/members/${user.user_id}`); await load(); }); }}>Leave circle</button>}</footer>
    </div>}
  </section>;
}

export function CircleInvite() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { http.get(`/circles/invite/${encodeURIComponent(token)}`).then(r => setInvite(r.data)).catch(e => setError(formatError(e))); }, [token]);
  const ref = params.get("ref") || invite?.referral_code || "";
  const remember = () => sessionStorage.setItem("syllo.circleInvite", JSON.stringify({ token, ref }));
  return <main className="min-h-screen grid place-items-center p-6"><section className="max-w-md space-y-5"><Link to="/" className="font-serif text-2xl">syllo</Link><h1 className="font-serif text-3xl">{invite ? `Join ${invite.name}` : "A study circle invitation"}</h1><p className="text-muted-foreground">Study alongside your friends. Your notes and tasks stay private, and sharing study time is optional.</p>{error && <p role="alert" className="text-destructive">{error}</p>}{!invite && !error && <p role="status">Checking invitation…</p>}{invite && (user ? <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { await http.post(`/circles/invite/${token}/join`); sessionStorage.removeItem("syllo.circleInvite"); window.location.assign("/circles"); } catch(e) { setError(formatError(e)); setBusy(false); } }}>Join circle</button> : <div className="flex flex-wrap gap-3"><Link className="btn btn-primary" to={`/register?ref=${encodeURIComponent(ref)}`} onClick={remember}>Create free account</Link><Link className="btn btn-outline" to="/login" onClick={remember}>Sign in</Link></div>)}</section></main>;
}
