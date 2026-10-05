import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";
const { updateMe, post } = vi.hoisted(() => ({ updateMe: vi.fn().mockResolvedValue({}), post: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { name: "Student" }, updateMe, refreshMe: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ http: { post }, formatError: String }));
it("can skip setup without creating subjects", async () => {
  render(<MemoryRouter><Onboarding /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ onboarded: true }));
  expect(post).not.toHaveBeenCalled();
});
