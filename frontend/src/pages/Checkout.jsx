import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { http, formatError } from "@/lib/api";

let scriptPromise;
export function loadPaddle() {
  if (window.Paddle) return Promise.resolve(window.Paddle);
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = () => window.Paddle ? resolve(window.Paddle) : reject(new Error("Checkout did not load"));
    script.onerror = () => { scriptPromise = null; script.remove(); reject(new Error("Checkout could not load. Please try again.")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function Checkout() {
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [transaction, setTransaction] = useState(null);
  useEffect(() => {
    let active = true;
    async function start() {
      const id = params.get("_ptxn") || (await http.get("/billing/paddle/pending")).data.transaction_id;
      if (!/^txn_[a-z0-9]+$/.test(id || "")) throw new Error("No unfinished checkout. Choose a plan first.");
      const [{ data: config }, { data: payment }, paddle] = await Promise.all([
        http.get("/billing/paddle/config"), http.get(`/billing/paddle/transaction/${id}`), loadPaddle(),
      ]);
      if (!active) return;
      if (payment.status === "paid") { window.location.replace(`/payment/success?session_id=${id}`); return; }
      if (payment.status !== "pending") throw new Error("This checkout is no longer available. Choose a plan again.");
      paddle.Environment.set("sandbox");
      const options = { token: config.token, eventCallback(event) {
        if (event.name === "checkout.completed") window.location.assign(`/payment/success?session_id=${id}`);
      } };
      if (paddle.Initialized) paddle.Update(options); else paddle.Initialize(options);
      setTransaction(id); setReady(true);
      paddle.Checkout.open({ transactionId: id, settings: { displayMode: "overlay", allowLogout: false, successUrl: `${window.location.origin}/payment/success?session_id=${id}` } });
    }
    start().catch(e => { if (active) setError(formatError(e)); });
    return () => { active = false; window.Paddle?.Checkout?.close(); };
  }, [params]);
  return <main className="min-h-screen grid place-items-center p-6"><section className="max-w-md space-y-5"><h1 className="page-title">Sandbox checkout</h1><p className="text-muted-foreground">Admin test only. No real money is charged. Your plan changes only after Syllo verifies the payment.</p>{error ? <p role="alert" className="text-destructive">{error}</p> : !ready && <p role="status">Opening secure test checkout…</p>}{ready && <button className="btn btn-primary" onClick={() => window.Paddle.Checkout.open({ transactionId: transaction })}>Reopen checkout</button>}<Link className="btn btn-outline" to="/upgrade">Back to plans</Link></section></main>;
}
