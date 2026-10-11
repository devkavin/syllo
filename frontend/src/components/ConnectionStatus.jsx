import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function ConnectionStatus() {
  const [offline, setOffline] = useState(navigator.onLine === false);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  if (!offline) return null;
  return <div role="status" className="notice mb-4 text-sm flex flex-wrap items-center gap-3"><span className="flex-1">Offline · cached notes can be edited. Changes wait for a connection.</span><Link to="/notebooks" className="btn btn-outline">Open notes</Link></div>;
}
