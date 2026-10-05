import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ReviewScheduler from "./ReviewScheduler";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { put: vi.fn().mockResolvedValue({ data: {} }) }, formatError: String }));
it("uses the selected timezone for custom reviews and skip does not reschedule", async () => {
  const skip = vi.fn();
  render(<ReviewScheduler lessonId="l" timezone="America/New_York" onSkip={skip} />);
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(skip).toHaveBeenCalledOnce(); expect(http.put).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Custom time"), { target: { value: "2030-10-05T09:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
  await waitFor(() => expect(http.put).toHaveBeenCalledWith("/lessons/l/review", { next_review_at: "2030-10-05T13:00:00.000Z" }));
});
