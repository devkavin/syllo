import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View, ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { colors } from "@/constants/colors";

interface ScreenProps extends ViewProps {
  scroll?: boolean;
  padded?: boolean;
  keyboardAvoiding?: boolean;
  children: React.ReactNode;
}

/**
 * Base screen wrapper. Handles safe area, background token, optional
 * scroll and keyboard avoidance. Every screen should render through this.
 */
export function Screen({
  scroll = true,
  padded = true,
  keyboardAvoiding = false,
  children,
  style,
  ...rest
}: ScreenProps) {
  const scheme = useColorScheme() ?? "light";
  const bg = scheme === "dark" ? colors.dark.paper : colors.light.paper;

  const inner = (
    <View
      style={[{ flex: 1, paddingHorizontal: padded ? 20 : 0 }, style]}
      {...rest}
    >
      {children}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: padded ? 20 : 0,
        paddingBottom: 32,
      }}
      style={{ flex: 1 }}
    >
      {children}
    </ScrollView>
  ) : (
    inner
  );

  const wrapped = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={["top", "left", "right"]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {wrapped}
    </SafeAreaView>
  );
}
