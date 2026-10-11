import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth";
import { http, offlineNotes } from "./api";
vi.mock("./api", () => ({ http: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, offlineNotes: { accountPointer: "test.offline.account", rememberProfile: vi.fn(), offlineProfile: vi.fn(), clearOwner: vi.fn(), setOwner: vi.fn(), logout: vi.fn() } }));
function Consumer() { const { user, logout } = useAuth(); return <><output data-testid="user">{user === undefined ? "loading" : user?.user_id || "signed out"}</output><button onClick={logout}>Sign out</button></>; }
function view() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); render(<QueryClientProvider client={client}><AuthProvider><Consumer /></AuthProvider></QueryClientProvider>); return client; }
beforeEach(() => { vi.clearAllMocks(); http.post.mockResolvedValue({ data: {} }); vi.spyOn(navigator, "onLine", "get").mockReturnValue(false); });
afterEach(() => vi.restoreAllMocks());
it("opens the remembered account offline after a network failure", async () => {
  http.get.mockRejectedValue(new Error("offline"));
  offlineNotes.offlineProfile.mockResolvedValue({ user_id: "one", timezone: "UTC" });
  view();
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("one"));
  expect(offlineNotes.offlineProfile).toHaveBeenCalledOnce();
});
it("never restores cached authentication after a server rejection", async () => {
  http.get.mockRejectedValue({ response: { status: 401 } });
  view();
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("signed out"));
  expect(offlineNotes.offlineProfile).not.toHaveBeenCalled();
  expect(offlineNotes.clearOwner).toHaveBeenCalledOnce();
});
it("clears account caches immediately on sign-out and cancels pending reads", async () => {
  http.get.mockResolvedValue({ data: { user_id: "one", timezone: "UTC" } });
  const client = view();
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("one"));
  client.setQueryData(["tasks"], [{ title: "Private" }]);
  http.post.mockReturnValue(new Promise(() => {}));
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("signed out"));
  expect(client.getQueryData(["tasks"])).toBeUndefined();
  expect(offlineNotes.logout).toHaveBeenCalledOnce();
});
it("honours another tab's sign-out without racing the still-valid logout cookie", async () => {
  http.get.mockResolvedValue({ data: { user_id: "one", timezone: "UTC" } });
  view();
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("one"));
  window.dispatchEvent(new StorageEvent("storage", { key: "test.offline.account", oldValue: "one", newValue: null }));
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("signed out"));
  expect(http.get).toHaveBeenCalledTimes(1);
});
