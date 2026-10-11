import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth";
import { http, offlineNotes } from "./api";
vi.mock("./api", () => ({ http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), interceptors: { request: { use: vi.fn(), eject: vi.fn() }, response: { use: vi.fn(), eject: vi.fn() } } }, offlineNotes: { accountPointer: "test.offline.account", rememberProfile: vi.fn(), offlineProfile: vi.fn(), clearOwner: vi.fn(), setOwner: vi.fn(), logout: vi.fn() } }));
function Consumer() { const { user, logout, login } = useAuth(); return <><output data-testid="user">{user === undefined ? "loading" : user?.user_id || "signed out"}</output><button onClick={logout}>Sign out</button><button onClick={() => login("student@example.com", "password")}>Sign in</button></>; }
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

it.each(["popstate", "pageshow"])("revalidates a history-restored session on %s before displaying private content", async eventName => {
  http.get.mockResolvedValueOnce({ data: { user_id: "one", timezone: "UTC" } });
  const client = view();
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("one"));
  client.setQueryData(["tasks"], [{ title: "Private" }]);
  let reject;
  http.get.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const event = new Event(eventName);
  if (eventName === "pageshow") Object.defineProperty(event, "persisted", { value: true });
  fireEvent(window, event);
  expect(screen.getByTestId("user")).toHaveTextContent("loading");
  await waitFor(() => expect(reject).toBeTypeOf("function"));
  await act(async () => reject({ response: { status: 401 } }));
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("signed out"));
  expect(client.getQueryData(["tasks"])).toBeUndefined();
});

it("clears authentication and private queries when an authenticated API request returns 401", async () => {
  http.get.mockResolvedValue({ data: { user_id: "one", timezone: "UTC" } });
  const client = view();
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("one"));
  client.setQueryData(["tasks"], [{ title: "Private" }]);
  const stampRequest = http.interceptors.request.use.mock.calls.at(-1)?.[0];
  const rejectResponse = http.interceptors.response.use.mock.calls.at(-1)?.[1];
  expect(rejectResponse).toBeTypeOf("function");
  const error = { config: stampRequest({ url: "/tasks" }), response: { status: 401 } };
  await act(async () => { await expect(rejectResponse(error)).rejects.toBe(error); });
  expect(screen.getByTestId("user")).toHaveTextContent("signed out");
  expect(client.getQueryData(["tasks"])).toBeUndefined();
});

it("hides a private page before caching it and restores a still-valid session", async () => {
  http.get.mockResolvedValue({ data: { user_id: "one", timezone: "UTC" } });
  view();
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("one"));
  fireEvent(window, new Event("pagehide"));
  expect(screen.getByTestId("user")).toHaveTextContent("loading");
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true });
  fireEvent(window, event);
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("one"));
  expect(http.get).toHaveBeenCalledTimes(2);
});

it("keeps a destroyed session signed out on history navigation after logout", async () => {
  http.get.mockResolvedValueOnce({ data: { user_id: "one", timezone: "UTC" } });
  view();
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("one"));
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("signed out"));
  http.get.mockRejectedValue({ response: { status: 401 } });
  fireEvent(window, new Event("popstate"));
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("signed out"));
  expect(offlineNotes.offlineProfile).not.toHaveBeenCalled();
});

it("discards a check started before leaving the document and rechecks on return", async () => {
  http.get.mockResolvedValueOnce({ data: { user_id: "one", timezone: "UTC" } });
  view();
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("one"));
  let resolveOldCheck;
  http.get.mockImplementationOnce(() => new Promise(resolve => { resolveOldCheck = resolve; }));
  fireEvent(window, new Event("popstate"));
  await waitFor(() => expect(resolveOldCheck).toBeTypeOf("function"));
  fireEvent(window, new Event("pagehide"));
  await act(async () => resolveOldCheck({ data: { user_id: "one", timezone: "UTC" } }));
  expect(screen.getByTestId("user")).toHaveTextContent("loading");
  http.get.mockRejectedValueOnce({ response: { status: 401 } });
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true });
  fireEvent(window, event);
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("signed out"));
  expect(http.get).toHaveBeenCalledTimes(3);
});

it("ignores a delayed authentication rejection from before a new login", async () => {
  http.get.mockResolvedValue({ data: { user_id: "one", timezone: "UTC" } });
  view();
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("one"));
  const stampRequest = http.interceptors.request.use.mock.calls.at(-1)[0];
  const rejectResponse = http.interceptors.response.use.mock.calls.at(-1)[1];
  const config = stampRequest({ url: "/tasks" });
  http.post.mockResolvedValue({ data: { user_id: "two", timezone: "UTC" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("two"));
  const error = { config, response: { status: 401 } };
  await act(async () => { await expect(rejectResponse(error)).rejects.toBe(error); });
  expect(screen.getByTestId("user")).toHaveTextContent("two");
});

it.each([["/auth/login", 401], ["/admin", 403]])("does not destroy a session for a %s rejection", async (url, status) => {
  http.get.mockResolvedValue({ data: { user_id: "one", timezone: "UTC" } });
  view();
  await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("one"));
  const stampRequest = http.interceptors.request.use.mock.calls.at(-1)[0];
  const rejectResponse = http.interceptors.response.use.mock.calls.at(-1)[1];
  const error = { config: stampRequest({ url }), response: { status } };
  await act(async () => { await expect(rejectResponse(error)).rejects.toBe(error); });
  expect(screen.getByTestId("user")).toHaveTextContent("one");
});
