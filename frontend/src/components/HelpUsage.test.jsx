import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HelpUsage from "./HelpUsage";

describe("HelpUsage", () => {
  it("shows weekly pace as a guide and the actual monthly refill", () => {
    render(<HelpUsage usage={{
      credits_remaining: 2,
      cycle_allowance: 10,
      used_this_week: 3,
      used_today: 1,
      weekly_pace: 2.3,
      next_refill_at: "2026-10-01T00:00:00+00:00",
    }} />);
    expect(screen.getByText(/This week: 3 used/)).toBeInTheDocument();
    expect(screen.getByText(/Today: 1 used/)).toBeInTheDocument();
    expect(screen.getByText(/Typical pace: about 2 \/ week/)).toBeInTheDocument();
    expect(screen.getByText(/Monthly refill/)).toBeInTheDocument();
    expect(screen.queryByText(/reset.*week/i)).not.toBeInTheDocument();
  });
});
