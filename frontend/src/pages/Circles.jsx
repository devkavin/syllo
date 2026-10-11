import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, ArrowRight, Plus, Users, ShieldCheck } from "lucide-react";
import CircleSchedule from "@/components/CircleSchedule";
import CircleGoals from "@/components/CircleGoals";
import Modal from "@/components/Modal";
import { CircleActions, CircleShare, CircleJoin } from "@/components/CircleControls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Circles() {
  const { user } = useAuth();
  return <CircleLibrary key={user?.user_id || "guest"} user={user} />;
}

function CircleLibrary({ user }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const selected = params.get("circle");
  const [circles, setCircles] = useState(null);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const live = useRef(true);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const [pendingInvite] = useState(() => {
    try { const value = JSON.parse(sessionStorage.getItem("syllo.circleInvite")); return /^[A-Za-z0-9_-]{30,64}$/.test(value?.token) ? value : null; } catch { return null; }
  });
  useEffect(() => {
    let live = true;
    http.get("/circles").then(result => { if (live) { setCircles(result.data); setError(""); } }).catch(error => { if (live) setError(formatError(error)); });
    return () => { live = false; };
  }, [version]);
  const create = async event => {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { const { data } = await http.post("/circles", { title: name.trim() }); if (!live.current || selectedRef.current) return; setDialog(null); setName(""); setVersion(n => n + 1); navigate(`/circles?circle=${encodeURIComponent(data.id)}`); }
    catch (error) { setError(formatError(error)); }
    finally { lock.current = false; setBusy(false); }
  };
  if (selected) return <CircleWorkspace key={selected} id={selected} user={user} onLibraryChange={() => setVersion(n => n + 1)} />;
  return <section className="mx-auto w-full max-w-5xl space-y-6" data-testid="circles-page">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Better together</p><h1 className="page-title mt-2">Circles</h1><p className="mt-2 text-muted-foreground">Your small study group. Make a plan, share a goal, show up together.</p></div><div className="flex flex-wrap gap-2"><button className="btn btn-primary min-h-11" onClick={() => { setError(""); setDialog("create"); }}><Plus aria-hidden="true" size={16} />Create circle</button><button className="btn btn-outline min-h-11" onClick={() => setDialog("join")}>Join with link</button></div></header>
    {pendingInvite && <section aria-labelledby="pending-circle-heading" className="rounded-2xl border border-primary/30 bg-accent/60 p-5"><p className="text-xs font-semibold text-primary">Invitation waiting</p><h2 id="pending-circle-heading" className="mt-1 text-lg font-semibold">You have a circle invitation</h2><p className="mt-2 text-sm text-muted-foreground">Check your invitation before joining. Your notes and tasks stay private.</p><Link className="btn btn-primary min-h-11 mt-4" to={`/join/${pendingInvite.token}?ref=${encodeURIComponent(pendingInvite.ref || "")}`}>View invitation<ArrowRight aria-hidden="true" size={16} /></Link></section>}
    {error && !dialog && <p role="alert" className="text-destructive">{error} <button className="btn btn-outline" onClick={() => setVersion(n => n + 1)}>Try again</button></p>}
    {circles === null ? <p role="status">Loading your circles…</p> : !circles.length ? <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><Users aria-hidden="true" className="mx-auto mb-4 text-primary" size={36} /><h2 className="font-display text-2xl">Find your study people</h2><p className="mx-auto mt-3 max-w-md text-muted-foreground">Create a private circle and invite a few friends. Your notes and tasks stay personal.</p><ol className="mt-6 flex flex-col justify-center gap-3 text-sm sm:flex-row sm:gap-8"><li>1. Invite your friends</li><li>2. Plan your next session</li><li>3. Study at your own pace</li></ol></div> : <nav aria-label="Your circles" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{circles.map(circle => <Link key={circle.id} to={`/circles?circle=${encodeURIComponent(circle.id)}`} className="group flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"><Users aria-hidden="true" size={24} className="mb-5 text-primary" /><h2 className="break-words text-lg font-semibold">{circle.name}</h2><p className="mt-1 text-sm text-muted-foreground">{circle.owner_id === user?.user_id ? "Created by you" : "Member"}</p><span className="mt-6 flex items-center justify-between text-sm font-medium text-primary">Open circle<ArrowRight aria-hidden="true" size={18} /></span></Link>)}</nav>}
    <p className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck aria-hidden="true" size={18} className="shrink-0" />Personal notes stay yours. You choose whether to share study time or availability.</p>
    {dialog === "join" && <CircleJoin onClose={() => setDialog(null)} />}
    {dialog === "create" && <Modal title="Create a circle" description="Give your group a name. Invite friends after creating it." onClose={() => { if (!busy) setDialog(null); }}><form onSubmit={create} className="space-y-4"><label className="block text-sm font-medium">Circle name<input className="input mt-2" maxLength={80} required value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder="e.g. Physics friends" /></label>{error && <p role="alert" className="text-destructive text-sm">{error}</p>}<button className="btn btn-primary min-h-11 w-full" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create circle"}</button></form></Modal>}
  </section>;
}

function CircleWorkspace({ id, user, onLibraryChange }) {
  const [circle, setCircle] = useState(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(false);
  const [notice, setNotice] = useState("");
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const lock = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const tab = ["sessions", "goals", "members"].includes(params.get("tab")) ? params.get("tab") : "sessions";
  useEffect(() => {
    let live = true;
    http.get(`/circles/${id}`).then(result => { if (live) { setCircle(result.data); setError(""); } }).catch(error => { if (live) setError(formatError(error)); });
    return () => { live = false; };
  }, [id, version]);
  const refresh = () => setVersion(n => n + 1);
  const act = async action => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    let saved = false;
    try {
      await action(); saved = true;
      if (!live.current) return;
      const { data } = await http.get(`/circles/${id}`);
      if (live.current) setCircle(data);
    } catch (error) {
      if (live.current) { if (saved) { setCircle(null); setShare(false); } setError(saved ? `Change saved, but the circle couldn’t refresh. ${formatError(error)}` : formatError(error)); }
    } finally { lock.current = false; if (live.current) setBusy(false); }
  };
  const remove = () => {
    const owner = circle.owner_id === user.user_id;
    if (window.confirm(owner ? "Delete this circle, its shared goals and study sessions? Personal notes, tasks and recorded study time are kept." : "Leave this circle and remove your shared goals? Personal notes, tasks and recorded study time are kept.")) act(async () => { await http.delete(owner ? `/circles/${id}` : `/circles/${id}/members/${user.user_id}`); if (live.current) { onLibraryChange(); navigate("/circles"); } });
  };
  return <section className="mx-auto w-full max-w-5xl space-y-6" data-testid="circles-page">
    <Link className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground" to="/circles"><ArrowLeft aria-hidden="true" size={16} />All circles</Link>
    {error && <p role="alert" className="text-destructive">{error} <button className="btn btn-outline" onClick={refresh}>Try again</button></p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    {!circle ? !error && <p role="status">Opening circle…</p> : <>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h1 className="page-title break-words">{circle.name}</h1><p className="mt-2 text-sm text-muted-foreground">{circle.members.length} {circle.members.length === 1 ? "member" : "members"} · Your private study group</p></div><button className={`btn min-h-11 shrink-0 ${circle.members.length < 2 ? "btn-primary" : "btn-outline"}`} disabled={busy} onClick={() => setShare(true)}><Users aria-hidden="true" size={16} />Invite friends</button></header>
      <Tabs value={tab} onValueChange={value => { const next = new URLSearchParams(params); next.set("tab", value); setParams(next, { replace: true }); }}>
        <TabsList aria-label="Circle sections" className="grid h-auto w-full grid-cols-3 sm:max-w-md"><TabsTrigger value="sessions" className="min-h-11">Sessions</TabsTrigger><TabsTrigger value="goals" className="min-h-11">Goals</TabsTrigger><TabsTrigger value="members" className="min-h-11">Members</TabsTrigger></TabsList>
        <TabsContent value="sessions" className="mt-6"><CircleSchedule circle={circle} user={user} /></TabsContent>
        <TabsContent value="goals" className="mt-6"><CircleGoals circle={circle} user={user} busy={busy} act={act} error={error} /></TabsContent>
        <TabsContent value="members" className="mt-6"><h2 className="text-lg font-semibold">Your study group</h2><p className="mt-1 text-sm text-muted-foreground">Invite people you trust. Up to 30 members in each circle.</p><ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card px-4">{circle.members.map(member => <li key={member.id} className="flex min-w-0 items-center gap-3 py-4"><span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent font-medium text-primary">{member.name.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="break-words font-medium">{member.name}{member.id === user.user_id ? " (you)" : ""}{member.id === circle.owner_id ? " · Owner" : ""}</p><p className="text-sm text-muted-foreground">{member.weekly_minutes == null ? "Study time private" : `${member.weekly_minutes} min this week (UTC)`}</p></div>{circle.owner_id === user.user_id && member.id !== user.user_id && <CircleActions label={`Options for ${member.name}`} disabled={busy} items={[{ label: "Remove member", destructive: true, action: () => { if (window.confirm(`Remove ${member.name} from this circle? Their personal study data is kept.`)) act(() => http.delete(`/circles/${id}/members/${member.id}`)); } }]} />}</li>)}</ul></TabsContent>
      </Tabs>
      <details className="rounded-xl border border-border bg-card"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium">Circle settings</summary><div className="space-y-4 border-t border-border p-4"><p className="text-sm text-muted-foreground">Your sharing preferences apply only to this circle.</p><label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={!!circle.share_weekly_time} disabled={busy} onChange={event => { const checked = event.target.checked; act(() => http.patch(`/circles/${id}/privacy`, { share_weekly_time: checked })); }} /><span>Share my total focus time this week (UTC)<small className="block text-muted-foreground">Off by default. Members see your weekly total, never your study history.</small></span></label><label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={!!circle.share_availability} disabled={busy} onChange={event => { const checked = event.target.checked; act(() => http.patch(`/circles/${id}/privacy`, { share_availability: checked })); }} /><span>Share my availability for common-time suggestions<small className="block text-muted-foreground">Off by default. Only matching slots are shared, never calendar details.</small></span></label><Link className="action-link inline-flex min-h-11 items-center text-sm" to="/settings">Set my available hours</Link><p className="text-sm text-muted-foreground">Accepted sessions appear in your Planner and optional daily reminders. <Link className="action-link" to="/settings">Manage reminders</Link></p><div className="flex items-center justify-between gap-3 border-t border-border pt-4"><span className="text-sm text-muted-foreground">{circle.owner_id === user.user_id ? "Manage this circle" : "Your membership"}</span><CircleActions label="Circle management" disabled={busy} items={[...(circle.owner_id === user.user_id ? [{ label: "Replace invite link", action: () => { if (window.confirm("Replace this invite link? The old link will stop working.")) act(async () => { await http.post(`/circles/${id}/rotate-invite`); setNotice("Invite replaced. Share the new link from Invite friends."); }); } }] : []), { label: circle.owner_id === user.user_id ? "Delete circle" : "Leave circle", destructive: true, action: remove }]} /></div></div></details>
      {share && <CircleShare circle={circle} onClose={() => setShare(false)} />}
    </>}
  </section>;
}

export function CircleInvite() {
  const { token } = useParams();
  const { user } = useAuth();
  return <InviteLanding key={`${token}:${user?.user_id || "guest"}`} token={token} user={user} />;
}
function InviteLanding({ token, user }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { let live = true; setError(""); http.get(`/circles/invite/${encodeURIComponent(token)}`).then(result => { if (live) setInvite(result.data); }).catch(error => { if (live) setError(formatError(error)); }); return () => { live = false; }; }, [token, version]);
  const ref = params.get("ref") || invite?.referral_code || "";
  const remember = () => sessionStorage.setItem("syllo.circleInvite", JSON.stringify({ token, ref }));
  const join = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const { data } = await http.post(`/circles/invite/${encodeURIComponent(token)}/join`); if (!live.current) return; sessionStorage.removeItem("syllo.circleInvite"); navigate(`/circles?circle=${encodeURIComponent(data.id)}`, { replace: true }); }
    catch (error) { if (live.current) setError(formatError(error)); } finally { lock.current = false; if (live.current) setBusy(false); }
  };
  return <main className="min-h-screen grid place-items-center bg-muted/30 px-4 py-8"><section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"><Link to="/" className="font-serif text-2xl">syllo</Link><div className="mt-8 mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-primary"><Users aria-hidden="true" size={28} /></div><p className="text-xs font-semibold uppercase tracking-widest text-primary">You’re invited to study together</p><h1 className="page-title mt-3 break-words">{invite ? `Join ${invite.name}` : "A study circle invitation"}</h1><p className="mt-4 text-muted-foreground">Plan sessions, share goals and keep each other going.</p><div className="my-6 rounded-xl bg-muted p-4 text-sm leading-relaxed">Your notes and tasks stay private. Sharing study time and availability is optional. Joining makes you a member immediately.</div>{error && <div role="alert" className="mb-4 text-sm text-destructive">{error}{!invite && <><p className="mt-2">The link may have been replaced. Ask your friend for a new one.</p><button className="btn btn-outline min-h-11 mt-3" onClick={() => setVersion(n => n + 1)}>Check again</button></>}</div>}{!invite && !error && <p role="status">Checking invitation…</p>}{invite && (user ? <button className="btn btn-primary min-h-11 w-full" disabled={busy} onClick={join}>{busy ? "Joining…" : "Join circle"}</button> : <div className="space-y-3"><Link className="btn btn-primary min-h-11 w-full" to={`/register?ref=${encodeURIComponent(ref)}`} onClick={remember}>Create free account</Link><Link className="btn btn-outline min-h-11 w-full" to="/login" onClick={remember}>Sign in</Link></div>)}</section></main>;
}
