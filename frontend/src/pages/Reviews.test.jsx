import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { http } from "@/lib/api";
const account = vi.hoisted(() => ({ id: "student" }));
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }, formatError: error => error.message }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { user_id: account.id } }) }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
import Reviews from "./Reviews";
beforeEach(() => {
  vi.clearAllMocks();
  account.id = "student";
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/study/questions" ? [{ question_id: "q", prompt: "Recall the formula", answer: "F = ma", kind: "question", revision: 1, next_review_at: "2020-01-01" }] : url === "/reviews" ? [{ review_id: "r", lesson_id: "l", lesson_title: "Newton's laws", next_review_at: "2020-01-01", interval_days: 1 }] : [] }));
});
it("removes a lesson review only after confirmation while keeping its lesson", async () => {
  http.delete.mockResolvedValue({ data: {} });
  render(<MemoryRouter><Reviews /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Delete review Newton's laws" }));
  expect(http.delete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  await waitFor(() => expect(http.delete).toHaveBeenCalledWith("/reviews/r"));
  await waitFor(() => expect(screen.queryByTestId("review-r")).not.toBeInTheDocument());
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
it("offers due recall practice alongside guided lesson review links", async () => {
  render(<MemoryRouter><Reviews /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Start review: Newton's laws" })).toHaveAttribute("href", "/reviews?review=r");
  expect(http.get).toHaveBeenCalledWith("/study/questions", { params: { due: true } });
  fireEvent.click(await screen.findByRole("button", { name: "Practise: Recall the formula" }));
  expect(screen.queryByText("F = ma")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  expect(screen.getByText("F = ma")).toBeVisible();
});

it.each(["good", "again"])("guides recall before notes and records the next lesson review (%s)", async quality => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/reviews" ? [{ review_id: "r", lesson_id: "l", lesson_title: "Newton's laws", next_review_at: "2020-01-01", interval_days: 1 }] : url === "/lessons/l/notebook" ? { notebook_id: "n", content: "Force equals mass times acceleration" } : [] }));
  http.post.mockResolvedValue({ data: { review_id: "r", lesson_id: "l", lesson_title: "Newton's laws", next_review_at: "2099-01-01T10:00:00Z", interval_days: quality === "good" ? 3 : 1 } });
  render(<MemoryRouter initialEntries={["/reviews?review=r"]}><Reviews /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "Review Newton's laws" })).toBeVisible();
  expect(http.get).not.toHaveBeenCalledWith("/lessons/l/notebook");
  expect(screen.queryByRole("button", { name: "Recalled it" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/What can you remember/), { target: { value: "F = ma" } });
  fireEvent.click(screen.getByRole("button", { name: "Check my recall" }));
  expect(await screen.findByRole("link", { name: /Open lesson notebook/ })).toHaveAttribute("href", "/notebooks?notebook=n");
  fireEvent.click(screen.getByRole("button", { name: quality === "good" ? "Recalled it" : "Review again tomorrow" }));
  await waitFor(() => expect(http.post).toHaveBeenCalledWith("/reviews/r/mark", { quality, expected_next_review_at: "2020-01-01" }));
  expect(await screen.findByRole("heading", { name: "Review saved" })).toBeVisible();
  expect(screen.getByText(/Next review:/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Recalled it" })).not.toBeInTheDocument();
});

it("retains a recall attempt after a failed save and permits retry", async () => {
  http.post.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({ data: { review_id: "r", lesson_id: "l", lesson_title: "Newton's laws", next_review_at: "2099-01-01", interval_days: 3 } });
  render(<MemoryRouter initialEntries={["/reviews?review=r"]}><Reviews /></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText(/What can you remember/), { target: { value: "My recall attempt" } });
  fireEvent.click(screen.getByRole("button", { name: "Check my recall" }));
  fireEvent.click(screen.getByRole("button", { name: "Recalled it" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
  expect(screen.getByLabelText(/What can you remember/)).toHaveValue("My recall attempt");
  expect(screen.queryByRole("heading", { name: "Review saved" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Recalled it" }));
  expect(await screen.findByRole("heading", { name: "Review saved" })).toBeVisible();
});

it("explains an unavailable linked review and offers the review list", async () => {
  render(<MemoryRouter initialEntries={["/reviews?review=deleted"]}><Reviews /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("This review is no longer available");
  expect(screen.getByRole("link", { name: "Back to reviews" })).toHaveAttribute("href", "/reviews");
});

it("permits early recall without advancing a review that is not due", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/reviews" ? [{ review_id: "r", lesson_id: "l", lesson_title: "Limits", next_review_at: "2099-01-01", interval_days: 3 }] : [] }));
  render(<MemoryRouter initialEntries={["/reviews?review=r"]}><Reviews /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Check my recall" }));
  expect(screen.getByText(/its review date stays the same/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Recalled it" })).not.toBeInTheDocument();
  expect(http.post).not.toHaveBeenCalled();
});

it("keeps recall and retry available when notes fail to load", async () => {
  const baseline = http.get.getMockImplementation();
  http.get.mockImplementation(url => url === "/lessons/l/notebook" ? Promise.reject(new Error("Notes unavailable")) : baseline(url));
  render(<MemoryRouter initialEntries={["/reviews?review=r"]}><Reviews /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Check my recall" }));
  expect(await screen.findByText("Notes unavailable")).toBeVisible();
  expect(screen.getByRole("button", { name: "Recalled it" })).toBeEnabled();
  http.get.mockImplementation(url => url === "/lessons/l/notebook" ? Promise.resolve({ data: { notebook_id: "n" } }) : baseline(url));
  fireEvent.click(screen.getByRole("button", { name: "Retry notes" }));
  expect(await screen.findByRole("link", { name: /Open lesson notebook/ })).toBeVisible();
});

it("keeps the saved schedule after a lost response without advancing it twice", async () => {
  const current = { review_id: "r", lesson_id: "l", lesson_title: "Newton's laws", next_review_at: "2099-01-01", interval_days: 3 };
  http.post.mockRejectedValueOnce(new Error("Connection lost")).mockRejectedValueOnce({ response: { status: 409, data: { detail: { message: "Schedule already updated", current } } } });
  render(<MemoryRouter initialEntries={["/reviews?review=r"]}><Reviews /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Check my recall" }));
  fireEvent.click(screen.getByRole("button", { name: "Recalled it" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Recalled it" }));
  expect(await screen.findByRole("heading", { name: "Review already updated" })).toBeVisible();
  expect(http.post.mock.calls[0][1]).toEqual(http.post.mock.calls[1][1]);
  expect(screen.getByText(/Next review:/)).toBeVisible();
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
