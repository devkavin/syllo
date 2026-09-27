import * as SecureStore from "expo-secure-store";

// Thin wrapper around expo-secure-store. Never persist secrets in AsyncStorage.
export const store = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  del: (key: string) => SecureStore.deleteItemAsync(key),
};

export const STORAGE_KEYS = {
  accessToken: "syllo_access_token",
  refreshToken: "syllo_refresh_token",
  themeMode: "syllo_theme_mode",
};
