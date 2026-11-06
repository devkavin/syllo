import React from "react";

export default function AppIcon({ className = "h-10 w-10", alt = "" }) {
  return <img src="/branding/syllo-icon-192.png" alt={alt} width="192" height="192" className={`shrink-0 rounded-lg object-contain ${className}`} />;
}
