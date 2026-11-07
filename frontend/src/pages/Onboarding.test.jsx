import React from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";

const { auth, post } = vi.hoisted(() => ({ auth: { user: { user_id: "student", name: "Student", onboarded: false }, updateMe: vi.fn() }, post: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ http: { post }, formatError: error => error.message }));
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
const mount = () => render(<MemoryRouter initialEntries={["/onboarding"]}><Onboarding /><Location /></MemoryRouter>);
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  auth.user = { user_id: "student", name: "Student", onboarded: false };
  auth.updateMe.mockResolvedValue({});
  post.mockImplementation(url => Promise.resolve({ data: url === "/notebooks" ? { notebook_id: "first-note" } : { question_id: "first-question" } }));
});
function writeNote() {
  fireEvent.change(screen.getByRole("textbox", { name: "Note title" }), { target: { value: "Cell respiration" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Your notes" }), { target: { value: "Cells release energy from glucose." } });
  fireEvent.click(screen.getByRole("button", { name: "Save my first note" }));
}

it("lets a student explore without creating subjects, notes or a timetable", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Explore on my own" }));
  await waitFor(() => expect(auth.updateMe).toHaveBeenCalledWith({ onboarded: true }));
  expect(post).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/today"));
});

it("saves an unlinked first note and manual recall question then opens that exact notebook", async () => {
  mount(); writeNote();
  await screen.findByRole("heading", { name: "Try recalling one thing" });
  expect(post).toHaveBeenCalledWith("/notebooks", { title: "Cell respiration", content: "Cells release energy from glucose.", subject_id: null, lesson_id: null });
  fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: "What do cells release?" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Answer" }), { target: { value: "Energy from glucose." } });
  fireEvent.click(screen.getByRole("button", { name: "Save recall question" }));
  await screen.findByRole("heading", { name: "You're ready to study" });
  expect(post).toHaveBeenCalledWith("/study/questions", { notebook_id: "first-note", kind: "question", format: "basic", prompt: "What do cells release?", answer: "Energy from glucose." });
  fireEvent.click(screen.getByRole("button", { name: "Continue studying" }));
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/notebooks?notebook=first-note"));
});

it("prevents duplicate submissions while a note saves", async () => {
  let finish;
  post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  mount(); writeNote();
  expect(screen.getByRole("button", { name: "Saving note…" })).toBeDisabled();
  expect(post).toHaveBeenCalledTimes(1);
  await act(async () => finish({ data: { notebook_id: "first-note" } }));
  await screen.findByRole("heading", { name: "Try recalling one thing" });
});

it("keeps failed note inputs for retry", async () => {
  post.mockRejectedValueOnce(new Error("Note service unavailable"));
  mount(); writeNote();
  expect(await screen.findByRole("alert")).toHaveTextContent("Note service unavailable");
  expect(screen.getByRole("textbox", { name: "Your notes" })).toHaveValue("Cells release energy from glucose.");
  fireEvent.click(screen.getByRole("button", { name: "Save my first note" }));
  await screen.findByRole("heading", { name: "Try recalling one thing" });
});

it("retries a failed question without recreating the saved note", async () => {
  mount(); writeNote();
  await screen.findByRole("heading", { name: "Try recalling one thing" });
  fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: "What is respiration?" } });
  post.mockRejectedValueOnce(new Error("Question service unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "Save recall question" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Question service unavailable");
  expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue("What is respiration?");
  fireEvent.click(screen.getByRole("button", { name: "Save recall question" }));
  await screen.findByRole("heading", { name: "You're ready to study" });
  expect(post.mock.calls.filter(([url]) => url === "/notebooks")).toHaveLength(1);
});

it("keeps a successful note across reload and retries completion without another note or question", async () => {
  const view = mount(); writeNote();
  await screen.findByRole("heading", { name: "Try recalling one thing" });
  view.unmount(); mount();
  await screen.findByRole("heading", { name: "Try recalling one thing" });
  fireEvent.click(screen.getByRole("button", { name: "Do this later" }));
  auth.updateMe.mockRejectedValueOnce(new Error("Profile service unavailable"));
  fireEvent.click(await screen.findByRole("button", { name: "Continue studying" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Profile service unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Continue studying" }));
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/notebooks?notebook=first-note"));
  expect(post).toHaveBeenCalledTimes(1);
});

it("keeps drafts and progress separate for another account", () => {
  const view = mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Note title" }), { target: { value: "Private student draft" } });
  auth.user = { user_id: "different-student", name: "Other student", onboarded: false };
  view.rerender(<MemoryRouter><Onboarding /><Location /></MemoryRouter>);
  expect(screen.getByRole("textbox", { name: "Note title" })).toHaveValue("");
});

it("allows contextual guidance to be dismissed and reopened", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss guidance" }));
  expect(screen.queryByRole("region", { name: "Study guidance" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Study guide" }));
  expect(screen.getByRole("region", { name: "Study guidance" })).toBeVisible();
});

it("explains unavailable browser draft storage while still allowing the note to be saved", async () => {
  const getter = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
  const setter = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
  try {
    mount();
    expect(screen.getByText(/Keep this page open until your note is saved/)).toBeVisible();
    writeNote();
    await screen.findByRole("heading", { name: "Try recalling one thing" });
  } finally { getter.mockRestore(); setter.mockRestore(); }
});
