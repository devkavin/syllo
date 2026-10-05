import React from "react";

export default function AiPrivacyNote({ className = "" }) {
  return (
    <p className={`text-[11px] leading-relaxed text-muted-foreground ${className}`}>
      Requests are processed by Google Gemini. Free API processing may be used to improve Google products. Don&apos;t include sensitive information. One successful response uses one help.
    </p>
  );
}
