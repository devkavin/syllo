import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const PUBLIC = {
  "/": "Syllo — Your personal study space",
  "/pricing": "Syllo Plans & Pricing | Study Planner for Students",
  "/privacy": "Privacy Policy | Syllo",
  "/terms": "Terms of Service | Syllo",
};

export default function RouteMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.appendChild(robots); }
    robots.content = PUBLIC[pathname] ? "index,follow" : "noindex,follow";
    document.title = PUBLIC[pathname] || "Your study space | Syllo";
    let canonical = document.querySelector('link[rel="canonical"]');
    if (PUBLIC[pathname]) {
      if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
      canonical.href = `https://syllo.kavinhq.com${pathname}`;
    } else canonical?.remove();
  }, [pathname]);
  return null;
}
