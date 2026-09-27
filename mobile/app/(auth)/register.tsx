import React, { useEffect, useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Text, View, useColorScheme } from "react-native";
import { Screen } from "@/components/Screen";
import { HeroTitle } from "@/components/HeroTitle";
import { TextField } from "@/components/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/lib/auth";
import { colors } from "@/constants/colors";

export default function RegisterScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const c = scheme === "dark" ? colors.dark : colors.light;

  const register = useAuth((s) => s.register);
  const loading = useAuth((s) => s.loading);
  const error = useAuth((s) => s.error);
  const clearError = useAuth((s) => s.clearError);
  const user = useAuth((s) => s.user);

  // Support ?ref=CODE deep link prefill.
  const params = useLocalSearchParams<{ ref?: string }>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referral, setReferral] = useState(params.ref ?? "");

  useEffect(() => {
    if (params.ref && !referral) setReferral(params.ref);
  }, [params.ref, referral]);

  useEffect(() => {
    if (user) router.replace("/today");
  }, [user, router]);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const onSubmit = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      Alert.alert("Missing info", "Name, email, and a password of at least 6 characters are required.");
      return;
    }
    try {
      await register(name.trim(), email.trim(), password, referral.trim() || undefined);
    } catch {
      /* handled by store */
    }
  };

  return (
    <Screen keyboardAvoiding scroll padded>
      <View style={{ paddingTop: 24 }}>
        <HeroTitle
          eyebrow="New to Syllo"
          title="Build a calm study habit."
          subtitle="Free forever. Upgrade any time for more AI credits."
        />

        <TextField
          testID="register-name"
          label="Your name"
          value={name}
          onChangeText={setName}
          placeholder="Riley Chen"
          autoCapitalize="words"
        />
        <TextField
          testID="register-email"
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="you@school.edu"
        />
        <TextField
          testID="register-password"
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="At least 6 characters"
        />
        <TextField
          testID="register-referral"
          label="Referral code"
          value={referral}
          onChangeText={setReferral}
          autoCapitalize="characters"
          placeholder="Optional"
          hint="Bring a friend and you both earn extra AI credits."
        />

        {error ? (
          <Text
            style={{
              color: c.danger,
              marginBottom: 12,
              fontFamily: "Manrope_500Medium",
            }}
          >
            {error}
          </Text>
        ) : null}

        <PrimaryButton
          testID="register-submit"
          label="Create account"
          onPress={onSubmit}
          loading={loading}
        />

        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            marginTop: 24,
            gap: 6,
          }}
        >
          <Text style={{ color: c.inkMuted, fontFamily: "Manrope_400Regular" }}>
            Already have an account?
          </Text>
          <Link href="/(auth)/login" asChild>
            <Text
              testID="register-goto-login"
              style={{ color: c.primary, fontFamily: "Manrope_600SemiBold" }}
            >
              Sign in
            </Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
