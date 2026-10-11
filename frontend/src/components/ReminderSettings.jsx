import React, { useEffect, useRef, useState } from "react";
import { http, formatError } from "@/lib/api";

const browserKey = owner => `syllo.reminders.browser.${encodeURIComponent(owner)}`;
const notifyChange = userId => window.dispatchEvent(new CustomEvent("syllo:reminders-changed", { detail: { userId } }));
const hasBrowserAlerts = owner => {
  try { return localStorage.getItem(browserKey(owner)) === "true"; } catch { return false; }
};

export default function ReminderSettings({ userId }) {
  const [state, setState] = useState({ owner: null, form: null, error: "", message: "", busy: false, browser: false });
  const [retry, setRetry] = useState(0);
  const account = useRef({ userId, active: false, saving: false });
  if (account.current.userId !== userId) account.current = { userId, active: false, saving: false };

  useEffect(() => {
    if (!userId) return;
    let live = true;
    const scope = account.current; scope.active = true;
    setState({ owner: userId, form: null, error: "", message: "", busy: false, browser: hasBrowserAlerts(userId) });
    http.get("/study/reminders").then(({ data }) => { if (live) setState(current => ({ ...current, form: data })); })
      .catch(error => { if (live) setState(current => ({ ...current, error: formatError(error) })); });
    return () => { live = false; scope.active = false; };
  }, [userId, retry]);

  if (!userId) return null;
  const current = state.owner === userId ? state : { form: null, error: "", message: "", busy: false, browser: false };
  const supported = typeof Notification !== "undefined" && typeof Notification.requestPermission === "function";
  const change = (name, value) => setState(state => ({ ...state, form: { ...state.form, [name]: value }, message: "" }));

  const save = async (browser = false) => {
    const scope = account.current;
    if (!current.form || scope.saving) return;
    const active = () => scope.active && account.current === scope;
    scope.saving = true;
    setState(state => ({ ...state, busy: true, error: "", message: "" }));
    try {
      if (browser) {
        const permission = await Notification.requestPermission();
        if (!active()) return;
        if (permission !== "granted") throw new Error("Browser permission was not granted. You can still use in-app reminders.");
      }
      if (!active()) return;
      const body = { ...current.form, ...(browser && { enabled: true }) };
      const { data } = await http.patch("/study/reminders", body);
      if (!active()) return;
      setState(state => ({ ...state, form: data }));
      if (browser) {
        localStorage.setItem(browserKey(userId), "true");
        setState(state => ({ ...state, browser: true }));
      }
      notifyChange(userId);
      setState(state => ({ ...state, message: browser ? "Browser alerts enabled" : "Reminder settings saved" }));
    } catch (error) { if (active()) setState(state => ({ ...state, error: formatError(error) })); }
    finally {
      scope.saving = false;
      if (active()) setState(state => ({ ...state, busy: false }));
    }
  };

  const disableBrowserAlerts = () => {
    try {
      localStorage.removeItem(browserKey(userId));
      setState(state => ({ ...state, browser: false, error: "", message: "Browser alerts disabled" }));
      notifyChange(userId);
    } catch (error) { setState(state => ({ ...state, error: formatError(error) })); }
  };

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Browser reminders appear while Syllo is open.</p>
    {!current.form && !current.error && <p role="status" className="text-sm">Loading reminder settings…</p>}
    {current.error && <div role="alert" className="notice text-sm">{current.error}{!current.form && <button className="btn btn-outline ml-2" onClick={() => setRetry(value => value + 1)}>Retry reminder settings</button>}</div>}
    {current.form && <form className="space-y-4" onSubmit={event => { event.preventDefault(); save(); }} aria-label="Reminder settings">
      <fieldset disabled={current.busy} className="space-y-4 min-w-0">
        <label className="flex min-h-11 items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="accent-primary" checked={current.form.enabled} onChange={event => change("enabled", event.target.checked)} />In-app reminders</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">Quiet hours start<input type="time" required className="input mt-1" value={current.form.quiet_start} onChange={event => change("quiet_start", event.target.value)} /></label>
          <label className="block text-sm">Quiet hours end<input type="time" required className="input mt-1" value={current.form.quiet_end} onChange={event => change("quiet_end", event.target.value)} /></label>
          <label className="block text-sm">Digest time<input type="time" required className="input mt-1" value={current.form.digest_time} onChange={event => change("digest_time", event.target.value)} /></label>
        </div>
        <p className="text-xs text-muted-foreground">Times follow your account timezone. Browser alerts wait until quiet hours end.</p>
        <div className="flex flex-wrap gap-2"><button className="btn btn-outline" disabled={current.busy}>{current.busy ? "Saving…" : "Save reminder settings"}</button>{current.browser ? <button type="button" className="btn btn-ghost" onClick={disableBrowserAlerts}>Disable browser alerts</button> : <button type="button" className="btn btn-ghost" disabled={!supported} onClick={() => save(true)}>Enable browser alerts</button>}</div>
        {!supported && <p className="text-xs text-muted-foreground">Browser alerts are not supported on this device. You can still use the in-app digest.</p>}
      </fieldset>
    </form>}
    {current.message && <p role="status" className="text-sm text-primary">{current.message}</p>}
  </div>;
}
