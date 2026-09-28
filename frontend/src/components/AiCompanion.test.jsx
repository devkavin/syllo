import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  http: { post: vi.fn() },
  formatError: (error) => String(error),
}));
vi.mock("@/lib/usage", () => ({
  useUsage: () => ({
    usage: { credits_remaining: 10 },
    setRemaining: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import AiCompanion from "./AiCompanion";

describe("Study Companion privacy", () => {
  it("tells students that requests are processed by Google Gemini", () => {
    render(
      <MemoryRouter>
        <AiCompanion open onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/processed by Google Gemini/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/one successful response uses one help/i)).toBeInTheDocument();
  });
});
