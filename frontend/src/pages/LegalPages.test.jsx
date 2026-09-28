import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null }));

vi.mock("@/lib/auth", () => ({
  useAuth: () => auth,
  AuthProvider: ({ children }) => children,
}));
vi.mock("@/lib/theme", () => ({ ThemeProvider: ({ children }) => children }));
vi.mock("@/lib/usage", () => ({ UsageProvider: ({ children }) => children }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }) => children }));

import { AppRoutes } from "@/App";

describe("public legal pages", () => {
  it("shows the Privacy Policy without requiring an account", async () => {
    render(<MemoryRouter initialEntries={["/privacy"]}><AppRoutes /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getAllByText(/Kavin HQ, trading as Syllo/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Google Gemini/i)).toBeInTheDocument();
    expect(screen.getAllByText(/privacy@syllo\.kavinhq\.com/i).length).toBeGreaterThan(0);
  });

  it("shows the Terms without requiring an account", async () => {
    render(<MemoryRouter initialEntries={["/terms"]}><AppRoutes /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getByText(/permission from a parent or legal guardian/i)).toBeInTheDocument();
    expect(screen.getByText(/laws of Sri Lanka/i)).toBeInTheDocument();
  });

  it("links registration to both legal documents", async () => {
    render(<MemoryRouter initialEntries={["/register"]}><AppRoutes /></MemoryRouter>);

    expect(await screen.findByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });
});
