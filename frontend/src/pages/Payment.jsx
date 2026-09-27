import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { useUsage } from "@/lib/usage";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export function PaymentSuccess() {
  const [sp] = useSearchParams();
  const sessionId = sp.get("session_id");
  const [status, setStatus] = useState("polling"); // polling | paid | timeout | error
  const [err, setErr] = useState("");
  const tries = useRef(0);
  const { refresh } = useUsage();

  useEffect(() => {
    if (!sessionId) { setStatus("error"); setErr("Missing session"); return; }
    const poll = async () => {
      if (tries.current >= 12) { setStatus("timeout"); return; }
      tries.current += 1;
      try {
        const { data } = await http.get(`/billing/status/${sessionId}`);
        if (data.payment_status === "paid") {
          setStatus("paid");
          refresh();
          return;
        }
        setTimeout(poll, 2000);
      } catch (e) { setErr(formatError(e)); setTimeout(poll, 2000); }
    };
    poll();
    // eslint-disable-next-line
  }, [sessionId]);

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="card-elevated p-8 max-w-md w-full text-center" data-testid="payment-success">
        {status === "polling" && (
          <>
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-muted-foreground" />
            <h1 className="font-serif text-2xl mb-2">Confirming your payment</h1>
            <p className="text-sm text-muted-foreground">One moment. This usually takes a few seconds.</p>
          </>
        )}
        {status === "paid" && (
          <>
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-primary" />
            <h1 className="font-serif text-2xl mb-2">You're in.</h1>
            <p className="text-sm text-muted-foreground mb-4">Your new plan is active. Enjoy the extra helps.</p>
            <Link to="/today" className="btn btn-primary w-full" data-testid="payment-success-continue">Back to Today</Link>
          </>
        )}
        {status === "timeout" && (
          <>
            <Loader2 className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <h1 className="font-serif text-2xl mb-2">Still processing</h1>
            <p className="text-sm text-muted-foreground mb-4">Payment is being finalised by Stripe. Refresh in a minute or reach out if it takes too long.</p>
            <Link to="/upgrade" className="btn btn-outline w-full">Back to plans</Link>
          </>
        )}
        {status === "error" && <div className="text-destructive">{err}</div>}
      </div>
    </div>
  );
}

export function PaymentCancel() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="card-elevated p-8 max-w-md w-full text-center" data-testid="payment-cancel">
        <XCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <h1 className="font-serif text-2xl mb-2">Payment cancelled</h1>
        <p className="text-sm text-muted-foreground mb-4">No charge was made. You can try again anytime.</p>
        <Link to="/upgrade" className="btn btn-primary w-full">Back to plans</Link>
      </div>
    </div>
  );
}
