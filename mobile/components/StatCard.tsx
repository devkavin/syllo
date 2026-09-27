import React from "react";
import { Text, View, useColorScheme } from "react-native";
import { colors } from "@/constants/colors";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}

export function StatCard({ label, value, hint, accent }: StatCardProps) {
  const scheme = useColorScheme() ?? "light";
  const c = scheme === "dark" ? colors.dark : colors.light;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.card,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
        gap: 4,
      }}
    >
      <Text
        style={{
          color: c.inkMuted,
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontFamily: "Manrope_600SemiBold",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: accent ?? c.ink,
          fontSize: 22,
          fontFamily: "BricolageGrotesque_700Bold",
        }}
      >
        {value}
      </Text>
      {hint ? (
        <Text
          style={{
            color: c.inkMuted,
            fontSize: 12,
            fontFamily: "Manrope_400Regular",
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
