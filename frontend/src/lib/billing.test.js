import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./api", () => ({ http: { post } }));

import { createBillingPortal, createCheckout } from "./billing";

describe("server-owned billing requests", () => {
  beforeEach(() => post.mockReset());

  it("sends only the selected internal plan id to checkout", async () => {
    post.mockResolvedValue({ data: { url: "https://checkout.stripe.com/test" } });
    await createCheckout("scholar");
    expect(post).toHaveBeenCalledWith("/billing/checkout", { plan_id: "scholar" });
  });

  it("does not send a client-controlled portal return URL", async () => {
    post.mockResolvedValue({ data: { url: "https://billing.stripe.com/test" } });
    await createBillingPortal();
    expect(post).toHaveBeenCalledWith("/billing/portal", {});
  });
});
