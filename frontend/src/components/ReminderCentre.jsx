import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { shouldNotifyDigest } from "@/lib/reminderPolicy";

const browserKey = owner => `syllo.reminders.browser.${encodeURIComponent(owner)}`;
const deliveredKey = (owner, date) => `syllo.reminders.delivered.${encodeURIComponent(owner)}.${date}`;
const pendingDeliveries = new Set();
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const sessionHref = href => typeof href === "string" && href.startsWith("/") && !href.startsWith("//") ? href : "/planner";
const showBrowserAlert = (title, options) => new Promise((resolve, reject) => {
  const notification = new Notification(title, options);
  const finish = error => {
    window.clearTimeout(timeout);
    notification.removeEventListener("show", shown);
    notification.removeEventListener("error", failed);
    if (error) reject(error); else resolve();
  };
  const shown = () => finish();
  const failed = () => finish(new Error("Browser notification failed"));
  const timeout = window.setTimeout(failed, 10000);
  notification.addEventListener("show", shown, { once: true });
  notification.addEventListener("error", failed, { once: true });
});

export default function ReminderCentre({ userId }) {
  const [state, setState] = useState({ owner: null, prefs: null, digest: null, error: "", loading: false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let live = true, request = 0, delivering = false;
    setState({ owner: userId, prefs: null, digest: null, error: "", loading: true });
    const deliver = async (prefs, digest, current) => {
      const sentKey = deliveredKey(userId, digest.date);
      const allowed = () => shouldNotifyDigest({ enabled: prefs.enabled && read(browserKey(userId)) === "true", permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission, digest, deliveredDate: read(sentKey) === "true" ? digest.date : null });
      if (delivering || pendingDeliveries.has(sentKey) || !allowed()) return;
      delivering = true;
      pendingDeliveries.add(sentKey);
      try {
        const send = async () => {
          if (!current() || !allowed()) return;
          const registration = await navigator.serviceWorker?.getRegistration?.();
          if (!current() || !allowed()) return;
          const options = { body: `${digest.total_count} things to review in your daily digest.`, tag: `syllo-reminders-${userId}-${digest.date}` };
          if (registration?.showNotification) await registration.showNotification("Your Syllo reminders", options);
          else await showBrowserAlert("Your Syllo reminders", options);
          if (live) localStorage.setItem(sentKey, "true");
        };
        if (navigator.locks?.request) await navigator.locks.request(sentKey, send);
        else await send();
      } catch {
        if (live) setState(state => ({ ...state, error: "Could not deliver the browser alert. Your in-app reminders are below." }));
      } finally { delivering = false; pendingDeliveries.delete(sentKey); }
    };
    const load = async () => {
      const version = ++request;
      const current = () => live && version === request;
      try {
        const { data: prefs } = await http.get("/study/reminders");
        if (!current()) return;
        if (!prefs.enabled) { setState({ owner: userId, prefs, digest: null, error: "", loading: false }); return; }
        const { data: digest } = await http.get("/study/reminders/digest");
        if (!current()) return;
        setState({ owner: userId, prefs, digest, error: "", loading: false });
        await deliver(prefs, digest, current);
      } catch (error) { if (current()) setState(state => ({ ...state, error: formatError(error), loading: false })); }
    };
    const changed = event => { if (!event.detail?.userId || event.detail.userId === userId) load(); };
    const stored = event => { if (event.key === browserKey(userId)) load(); };
    load();
    const interval = window.setInterval(load, 60000);
    window.addEventListener("focus", load);
    window.addEventListener("syllo:reminders-changed", changed);
    window.addEventListener("storage", stored);
    return () => {
      live = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", load);
      window.removeEventListener("syllo:reminders-changed", changed);
      window.removeEventListener("storage", stored);
    };
  }, [userId, retry]);

  if (!userId) return null;
  const current = state.owner === userId ? state : { digest: null, prefs: null, error: "", loading: true };
  const digest = current.digest;
  if (current.prefs && !current.prefs.enabled && !current.error) return null;
  return <div className="space-y-2">
    {current.loading && <p role="status" className="text-xs text-muted-foreground">Loading reminders…</p>}
    {current.error && <div role="alert" className="notice flex flex-wrap items-center gap-2 text-sm">{current.error}<button className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>Retry reminders</button></div>}
    {digest && <details className="rounded-lg border border-border px-3 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium">Reminders · {digest.total_count} due</summary><div className="space-y-3 pb-3">
      <p className="text-xs text-muted-foreground">{digest.date} · {digest.timezone}{digest.quiet ? " · Quiet hours" : ""}</p>
      {digest.total_count === 0 && <p>Nothing due in your digest.</p>}
      {(digest.practice_due.questions > 0 || digest.practice_due.mistakes > 0) && <div><p>{digest.practice_due.questions} question{digest.practice_due.questions === 1 ? "" : "s"} · {digest.practice_due.mistakes} mistake{digest.practice_due.mistakes === 1 ? "" : "s"} due</p><Link className="action-link" to="/reviews">Start practice</Link></div>}
      {digest.tasks.length > 0 && <section><h3 className="font-medium">Due tasks</h3><ul>{digest.tasks.map(task => <li key={task.task_id} className="flex flex-wrap items-center gap-x-3"><Link className="action-link break-words" to={`/tasks?task=${encodeURIComponent(task.task_id)}`}>{task.title}</Link>{task.due_date && <span className="text-xs text-muted-foreground">Due {task.due_date}</span>}</li>)}</ul></section>}
      {digest.sessions.length > 0 && <section><h3 className="font-medium">Planned sessions</h3><ul>{digest.sessions.map((session, index) => <li key={`${session.href}-${index}`}><Link className="action-link break-words" to={sessionHref(session.href)}>{session.title}</Link></li>)}</ul></section>}
      <Link className="action-link" to="/settings">Reminder settings</Link>
    </div></details>}
  </div>;
}
