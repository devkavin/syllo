import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme";

const auth = vi.hoisted(() => ({ user: null, updateMe: vi.fn() }));
vi.mock("./auth", () => ({ useAuth: () => auth }));

function ThemeControls() {
  const { theme, setTheme, toggle } = useTheme();
  return <div>
    <span data-testid="current-theme">{theme}</span>
    <button onClick={() => setTheme("dark")}>Choose dark</button>
    <button onClick={toggle}>Toggle theme</button>
  </div>;
}

function view() {
  return <ThemeProvider><ThemeControls /></ThemeProvider>;
}

describe("account theme sync", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.classList.remove("dark");
    auth.user = null;
    auth.updateMe.mockReset();
  });

  it("restores an existing account theme instead of an old device preference", async () => {
    localStorage.setItem("syllo-theme", "light");
    auth.user = { user_id: "student-1", theme: "dark" };
    render(view());
    await waitFor(() => expect(screen.getByTestId("current-theme")).toHaveTextContent("dark"));
    expect(document.documentElement).toHaveClass("dark");
    expect(auth.updateMe).not.toHaveBeenCalled();
  });

  it("saves an explicit guest choice when the student signs in", async () => {
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole("button", { name: "Choose dark" }));
    expect(sessionStorage.getItem("syllo-theme-pending")).toBe("dark");
    auth.updateMe.mockResolvedValue({ user_id: "student-1", theme: "dark" });
    auth.user = { user_id: "student-1", theme: "light" };
    rerender(view());
    await waitFor(() => expect(auth.updateMe).toHaveBeenCalledWith({ theme: "dark" }));
    await waitFor(() => expect(sessionStorage.getItem("syllo-theme-pending")).toBeNull());
    expect(screen.getByTestId("current-theme")).toHaveTextContent("dark");
  });

  it("persists an authenticated change immediately and rolls back on failure", async () => {
    auth.user = { user_id: "student-1", theme: "light" };
    auth.updateMe.mockRejectedValue(new Error("offline"));
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(auth.updateMe).toHaveBeenCalledWith({ theme: "dark" });
    await waitFor(() => expect(screen.getByTestId("current-theme")).toHaveTextContent("light"));
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't save your appearance/i);
  });
});
