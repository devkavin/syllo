import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, MoreHorizontal, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Modal from "./Modal";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu";

export function CircleActions({ label, items, disabled = false }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><button className="btn btn-outline min-h-11 min-w-11 shrink-0" aria-label={label} disabled={disabled}><MoreHorizontal aria-hidden="true" size={18} /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">{items.map(item => <DropdownMenuItem key={item.label} className={`min-h-11 ${item.destructive ? "text-destructive focus:text-destructive" : ""}`} onSelect={item.action}>{item.label}</DropdownMenuItem>)}</DropdownMenuContent>
  </DropdownMenu>;
}

export function CircleShare({ circle, onClose }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const link = useRef(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(circle.invite_url); setMessage("Invite link copied. Send it to friends you want to study with."); }
    catch { setMessage("Copy the link manually below. Clipboard access is unavailable."); link.current?.focus(); link.current?.select(); }
  };
  const share = async () => {
    setBusy(true); setMessage("");
    try { await navigator.share({ title: `Join ${circle.name} on Syllo`, text: "Let’s study together. Join my study circle.", url: circle.invite_url }); }
    catch (error) { if (error.name !== "AbortError") setMessage("Sharing is unavailable. Copy the link below instead."); }
    finally { setBusy(false); }
  };
  return <Modal title="Invite friends" description={`Bring your study group into ${circle.name}.`} onClose={onClose}>
    <div className="rounded-xl bg-muted p-4 text-sm leading-relaxed">Anyone with this link can join this circle. Share it with people you trust. Your personal notes and tasks stay private.</div>
    <label className="block text-sm font-medium">Invite link<input ref={link} className="input mt-2 text-sm" readOnly value={circle.invite_url} onFocus={event => event.target.select()} /></label>
    <div className="flex flex-col gap-2 sm:flex-row">{typeof navigator.share === "function" && <button className="btn btn-primary min-h-11" disabled={busy} onClick={share}><Share2 aria-hidden="true" size={16} />Share invitation</button>}<button className={`btn min-h-11 ${typeof navigator.share === "function" ? "btn-outline" : "btn-primary"}`} onClick={copy}><Copy aria-hidden="true" size={16} />Copy link</button></div>
    {message && <p role="status" className="text-sm">{message}</p>}
    <details className="border-t border-border pt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Show QR code</summary><div className="space-y-2 pb-2 text-center"><QRCodeSVG role="img" aria-label={`Scan to join ${circle.name}`} title={`Scan to join ${circle.name}`} value={circle.invite_url} size={200} marginSize={4} level="M" className="mx-auto max-w-full rounded-lg" /><p className="text-xs text-muted-foreground">Your friend can scan this with their phone camera.</p></div></details>
  </Modal>;
}

export function CircleJoin({ onClose }) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const submit = event => {
    event.preventDefault();
    try {
      const url = new URL(value.trim());
      const match = url.pathname.match(/^\/join\/([A-Za-z0-9_-]{30,64})\/?$/);
      if (!match || !["https:", "http:"].includes(url.protocol)) throw new Error("Invalid invite");
      navigate(`/join/${match[1]}?ref=${encodeURIComponent(url.searchParams.get("ref") || "")}`);
    } catch { setError("Paste a valid Syllo invitation link, such as https://syllo.app/join/…"); }
  };
  return <Modal title="Join a circle" description="Paste the invitation your friend sent you. You can check the circle before joining." onClose={onClose}>
    <form onSubmit={submit} className="space-y-4"><label className="block text-sm font-medium">Invitation link<input type="text" className="input mt-2" value={value} onChange={event => { setValue(event.target.value); setError(""); }} placeholder="https://…/join/…" required /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<button className="btn btn-primary min-h-11 w-full" disabled={!value.trim()}>View invitation</button></form>
  </Modal>;
}
