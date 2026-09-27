import React, { useEffect } from "react";
import { Slot, SplashScreen } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, useColorScheme } from "react-native";
import { useSylloFonts } from "@/lib/fonts";
import { useAuth } from "@/lib/auth";
import { colors } from "@/constants/colors";
import "../global.css";

SplashScreen.preventAutoHideAsync().catch(() => {
  /* it's fine if this already happened */
});

export default function RootLayout() {
  const fontsLoaded = useSylloFonts();
  const hydrate = useAuth((s) => s.hydrate);
  const hydrated = useAuth((s) => s.hydrated);
  const scheme = useColorScheme() ?? "light";
  const bg = scheme === "dark" ? colors.dark.paper : colors.light.paper;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (fontsLoaded && hydrated) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, hydrated]);

  if (!fontsLoaded || !hydrated) {
    return <View style={{ flex: 1, backgroundColor: bg }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: bg }}>
      <SafeAreaProvider>
        <Slot />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
