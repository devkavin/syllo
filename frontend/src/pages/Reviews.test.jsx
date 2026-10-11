import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { http } from "@/lib/api";
const account = vi.hoisted(() => ({ id: "student" }));
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn() }, formatError: error => error.message }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { user_id: account.id } }) }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
import Reviews from "./Reviews";
beforeEach(() => {
  vi.clearAllMocks();
  account.id = "student";
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/study/questions" ? [{ question_id: "q", prompt: "Recall the formula", answer: "F = ma", kind: "question", revision: 1, next_review_at: "2020-01-01" }] : url === "/reviews" ? [{ review_id: "r", lesson_id: "l", lesson_title: "Newton's laws", next_review_at: "2020-01-01", interval_days: 1 }] : [] }));
});

it("clears the prior account's question while the next account loads", async () => {
  const page = <MemoryRouter><Reviews /></MemoryRouter>;
  const view = render(page);
  expect(await screen.findByRole("button", { name: "Practise: Recall the formula" })).toBeVisible();
  account.id = "different-student";
  http.get.mockImplementation(() => new Promise(() => {}));
  view.rerender(<MemoryRouter><Reviews /></MemoryRouter>);
  expect(screen.queryByRole("button", { name: "Practise: Recall the formula" })).not.toBeInTheDocument();
  expect(screen.queryByText("Newton's laws")).not.toBeInTheDocument();
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

it("opens a linked question even when it is scheduled for later", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/study/questions" ? [{ question_id: "q", prompt: "Recall the formula", answer: "F = ma", kind: "question", revision: 1, next_review_at: "2099-01-01" }] : [] }));
  render(<MemoryRouter initialEntries={["/reviews?question=q"]}><Reviews /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "Recall the formula" })).toBeVisible();
  expect(http.get).toHaveBeenCalledWith("/study/questions", { params: {} });
  expect(screen.queryByText("F = ma")).not.toBeInTheDocument();
});

it("keeps a missing linked question visible as an error with retry", async () => {
  http.get.mockResolvedValue({ data: [] });
  render(<MemoryRouter initialEntries={["/reviews?question=deleted"]}><Reviews /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("no longer available");
  expect(screen.getByRole("button", { name: "Retry practice" })).toBeVisible();
});

it("scopes lesson practice and lesson reviews to the linked lesson", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/reviews" ? [{ review_id: "r", lesson_id: "other", lesson_title: "Unrelated", next_review_at: "2020-01-01", interval_days: 1 }] : [] }));
  render(<MemoryRouter initialEntries={["/reviews?lesson=l"]}><Reviews /></MemoryRouter>);
  await waitFor(() => expect(http.get).toHaveBeenCalledWith("/study/questions", { params: { lesson_id: "l" } }));
  expect(screen.queryByText("Unrelated")).not.toBeInTheDocument();
});

it("retries lesson review loading without claiming an empty successful response", async () => {
  http.get.mockImplementation(url => url === "/reviews" ? Promise.reject(new Error("Connection lost")) : Promise.resolve({ data: [] }));
  render(<MemoryRouter><Reviews /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
  expect(screen.queryByText("Nothing to review yet")).not.toBeInTheDocument();
  http.get.mockResolvedValue({ data: [] });
  fireEvent.click(screen.getByRole("button", { name: "Retry lesson reviews" }));
  expect(await screen.findByText("Nothing to review yet")).toBeVisible();
});
