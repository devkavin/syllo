import React from "react";
import { useTheme } from "@/lib/theme";

export default function AppearancePicker() {
  const { theme, setTheme } = useTheme();
  return <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground" aria-label="Appearance">
    <span>Appearance</span>
    {(["light", "dark"]).map((choice) => <button
      key={choice}
      type="button"
      aria-pressed={theme === choice}
      onClick={() => setTheme(choice)}
      className={`rounded-md px-2 py-1 transition-colors ${theme === choice ? "bg-accent text-foreground" : "hover:text-foreground"}`}
    >{choice === "light" ? "Light" : "Dark"}</button>)}
  </div>;
}
