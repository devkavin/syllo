import React from "react";

export default function AiPrivacyNote({ className = "" }) {
  return (
    <p className={`text-[11px] leading-relaxed text-muted-foreground ${className}`}>
      Requests are processed by Google Gemini. Don&apos;t include sensitive personal information. One successful response uses one help.
    </p>
  );
}
