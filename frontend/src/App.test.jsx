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
vi.mock("@/lib/usage", () => ({
  UsageProvider: ({ children }) => children,
  useUsage: () => ({ usage: null, refresh: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  http: {
    get: vi.fn(() => Promise.resolve({
      data: {
        checkout_available: false,
        plans: [
          { id: "freshman", name: "Freshman", price_cents: 0, credits: 10, features: [] },
          { id: "scholar", name: "Scholar", price_cents: 599, credits: 500, features: [] },
        ],
      },
    })),
  },
  formatError: (error) => String(error),
}));
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

  it("shows pricing to signed-out visitors", async () => {
    auth.user = null;
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("upgrade-page")).toBeInTheDocument();
    expect(screen.getByText(/Paid plans are coming soon/i)).toBeInTheDocument();
  });
});
