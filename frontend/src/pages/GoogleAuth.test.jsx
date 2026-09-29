import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import Login from "./Login";
import Register from "./Register";
import { ThemeProvider } from "@/lib/theme";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ login: vi.fn(), register: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({ formatError: () => "Request failed" }));

describe("Google sign-in links", () => {
  it.each([
    ["login", <Login />],
    ["register", <Register />],
  ])("uses the application-owned OAuth endpoint on %s", (_name, page) => {
    render(<MemoryRouter><ThemeProvider>{page}</ThemeProvider></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "/api/auth/google/start?client=web&return_to=%2Ftoday",
    );
  });
});
