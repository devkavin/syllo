import { describe, expect, it } from "vitest";
import { API, http, resolveApiBase, formatError } from "./api";

describe("API configuration", () => {
  it("shows structured conflict messages without exposing the embedded notebook", () => {
    expect(formatError({ response: { data: { detail: { message: "This notebook changed elsewhere.", current: { content: "Private note" } } } } })).toBe("This notebook changed elsewhere.");
  });
  it("uses the same-origin API path by default", () => {
    expect(resolveApiBase(undefined)).toBe("/api");
    expect(API).toBe("/api");
    expect(http.defaults.withCredentials).toBe(true);
  });

  it("accepts an explicit local development override", () => {
    expect(resolveApiBase("http://localhost:8000/api/")).toBe(
      "http://localhost:8000/api",
    );
  });
});
