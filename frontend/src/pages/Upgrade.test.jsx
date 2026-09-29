import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const plans = [
  { id: "freshman", name: "Freshman", price_cents: 0, credits: 10, features: [] },
  { id: "scholar", name: "Scholar", price_cents: 599, credits: 500, features: [] },
  {
    id: "deans_list",
    name: "Dean's List",
    price_cents: 1299,
    credits: 1500,
    features: [],
    intro_offer: { price_cents: 999, months: 3 },
  },
];

vi.mock("@/lib/api", () => ({
  http: { get: vi.fn(() => Promise.resolve({ data: { plans, checkout_available: false } })) },
  formatError: (error) => String(error),
}));
vi.mock("@/lib/billing", () => ({ createCheckout: vi.fn() }));
vi.mock("@/lib/usage", () => ({
  useUsage: () => ({ usage: { plan: { id: "freshman" } }, refresh: vi.fn() }),
}));

import Upgrade from "./Upgrade";

describe("upgrade pricing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows planned intro and regular prices while checkout is unavailable", async () => {
    render(<MemoryRouter><Upgrade /></MemoryRouter>);

    expect(await screen.findByText("$5.99")).toBeInTheDocument();
    expect(screen.getByText("$9.99")).toBeInTheDocument();
    expect(screen.getAllByText("for your first 3 months")).toHaveLength(2);
    expect(screen.getByText("Then $6.99 / month")).toBeInTheDocument();
    expect(screen.getByText("Then $12.99 / month")).toBeInTheDocument();
    expect(screen.getByText(/planned pricing/i)).toBeInTheDocument();
    expect(screen.getByText("1500 study helps per month")).toBeInTheDocument();
  });

  it("shows paid plans as coming soon without offering checkout", async () => {
    render(<MemoryRouter><Upgrade /></MemoryRouter>);

    expect(await screen.findByTestId("plan-upgrade-scholar")).toBeDisabled();
    expect(screen.getByTestId("plan-upgrade-scholar")).toHaveTextContent("Coming soon");
    expect(screen.getByTestId("plan-upgrade-deans_list")).toBeDisabled();
    expect(screen.getByText(/Freshman is available now/i)).toBeInTheDocument();
    expect(screen.queryByText(/Payments processed by Stripe/i)).not.toBeInTheDocument();
  });
});
