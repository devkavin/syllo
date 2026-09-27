import React from "react";
import {
  Text,
  TextInput,
  TextInputProps,
  View,
  useColorScheme,
} from "react-native";
import { colors } from "@/constants/colors";

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
}

export function TextField({
  label,
  error,
  hint,
  style,
  ...rest
}: TextFieldProps) {
  const scheme = useColorScheme() ?? "light";
  const c = scheme === "dark" ? colors.dark : colors.light;

  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          color: c.inkSoft,
          fontSize: 12,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          marginBottom: 6,
          fontFamily: "Manrope_600SemiBold",
        }}
      >
        {label}
      </Text>
      <TextInput
        placeholderTextColor={c.inkMuted}
        style={[
          {
            borderWidth: 1,
            borderColor: error ? c.danger : c.line,
            backgroundColor: c.card,
            color: c.ink,
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            fontSize: 15,
            fontFamily: "Manrope_500Medium",
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={{ marginTop: 6, color: c.danger, fontSize: 12, fontFamily: "Manrope_500Medium" }}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={{ marginTop: 6, color: c.inkMuted, fontSize: 12, fontFamily: "Manrope_400Regular" }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
