import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import AcademicSelector from "./AcademicSelector";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { get: vi.fn() }, formatError: String }));
it("clears incompatible lesson links when the subject changes", () => {
  http.get.mockResolvedValue({ data: [] });
  const onChange = vi.fn();
  render(<AcademicSelector subjects={[{ subject_id: "s", name: "Math" }]} value={{ subject_id: "s", unit_id: "u", lesson_id: "l" }} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "" } });
  expect(onChange).toHaveBeenCalledWith({ subject_id: null, unit_id: null, lesson_id: null });
});
