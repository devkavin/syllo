import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  useColorScheme,
  View,
  ViewStyle,
} from "react-native";
import { colors } from "@/constants/colors";

type Variant = "primary" | "secondary" | "ghost";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  icon?: React.ReactNode;
  testID?: string;
  style?: ViewStyle;
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  icon,
  testID,
  style,
}: PrimaryButtonProps) {
  const scheme = useColorScheme() ?? "light";
  const c = scheme === "dark" ? colors.dark : colors.light;

  const isPrimary = variant === "primary";
  const isSecondary = variant === "secondary";
  const bg = isPrimary ? c.primary : isSecondary ? c.card : "transparent";
  const fg = isPrimary ? c.primaryFg : c.ink;
  const border = isPrimary ? c.primary : c.line;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          borderRadius: 14,
          paddingVertical: 14,
          paddingHorizontal: 18,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon}
          <Text
            style={{
              color: fg,
              fontSize: 15,
              fontFamily: "Manrope_600SemiBold",
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
