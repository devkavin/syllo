import { exchangeGoogleCode, googleStartUrl, openGoogleSignIn } from "../lib/google-auth";

describe("application-owned Google sign-in", () => {
  it("opens the mobile backend start endpoint with the Syllo deep link", async () => {
    const opener = jest.fn().mockResolvedValue({ type: "success" });
    await openGoogleSignIn("https://syllo.kavinhq.com/api", opener);
    expect(opener).toHaveBeenCalledWith(
      "https://syllo.kavinhq.com/api/auth/google/start?client=mobile",
      "syllo://google-callback",
    );
    expect(googleStartUrl("https://syllo.kavinhq.com/api/")).toBe(
      "https://syllo.kavinhq.com/api/auth/google/start?client=mobile",
    );
  });

  it("exchanges only the returned one-time code", async () => {
    const response = { data: { access_token: "access", refresh_token: "refresh" } };
    const client = { post: jest.fn().mockResolvedValue(response) };
    await expect(exchangeGoogleCode("one-time-code", client as never)).resolves.toEqual(
      response.data,
    );
    expect(client.post).toHaveBeenCalledWith("/auth/google/mobile/exchange", {
      code: "one-time-code",
    });
  });
});
