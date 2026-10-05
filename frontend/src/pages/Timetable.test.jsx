import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import Timetable from "./Timetable";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn(), patch: vi.fn().mockResolvedValue({}), post: vi.fn() }, formatError: String }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
afterEach(() => vi.clearAllMocks());
it("fixes a legacy one-off block with an actual date", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : [{ timetable_id: "e", title: "Exam", day_of_week: 0, start_time: "09:00", end_time: "10:00", kind: "exam", recurrence: "none", needs_date: true }] }));
  render(<MemoryRouter initialEntries={["/timetable?edit=e"]}><Timetable /></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText("Date"), { target: { value: "2026-10-05" } });
  fireEvent.click(screen.getByRole("button", { name: "Save block" }));
  await waitFor(() => expect(http.patch).toHaveBeenCalledWith("/timetable/e", expect.objectContaining({ date: "2026-10-05", recurrence: "none" })));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("allows an unchanged dated instant to be renamed after timezone conversion crosses midnight", async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === "/subjects" ? [] : [{ timetable_id: "night", title: "Exam", day_of_week: 0, date: "2026-10-05", end_date: "2026-10-06", start_time: "23:00", end_time: "00:30", kind: "exam", recurrence: "none" }] }));
  render(<MemoryRouter initialEntries={["/timetable?edit=night"]}><Timetable /></MemoryRouter>);
  fireEvent.change(await screen.findByTestId("new-block-title"), { target: { value: "Renamed exam" } });
  fireEvent.click(screen.getByRole("button", { name: "Save block" }));
  await waitFor(() => expect(http.patch).toHaveBeenCalledWith("/timetable/night", expect.objectContaining({ title: "Renamed exam", start_time: "23:00", end_time: "00:30" })));
});
