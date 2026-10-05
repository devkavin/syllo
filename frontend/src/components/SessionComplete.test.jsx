import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import SessionComplete from "./SessionComplete";
import { http } from "@/lib/api";
vi.mock("@/lib/api", () => ({ http: { patch: vi.fn().mockResolvedValue({ data: {} }) }, formatError: String }));
it("saves the private note before finishing", async () => {
  const finish = vi.fn(); render(<SessionComplete session={{ session_id: "s", duration_seconds: 2700 }} onFinish={finish} />);
  fireEvent.change(screen.getByLabelText("Private session note"), { target: { value: "I understand limits" } });
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  await waitFor(() => expect(http.patch).toHaveBeenCalledWith("/sessions/s", { note: "I understand limits" }));
  expect(finish).toHaveBeenCalledOnce();
});
