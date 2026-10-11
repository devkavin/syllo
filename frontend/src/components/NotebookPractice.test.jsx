import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, formatError: error => error.message }));
import NotebookPractice from "./NotebookPractice";
const notebook = { notebook_id: "nb", subject_id: "s", lesson_id: "l" };
const question = { question_id: "q", notebook_id: "nb", kind: "question", prompt: "Define equilibrium", answer: "Forward and reverse rates are equal", revision: 1, next_review_at: "2020-01-01T00:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); http.get.mockResolvedValue({ data: [question] }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("hides cloze words from both the queue and prompt until reveal", async () => {
  http.get.mockResolvedValue({ data: [{ ...question, format: "cloze", prompt: "Water is {{H2O}}", answer: "Remember its formula" }] });
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(await screen.findByRole("button", { name: "Practise: Water is […]" }));
  expect(screen.queryByText(/H2O/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  expect(screen.getByRole("heading", { name: "Water is H2O" })).toBeVisible();
});

it("uses the saved answer as a reverse prompt and reveals the original question", async () => {
  http.get.mockResolvedValue({ data: [{ ...question, format: "reverse" }] });
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(await screen.findByRole("button", { name: `Practise: ${question.answer}` }));
  expect(screen.getByRole("heading", { name: question.answer })).toBeVisible();
  expect(screen.queryByText(question.prompt)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  expect(screen.getByText(question.prompt)).toBeVisible();
});

it("advances a mixed session only after its rating has saved", async () => {
  const mistake = { ...question, question_id: "m", kind: "mistake", prompt: "Convert minutes", correction: "Multiply by 60", revision: 3 };
  http.get.mockResolvedValue({ data: [question, mistake] });
  http.post.mockImplementation((url) => Promise.resolve({ data: url.includes("/q/") ? { ...question, revision: 2 } : { ...mistake, revision: 4 } }));
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(screen.getByRole("button", { name: "Mixed" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Start practice" })).not.toBeDisabled());
  fireEvent.click(await screen.findByRole("button", { name: "Start practice" }));
  expect(screen.getByRole("heading", { name: question.prompt })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Good · recalled" })));
  expect(screen.getByRole("heading", { name: mistake.prompt })).toBeVisible();
  expect(screen.queryByText(mistake.correction)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Again · revisit" })));
  expect(screen.getByRole("status")).toHaveTextContent("Session complete · 2 reviews saved");
});

it("records elapsed exam time and optional honest self-marked marks with retry", async () => {
  const exam = { ...question, format: "exam", time_limit_seconds: 30, max_marks: 5 };
  http.get.mockResolvedValue({ data: [exam] });
  http.post.mockRejectedValueOnce({ message: "Gateway unavailable", response: { status: 503 } }).mockResolvedValueOnce({ data: { ...exam, revision: 2 } });
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(await screen.findByRole("button", { name: `Practise: ${question.prompt}` }));
  expect(screen.getByText(/Time remaining/)).toBeVisible();
  now.mockReturnValue(13000);
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  fireEvent.change(screen.getByLabelText(/Self-marked earned marks/), { target: { value: "4" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Good · recalled" })));
  expect(http.post).toHaveBeenCalledWith("/study/questions/q/attempt", expect.objectContaining({ elapsed_seconds: 12, earned_marks: 4 }));
  expect(screen.getByText(/Marks are your own assessment/)).toBeVisible();
  now.mockReturnValue(25000);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry review" })));
  expect(http.post.mock.calls[1][1]).toEqual(http.post.mock.calls[0][1]);
});

it("blocks exam marks outside the available maximum", async () => {
  http.get.mockResolvedValue({ data: [{ ...question, format: "exam", time_limit_seconds: 30, max_marks: 5 }] });
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(await screen.findByRole("button", { name: `Practise: ${question.prompt}` }));
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  fireEvent.change(screen.getByLabelText(/Self-marked earned marks/), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Good · recalled" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter whole marks from 0 to 5");
  expect(http.post).not.toHaveBeenCalled();
});

it("creates a timed exam question with its mark limit", async () => {
  http.post.mockResolvedValue({ data: { ...question, question_id: "new-exam" } });
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add question" }));
  fireEvent.change(screen.getByLabelText("Format"), { target: { value: "exam" } });
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Explain equilibrium" } });
  fireEvent.change(screen.getByLabelText("Answer"), { target: { value: question.answer } });
  fireEvent.change(screen.getByLabelText("Time limit (seconds)"), { target: { value: "120" } });
  fireEvent.change(screen.getByLabelText("Maximum marks (optional)"), { target: { value: "6" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save question" })));
  expect(http.post).toHaveBeenCalledWith("/study/questions", expect.objectContaining({ format: "exam", time_limit_seconds: 120, max_marks: 6 }));
});

it("uses a mistake's corrected method as the required reverse answer", async () => {
  http.get.mockResolvedValue({ data: [] });
  http.post.mockResolvedValue({ data: { ...question, question_id: "reverse-mistake", kind: "mistake", format: "reverse", answer: "Multiply by 60", correction: "Multiply by 60" } });
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(screen.getByRole("button", { name: "Mistakes" }));
  fireEvent.click(screen.getByRole("button", { name: "Add mistake" }));
  fireEvent.change(screen.getByLabelText("Format"), { target: { value: "reverse" } });
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Convert minutes to seconds" } });
  fireEvent.change(screen.getByLabelText("Corrected method"), { target: { value: "Multiply by 60" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save mistake" })));
  expect(http.post).toHaveBeenCalledWith("/study/questions", expect.objectContaining({ kind: "mistake", format: "reverse", answer: "Multiply by 60", correction: "Multiply by 60" }));
});

it("keeps an uncertain mixed-session rating on the same question until retry succeeds", async () => {
  const second = { ...question, question_id: "second", prompt: "Second prompt" };
  http.get.mockResolvedValue({ data: [question, second] });
  http.post.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ data: { ...question, revision: 2 } });
  render(<NotebookPractice dueOnly />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Start practice" })).not.toBeDisabled());
  fireEvent.click(await screen.findByRole("button", { name: "Start practice" }));
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Good · recalled" })));
  expect(screen.getByRole("heading", { name: question.prompt })).toBeVisible();
  expect(screen.queryByRole("heading", { name: second.prompt })).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry review" })));
  expect(screen.getByRole("heading", { name: second.prompt })).toBeVisible();
});

it("omits optional exam marks when the student leaves them blank", async () => {
  const exam = { ...question, format: "exam", time_limit_seconds: 30, max_marks: 5 };
  http.get.mockResolvedValue({ data: [exam] });
  http.post.mockResolvedValue({ data: { ...exam, revision: 2 } });
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(await screen.findByRole("button", { name: `Practise: ${question.prompt}` }));
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Good · recalled" })));
  expect(http.post.mock.calls[0][1]).not.toHaveProperty("earned_marks");
});

it("reloads the current queue after a rejected stale rating without retrying it", async () => {
  http.post.mockRejectedValue({ message: "Practice changed", response: { status: 409 } });
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(await screen.findByRole("button", { name: `Practise: ${question.prompt}` }));
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Good · recalled" })));
  expect(await screen.findByRole("button", { name: `Practise: ${question.prompt}` })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Retry review" })).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Practice changed");
});

it("hides answers and rating controls until the student reveals the answer", async () => {
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(await screen.findByRole("button", { name: "Practise: Define equilibrium" }));
  expect(screen.queryByText(question.answer)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Good/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  expect(screen.getByText(question.answer)).toBeVisible();
  http.post.mockResolvedValue({ data: { ...question, revision: 2, next_review_at: "2099-01-01T00:00:00Z" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Good · recalled" })));
  expect(http.post).toHaveBeenCalledWith("/study/questions/q/attempt", expect.objectContaining({ quality: "good", expected_revision: 1, request_id: expect.any(String) }));
  expect(screen.getByRole("status")).toHaveTextContent("Review saved");
});

it("turns selected notebook text into an editable question without using AI", async () => {
  http.post.mockResolvedValue({ data: { ...question, question_id: "new", prompt: "Le Chatelier's principle" } });
  const flush = vi.fn().mockResolvedValue(true);
  render(<NotebookPractice notebook={notebook} getSelectedText={() => "Le Chatelier's principle"} beforeStart={flush} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add question" }));
  expect(screen.getByLabelText("Question")).toHaveValue("Le Chatelier's principle");
  fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "The system opposes the change" } });
  fireEvent.click(screen.getByRole("button", { name: "Save question" }));
  await waitFor(() => expect(http.post).toHaveBeenCalledWith("/study/questions", expect.objectContaining({ notebook_id: "nb", subject_id: "s", lesson_id: "l", kind: "question", prompt: "Le Chatelier's principle", answer: "The system opposes the change" })));
  expect(flush).toHaveBeenCalled();
});

it("preserves a failed rating's idempotency key on retry", async () => {
  http.post.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({ data: { ...question, revision: 2 } });
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(await screen.findByRole("button", { name: "Practise: Define equilibrium" }));
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Again · revisit" })));
  expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry review" })));
  expect(http.post.mock.calls[1][1]).toEqual(http.post.mock.calls[0][1]);
});

it("replays the same rating after a gateway error with an uncertain outcome", async () => {
  http.post.mockRejectedValueOnce({ message: "Gateway unavailable", response: { status: 503 } }).mockResolvedValueOnce({ data: { ...question, revision: 2 } });
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(await screen.findByRole("button", { name: "Practise: Define equilibrium" }));
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Good · recalled" })));
  expect(screen.getByRole("button", { name: "Good · recalled" })).toBeDisabled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry review" })));
  expect(http.post.mock.calls[1][1]).toEqual(http.post.mock.calls[0][1]);
  expect(screen.getByRole("status")).toHaveTextContent("Review saved");
});

it("saves a mistake with its explanation and corrected method", async () => {
  http.get.mockResolvedValue({ data: [] });
  http.post.mockResolvedValue({ data: { ...question, kind: "mistake" } });
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(screen.getByRole("button", { name: "Mistakes" }));
  fireEvent.click(screen.getByRole("button", { name: "Add mistake" }));
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Calculate rate" } });
  fireEvent.change(screen.getByLabelText("What went wrong?"), { target: { value: "Forgot units" } });
  fireEvent.change(screen.getByLabelText("Corrected method"), { target: { value: "Convert seconds to minutes first" } });
  fireEvent.click(screen.getByRole("button", { name: "Save mistake" }));
  await waitFor(() => expect(http.post).toHaveBeenCalledWith("/study/questions", expect.objectContaining({ kind: "mistake", mistake: "Forgot units", correction: "Convert seconds to minutes first" })));
});

it("offers a retry after loading practice fails", async () => {
  http.get.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ data: [question] });
  render(<NotebookPractice notebook={notebook} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  fireEvent.click(screen.getByRole("button", { name: "Retry practice" }));
  expect(await screen.findByText(question.prompt)).toBeVisible();
});

it("does not let a slow initial load erase a question created while it was loading", async () => {
  let finishLoad;
  http.get.mockImplementationOnce(() => new Promise(resolve => { finishLoad = resolve; }));
  const newQuestion = { ...question, question_id: "new", prompt: "What is inertia?" };
  http.get.mockResolvedValue({ data: [newQuestion, question] });
  http.post.mockResolvedValue({ data: newQuestion });
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(screen.getByRole("button", { name: "Add question" }));
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: newQuestion.prompt } });
  fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "Resistance to changes in motion" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save question" })));
  await act(async () => finishLoad({ data: [question] }));
  expect(screen.getByRole("button", { name: "Practise: What is inertia?" })).toBeVisible();
});

it("preserves an edited question after conflict and can save it as a separate copy", async () => {
  http.patch.mockRejectedValueOnce({ message: "Changed on another device", response: { status: 409, data: { detail: { current: { ...question, revision: 2 } } } } });
  http.post.mockResolvedValue({ data: { ...question, question_id: "copy", prompt: "My revised question" } });
  render(<NotebookPractice notebook={notebook} />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: "My revised question" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save question" })));
  expect(screen.getByLabelText("Question")).toHaveValue("My revised question");
  expect(screen.getByRole("button", { name: "Save question" })).toBeDisabled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save as a new question" })));
  expect(http.post).toHaveBeenCalledWith("/study/questions", expect.objectContaining({ prompt: "My revised question", notebook_id: "nb" }));
});
