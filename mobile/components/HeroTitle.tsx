import React from "react";
import { Text, View, useColorScheme } from "react-native";
import { colors } from "@/constants/colors";

interface HeroTitleProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}

/**
 * Hero header used on Today, empty states, and auth screens.
 * Small ALL CAPS eyebrow → large display H1 → optional soft subtitle.
 */
export function HeroTitle({ eyebrow, title, subtitle }: HeroTitleProps) {
  const scheme = useColorScheme() ?? "light";
  const c = scheme === "dark" ? colors.dark : colors.light;

  return (
    <View style={{ marginTop: 8, marginBottom: 20 }}>
      {eyebrow ? (
        <Text
          style={{
            color: c.inkMuted,
            letterSpacing: 2,
            textTransform: "uppercase",
            fontSize: 11,
            marginBottom: 8,
            fontFamily: "Manrope_600SemiBold",
          }}
        >
          {eyebrow}
        </Text>
      ) : null}
      <Text
        style={{
          color: c.ink,
          fontSize: 34,
          lineHeight: 40,
          fontFamily: "BricolageGrotesque_700Bold",
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            color: c.inkSoft,
            fontSize: 15,
            lineHeight: 22,
            marginTop: 8,
            fontFamily: "Manrope_400Regular",
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
