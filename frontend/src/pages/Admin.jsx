import React, { useEffect, useState } from "react";
import { http, formatError } from "@/lib/api";
import { Users, DollarSign, Sparkles, TrendingUp, Save, Loader2, ShieldCheck, X } from "lucide-react";

const PLAN_LABEL = { freshman: "Freshman", scholar: "Scholar", deans_list: "Dean's List" };

export default function Admin() {
  const [tab, setTab] = useState("overview");
  return (
    <div className="space-y-6" data-testid="admin-page">
      <div className="page-header">
        <div>
          <div className="section-title mb-2 flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" /> Admin</div>
          <h1 className="page-title">Control room</h1>
          <p className="text-muted-foreground mt-2">Users, revenue, AI usage, and app settings.</p>
        </div>
      </div>

      <div className="segmented-control" role="group" aria-label="Admin section">
        {["overview", "users", "transactions", "settings"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            data-testid={`admin-tab-${t}`}
            className="segment capitalize"
          >{t}</button>
        ))}
      </div>

      {tab === "overview" && <Overview />}
      {tab === "users" && <UserManager />}
      {tab === "transactions" && <TransactionsList />}
      {tab === "settings" && <SettingsPanel />}
    </div>
  );
}

function Overview() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { http.get("/admin/overview").then((r) => setD(r.data)).catch((e) => setErr(formatError(e))); }, []);
  if (err) return <div className="text-destructive text-sm">{err}</div>;
  if (!d) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="admin-overview">
      <StatCard label="Total users" value={d.total_users} icon={Users} accent="208 39% 48%" />
      <StatCard label="Paid users" value={d.paid_users} icon={TrendingUp} accent="133 30% 40%" />
      <StatCard label="Revenue" value={`$${(d.revenue_cents / 100).toFixed(2)}`} icon={DollarSign} accent="30 60% 45%" />
      <StatCard label="AI calls" value={`${d.ai_calls} (${d.ai_ok_rate}% ok)`} icon={Sparkles} accent="267 30% 50%" />

      <div className="card-elevated p-5 sm:col-span-2">
        <div className="section-title mb-3">Users by plan</div>
        <div className="space-y-2">
          {Object.entries(d.by_plan).map(([id, n]) => {
            const pct = Math.round((n / Math.max(1, d.total_users)) * 100);
            return (
              <div key={id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{PLAN_LABEL[id] || id}</span>
                  <span className="text-muted-foreground text-xs">{n} ({pct}%)</span>
                </div>
                <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-elevated p-5 sm:col-span-2">
        <div className="section-title mb-2">Signups last 7 days</div>
        <div className="font-serif text-4xl tracking-tight">{d.signups_last_7_days}</div>
        <div className="text-xs text-muted-foreground mt-1">New accounts across all plans.</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="card-elevated p-5 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <div className="section-title">{label}</div>
          <div className="font-serif text-2xl mt-2">{value}</div>
        </div>
        <div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: `hsl(${accent} / 0.12)`, color: `hsl(${accent})` }}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

function UserManager() {
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");
  const [savingId, setSavingId] = useState(null);
  const load = () => http.get("/admin/users").then((r) => setUsers(r.data)).catch((e) => setErr(formatError(e)));
  useEffect(() => { load(); }, []);

  const update = async (uid, patch) => {
    setSavingId(uid);
    try {
      await http.patch(`/admin/users/${uid}`, patch);
      load();
    } catch (e) { setErr(formatError(e)); }
    finally { setSavingId(null); }
  };

  return (
    <div className="card-elevated p-5" data-testid="admin-users">
      {err && <div className="text-destructive text-sm mb-3">{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground text-xs">
              <th className="py-2 pr-2">User</th>
              <th className="py-2 pr-2">Plan</th>
              <th className="py-2 pr-2">Credits</th>
              <th className="py-2 pr-2">Role</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id} className="border-t border-border" data-testid={`admin-user-${u.user_id}`}>
                <td className="py-2 pr-2">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="py-2 pr-2">
                  <select
                    aria-label={`Plan for ${u.name}`}
                    className="input !py-1 !w-auto text-xs"
                    defaultValue={u.plan || "freshman"}
                    onChange={(e) => update(u.user_id, { plan: e.target.value })}
                    data-testid={`admin-user-plan-${u.user_id}`}
                  >
                    <option value="freshman">Freshman</option>
                    <option value="scholar">Scholar</option>
                    <option value="deans_list">Dean's List</option>
                  </select>
                </td>
                <td className="py-2 pr-2 font-mono">{u.ai_credits_remaining ?? 0}</td>
                <td className="py-2 pr-2">
                  <select
                    aria-label={`Role for ${u.name}`}
                    className="input !py-1 !w-auto text-xs"
                    defaultValue={u.role || "user"}
                    onChange={(e) => update(u.user_id, { role: e.target.value })}
                    data-testid={`admin-user-role-${u.user_id}`}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="py-2 text-right text-xs text-muted-foreground">
                  {savingId === u.user_id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : u.created_at?.slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransactionsList() {
  const [txns, setTxns] = useState([]);
  const [err, setErr] = useState("");
  useEffect(() => { http.get("/admin/transactions").then((r) => setTxns(r.data)).catch((e) => setErr(formatError(e))); }, []);
  return (
    <div className="card-elevated p-5" data-testid="admin-transactions">
      {err && <div className="text-destructive text-sm mb-3">{err}</div>}
      {txns.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">No transactions yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground text-xs">
                <th className="py-2">Date</th>
                <th className="py-2">User</th>
                <th className="py-2">Plan</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.session_id} className="border-t border-border">
                  <td className="py-2 text-xs">{t.created_at?.slice(0, 10)}</td>
                  <td className="py-2 text-xs">{t.user_id}</td>
                  <td className="py-2 capitalize">{t.plan_id}</td>
                  <td className="py-2 font-mono">${(t.amount_cents / 100).toFixed(2)}</td>
                  <td className="py-2"><span className="badge">{t.payment_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SettingsPanel() {
  const [current, setCurrent] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => { http.get("/admin/settings").then((r) => setCurrent(r.data)).catch((e) => setErr(formatError(e))); }, []);

  return (
    <div className="space-y-5" data-testid="admin-settings">
      <div className="card-elevated p-5">
        <div className="section-title mb-3">Integrations</div>
        <p className="text-sm text-muted-foreground mb-4">
          Secrets are managed through the deployment environment and are never editable in the browser.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            ["Stripe", current?.stripe_configured],
            ["Google sign-in", current?.google_configured],
            ["Study companion", current?.gemini_configured],
          ].map(([label, ready]) => (
            <div key={label} className="border border-border rounded-lg p-3">
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-muted-foreground mt-1">{ready ? "Configured" : "Not configured"}</div>
            </div>
          ))}
        </div>
        {err && <div className="text-destructive text-sm mt-3">{err}</div>}
      </div>

      {current?.plans && (
        <PlansEditor initialPlans={current.plans} onSaved={async () => {
          const { data } = await http.get("/admin/settings"); setCurrent(data);
        }} />
      )}
    </div>
  );
}

function PlansEditor({ initialPlans, onSaved }) {
  const [plans, setPlans] = useState(initialPlans);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { setPlans(initialPlans); }, [initialPlans]);

  const update = (i, patch) => setPlans((ps) => ps.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  const setFeature = (i, fi, val) => update(i, { features: plans[i].features.map((f, idx) => idx === fi ? val : f) });
  const addFeature = (i) => update(i, { features: [...(plans[i].features || []), "New benefit"] });
  const removeFeature = (i, fi) => update(i, { features: plans[i].features.filter((_, idx) => idx !== fi) });

  const save = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      await http.patch("/admin/settings", { plans });
      setMsg("Plans updated. New checkouts use these numbers.");
      onSaved?.();
    } catch (e) { setErr(formatError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card-elevated p-5" data-testid="plans-editor">
      <div className="section-title mb-3">Edit plans</div>
      <p className="text-sm text-muted-foreground mb-4">Rename plans, change prices, credits, and features. Plan IDs are used in payment records so keep them stable.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p, i) => (
          <div key={p.id} className="border border-border rounded-lg p-4 space-y-2" data-testid={`plan-editor-${p.id}`}>
            <label htmlFor={`plan-name-${p.id}`} className="field-label">Name</label>
            <input id={`plan-name-${p.id}`} className="input" value={p.name} onChange={(e) => update(i, { name: e.target.value })} data-testid={`plan-name-${p.id}`} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={`plan-price-${p.id}`} className="field-label">Price ($/mo)</label>
                <input id={`plan-price-${p.id}`} type="number" min={0} step="0.01" className="input"
                  value={(p.price_cents / 100).toString()}
                  onChange={(e) => update(i, { price_cents: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)) })}
                  data-testid={`plan-price-${p.id}`}
                />
              </div>
              <div>
                <label htmlFor={`plan-credits-${p.id}`} className="field-label">Credits/mo</label>
                <input id={`plan-credits-${p.id}`} type="number" min={0} className="input"
                  value={p.credits}
                  onChange={(e) => update(i, { credits: Math.max(0, parseInt(e.target.value || "0", 10)) })}
                  data-testid={`plan-credits-${p.id}`}
                />
              </div>
            </div>
            <label className="text-xs text-muted-foreground pt-1 block">Features</label>
            <div className="space-y-1.5">
              {(p.features || []).map((f, fi) => (
                <div key={fi} className="flex gap-1">
                  <input aria-label={`${p.name} feature ${fi + 1}`} className="input" value={f} onChange={(e) => setFeature(i, fi, e.target.value)} data-testid={`plan-feature-${p.id}-${fi}`} />
                  <button aria-label={`Remove feature ${fi + 1} from ${p.name}`} className="btn btn-ghost btn-icon" type="button" onClick={() => removeFeature(i, fi)} title="Remove"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <button className="btn btn-ghost text-xs" type="button" onClick={() => addFeature(i)} data-testid={`plan-feature-add-${p.id}`}>+ Add feature</button>
            </div>
            <div className="text-xs text-muted-foreground mt-1">id: {p.id}</div>
          </div>
        ))}
      </div>
      {msg && <div className="text-primary text-sm mt-3">{msg}</div>}
      {err && <div className="text-destructive text-sm mt-3">{err}</div>}
      <div className="flex justify-end mt-4">
        <button className="btn btn-primary" onClick={save} disabled={busy} data-testid="plans-save">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save plans
        </button>
      </div>
    </div>
  );
}
