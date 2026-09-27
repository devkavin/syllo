import React, { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Text, View, useColorScheme } from "react-native";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/lib/auth";
import { colors } from "@/constants/colors";

/**
 * Deep link handler for the Emergent Google flow.
 * Emergent redirects to `syllo://google-callback#session_id=xxx`. Expo Router
 * surfaces the fragment via useLocalSearchParams as `session_id`.
 */
export default function GoogleCallbackScreen() {
  const params = useLocalSearchParams<{ session_id?: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const c = scheme === "dark" ? colors.dark : colors.light;
  const googleExchange = useAuth((s) => s.googleExchange);
  const exchanged = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (exchanged.current) return;
    const sid = params.session_id;
    if (!sid) {
      setErrorMsg("No Google session was returned. Please try again.");
      return;
    }
    exchanged.current = true;
    (async () => {
      try {
        await googleExchange(sid);
        router.replace("/today");
      } catch (e: unknown) {
        setErrorMsg("Google sign-in failed. Please try again.");
      }
    })();
  }, [params.session_id, googleExchange, router]);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator color={c.primary} />
        <Text style={{ color: c.inkSoft, fontFamily: "Manrope_500Medium" }}>
          {errorMsg ?? "Finishing sign-in..."}
        </Text>
        {errorMsg ? (
          <Text
            onPress={() => router.replace("/(auth)/login")}
            style={{
              marginTop: 12,
              color: c.primary,
              fontFamily: "Manrope_600SemiBold",
            }}
          >
            Back to sign in
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
