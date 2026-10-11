import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { expect, it, vi } from "vitest";
import SearchDialog from "./SearchDialog";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn() }, formatError: String }));
function Location() { return <output data-testid="location">{useLocation().pathname}{useLocation().search}</output>; }
it("offers quick commands and opens question search results in practice", async () => {
  http.get.mockResolvedValue({ data: { subjects: [], lessons: [], notebooks: [], tasks: [], questions: [{ question_id: "q1", kind: "mistake", prompt: "Check units" }] } });
  const close = vi.fn();
  render(<MemoryRouter><SearchDialog open onClose={close} /><Location /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "New note" }));
  expect(screen.getByTestId("location")).toHaveTextContent("/notebooks?new=1");
  fireEvent.change(screen.getByRole("textbox", { name: "Search your workspace" }), { target: { value: "units" } });
  fireEvent.click(await screen.findByRole("button", { name: /Check units/ }));
  expect(screen.getByTestId("location")).toHaveTextContent("/reviews?question=q1");
  expect(close).toHaveBeenCalledTimes(2);
});

it("announces an in-flight search instead of showing premature empty results", async () => {
  let resolve;
  http.get.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<MemoryRouter><SearchDialog open onClose={() => {}} /></MemoryRouter>);
  const input = screen.getByRole("textbox", { name: "Search your workspace" });
  fireEvent.change(input, { target: { value: "limits" } });
  expect(screen.getByRole("status")).toHaveTextContent("Searching");
  expect(screen.queryByText(/Nothing matched/)).not.toBeInTheDocument();
  await waitFor(() => expect(http.get).toHaveBeenCalledWith("/search?q=limits"));
  resolve({ data: { subjects: [], lessons: [{ lesson_id: "l", subject_id: "m", title: "Limits" }], notebooks: [], tasks: [] } });
  const result = await screen.findByRole("button", { name: "Limits" });
  expect(screen.getByRole("dialog", { name: "Search" })).toBeVisible();
  fireEvent.click(result);
});
