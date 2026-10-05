import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import SearchDialog from "./SearchDialog";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn() }, formatError: String }));

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
