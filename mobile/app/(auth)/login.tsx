import React, { useEffect, useState } from "react";
import { Link, useRouter } from "expo-router";
import { Text, View, useColorScheme, Alert } from "react-native";
import { Screen } from "@/components/Screen";
import { HeroTitle } from "@/components/HeroTitle";
import { TextField } from "@/components/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/lib/auth";
import { colors } from "@/constants/colors";
import { openGoogleSignIn } from "@/lib/google-auth";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "";

export default function LoginScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const c = scheme === "dark" ? colors.dark : colors.light;

  const login = useAuth((s) => s.login);
  const loading = useAuth((s) => s.loading);
  const error = useAuth((s) => s.error);
  const clearError = useAuth((s) => s.clearError);
  const user = useAuth((s) => s.user);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (user) router.replace("/today");
  }, [user, router]);

  useEffect(() => {
    // clear any stale global error when this screen mounts
    clearError();
  }, [clearError]);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing info", "Enter your email and password.");
      return;
    }
    try {
      await login(email.trim(), password);
    } catch {
      /* error is surfaced from the store */
    }
  };

  const onGoogle = async () => {
    setGoogleLoading(true);
    try {
      await openGoogleSignIn(API_BASE);
    } catch (e) {
      Alert.alert("Google sign-in failed", "Try again in a moment.");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <Screen keyboardAvoiding scroll padded>
      <View style={{ paddingTop: 24 }}>
        <HeroTitle
          eyebrow="Welcome back"
          title="Sign in to Syllo."
          subtitle="Your calm study workspace, right where you left it."
        />

        <TextField
          testID="login-email"
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="you@school.edu"
          textContentType="username"
        />
        <TextField
          testID="login-password"
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          textContentType="password"
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
          testID="login-submit"
          label="Sign in"
          onPress={onSubmit}
          loading={loading}
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginVertical: 20,
          }}
        >
          <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
          <Text
            style={{
              color: c.inkMuted,
              fontSize: 12,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              fontFamily: "Manrope_600SemiBold",
            }}
          >
            or
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
        </View>

        <PrimaryButton
          testID="login-google"
          variant="secondary"
          label="Continue with Google"
          onPress={onGoogle}
          loading={googleLoading}
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
            New here?
          </Text>
          <Link href="/(auth)/register" asChild>
            <Text
              testID="login-goto-register"
              style={{
                color: c.primary,
                fontFamily: "Manrope_600SemiBold",
              }}
            >
              Create an account
            </Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
