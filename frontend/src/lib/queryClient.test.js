import { describe, expect, it } from "vitest";
import { createSylloQueryClient } from "./queryClient";
import { queryKeys } from "./queryKeys";

describe("shared server-state cache", () => {
  it("uses stable keys for shared academic and account data", () => {
    expect(queryKeys.profile).toEqual(["profile"]);
    expect(queryKeys.usage).toEqual(["billing", "usage"]);
    expect(queryKeys.subject("math")).toEqual(["subjects", "math"]);
    expect(queryKeys.units("math")).toEqual(["subjects", "math", "units"]);
  });

  it("can update auth and usage state without duplicate requests", () => {
    const client = createSylloQueryClient();
    client.setQueryData(queryKeys.profile, { user_id: "student-1" });
    client.setQueryData(queryKeys.usage, { credits_remaining: 10 });
    expect(client.getQueryData(queryKeys.profile)).toEqual({ user_id: "student-1" });
    expect(client.getQueryData(queryKeys.usage)).toEqual({ credits_remaining: 10 });
  });

  it("invalidates only the changed academic domain", async () => {
    const client = createSylloQueryClient();
    client.setQueryData(queryKeys.subjects, [{ subject_id: "math" }]);
    client.setQueryData(queryKeys.tasks, [{ task_id: "task-1" }]);
    await client.invalidateQueries({ queryKey: queryKeys.subjects });
    expect(client.getQueryState(queryKeys.subjects).isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.tasks).isInvalidated).toBe(false);
  });
});
