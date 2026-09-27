import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { http, formatError } from "@/lib/api";

export default function Settings() {
  const { user, updateMe } = useAuth();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(user?.name || "");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const save = async () => {
    setMsg(""); setErr("");
    try {
      await updateMe({ name, theme });
      setMsg("Saved.");
    } catch (e) { setErr(formatError(e)); }
  };

  const seed = async () => {
    setMsg(""); setErr("");
    try { await http.post("/seed"); setMsg("Sample data added if your workspace was empty."); }
    catch (e) { setErr(formatError(e)); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8" data-testid="settings-page">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Small preferences that make Syllo yours.</p>
      </div>

      <section className="card p-5 space-y-3">
        <h2 className="font-serif text-xl">Profile</h2>
        <label className="text-xs text-muted-foreground">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} data-testid="settings-name" />
        <label className="text-xs text-muted-foreground">Email</label>
        <input className="input" value={user?.email || ""} disabled />
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-serif text-xl">Appearance</h2>
        <div className="flex gap-2">
          {["light", "dark"].map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              data-testid={`theme-${t}`}
              className={`btn ${theme === t ? "btn-primary" : "btn-outline"}`}
            >{t === "light" ? "Light" : "Dark"}</button>
          ))}
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-serif text-xl">Data</h2>
        <p className="text-sm text-muted-foreground">Add a small set of sample subjects and tasks to your workspace if it's empty.</p>
        <button className="btn btn-outline" onClick={seed} data-testid="settings-seed">Add sample data</button>
      </section>

      {msg && <div className="text-primary text-sm" data-testid="settings-msg">{msg}</div>}
      {err && <div className="text-destructive text-sm">{err}</div>}
      <button className="btn btn-primary" onClick={save} data-testid="settings-save">Save changes</button>
    </div>
  );
}
