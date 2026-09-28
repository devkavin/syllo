import * as WebBrowser from "expo-web-browser";
import { api } from "./api";
import type { AuthResponse } from "./types";

export const MOBILE_GOOGLE_REDIRECT = "syllo://google-callback";

export function googleStartUrl(apiBase: string): string {
  if (!apiBase) throw new Error("EXPO_PUBLIC_API_BASE is required for Google sign-in");
  return `${apiBase.replace(/\/$/, "")}/auth/google/start?client=mobile`;
}

export async function openGoogleSignIn(
  apiBase: string,
  opener = WebBrowser.openAuthSessionAsync,
) {
  return opener(googleStartUrl(apiBase), MOBILE_GOOGLE_REDIRECT);
}

export async function exchangeGoogleCode(
  code: string,
  client: Pick<typeof api, "post"> = api,
): Promise<AuthResponse> {
  const response = await client.post<AuthResponse>("/auth/google/mobile/exchange", { code });
  return response.data;
}
