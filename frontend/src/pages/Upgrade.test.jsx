import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const plans = [
  { id: "freshman", name: "Freshman", price_cents: 0, credits: 10, features: [] },
  { id: "scholar", name: "Scholar", price_cents: 899, credits: 250, features: [] },
  {
    id: "deans_list",
    name: "Dean's List",
    price_cents: 1399,
    credits: 800,
    features: [],
    intro_offer: { price_cents: 1199, months: 3 },
  },
];

vi.mock("@/lib/api", () => ({
  http: { get: vi.fn(() => Promise.resolve({ data: { plans, checkout_available: false } })) },
  formatError: (error) => String(error),
}));
vi.mock("@/lib/billing", () => ({ createCheckout: vi.fn() }));
vi.mock("@/lib/usage", () => ({
  useUsage: () => ({ usage: {
    plan: { id: "freshman" },
    free_start: 10,
    free_milestone_max: 40,
    free_max: 100,
  }, refresh: vi.fn() }),
}));

import Upgrade from "./Upgrade";

describe("upgrade pricing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows planned intro and regular prices while checkout is unavailable", async () => {
    render(<MemoryRouter><Upgrade /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Study plans that fit your routine" })).toBeInTheDocument();
    expect(screen.getByText(/Every plan includes subjects, notes, a timetable, tasks, focus sessions, and progress/i)).toBeInTheDocument();
    expect(await screen.findByText("$6.99")).toBeInTheDocument();
    expect(screen.getByText("$11.99")).toBeInTheDocument();
    expect(screen.queryByText("$10.99")).not.toBeInTheDocument();
    expect(screen.getAllByText("for your first 3 months")).toHaveLength(2);
    expect(screen.getByText("Then $8.99 / month")).toBeInTheDocument();
    expect(screen.getByText("Then $13.99 / month")).toBeInTheDocument();
    expect(screen.getByText(/planned pricing/i)).toBeInTheDocument();
    expect(screen.getByText("10 study helps per month")).toBeInTheDocument();
    expect(screen.getByText("250 study helps per month")).toBeInTheDocument();
    expect(screen.getByText("800 study helps per month")).toBeInTheDocument();
    expect(screen.getByText("Plan and study for free. Use Syllo’s free study milestones to earn 40 helps every month.")).toBeInTheDocument();
    expect(screen.getByText("Everything in Freshman, with more help for regular study.")).toBeInTheDocument();
    expect(screen.getByText("Everything in Scholar, with room for intensive study and revision.")).toBeInTheDocument();
    expect(screen.queryByText(/invite|balance is capped|Most popular|upload/i)).not.toBeInTheDocument();
  });

  it("sets a descriptive pricing-page title and summary", () => {
    render(<MemoryRouter><Upgrade /></MemoryRouter>);

    expect(document.title).toBe("Syllo Plans & Pricing | Study Planner for Students");
    expect(document.querySelector('meta[name="description"]')?.content).toContain("subjects, notes, timetables, tasks, focus sessions");
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
