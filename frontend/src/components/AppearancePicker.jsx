import React from "react";
import { useTheme } from "@/lib/theme";

export default function AppearancePicker() {
  const { theme, setTheme } = useTheme();
  return <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground" role="group" aria-label="Appearance">
    <span>Theme</span>
    {(["light", "dark"]).map((choice) => <button
      key={choice}
      type="button"
      aria-pressed={theme === choice}
      onClick={() => setTheme(choice)}
      className={`btn ${theme === choice ? "btn-outline" : "btn-ghost"}`}
    >{choice === "light" ? "Light" : "Dark"}</button>)}
  </div>;
}
