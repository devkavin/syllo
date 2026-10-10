import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn() }, formatError: error => error.message }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
import Reviews from "./Reviews";
beforeEach(() => {
  vi.clearAllMocks();
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/study/questions" ? [{ question_id: "q", prompt: "Recall the formula", answer: "F = ma", kind: "question", revision: 1, next_review_at: "2020-01-01" }] : url === "/reviews" ? [{ review_id: "r", lesson_id: "l", lesson_title: "Newton's laws", next_review_at: "2020-01-01", interval_days: 1 }] : [] }));
});
it("offers due recall practice alongside existing lesson review links", async () => {
  render(<MemoryRouter><Reviews /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Open lesson to review" })).toHaveAttribute("href", "/lessons/l");
  expect(http.get).toHaveBeenCalledWith("/study/questions", { params: { due: true } });
  fireEvent.click(await screen.findByRole("button", { name: "Practise: Recall the formula" }));
  expect(screen.queryByText("F = ma")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  expect(screen.getByText("F = ma")).toBeVisible();
});
