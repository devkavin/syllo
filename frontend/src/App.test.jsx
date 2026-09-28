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

import { AppRoutes } from "./App";

describe("application routing", () => {
  it("redirects a signed-out user away from protected routes", async () => {
    auth.user = null;
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("login-form")).toBeInTheDocument();
  });

  it("shows a stable loading state while authentication resolves", () => {
    auth.user = undefined;
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });
});
