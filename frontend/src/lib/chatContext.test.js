import { describe, expect, it } from "vitest";
import { recentChatContext } from "./chatContext";

describe("recentChatContext", () => {
  it("keeps only recent completed turns within the history budget", () => {
    const messages = [
      { role: "model", text: "Welcome", isGreeting: true },
      { role: "user", text: "old question" },
      { role: "model", text: "old answer" },
      { role: "user", text: "middle question" + "a".repeat(1450) },
      { role: "model", text: "middle answer" + "b".repeat(1450) },
      { role: "user", text: "recent question" + "c".repeat(1450) },
      { role: "model", text: "recent answer" + "d".repeat(1450) },
      { role: "model", text: "", pending: true },
    ];
    const context = recentChatContext(messages);
    expect(context.map((message) => message.text).join(" ")).toContain("recent question");
    expect(context.map((message) => message.text).join(" ")).toContain("recent answer");
    expect(context.map((message) => message.text).join(" ")).not.toContain("old question");
    expect(context.reduce((size, message) => size + `${message.role}: ${message.text}`.length + 1, 0)).toBeLessThanOrEqual(4000);
  });
});
