import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, formatError: error => error.message }));
import NotebookPractice from "./NotebookPractice";
const notebook = { notebook_id: "nb", subject_id: "s", lesson_id: "l" };
const question = { question_id: "q", notebook_id: "nb", kind: "question", prompt: "Define equilibrium", answer: "Forward and reverse rates are equal", revision: 1, next_review_at: "2020-01-01T00:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); http.get.mockResolvedValue({ data: [question] }); });

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
