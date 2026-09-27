import React from "react";
import { Text, View, useColorScheme } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { HeroTitle } from "@/components/HeroTitle";
import { StatCard } from "@/components/StatCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/lib/auth";
import { greeting } from "@/lib/format";
import { colors } from "@/constants/colors";

/**
 * Placeholder Today screen. Session C will replace this with the full
 * dashboard (streak heatmap, tasks, quick focus, etc.). For Sessions A+B
 * it just confirms auth roundtripped correctly.
 */
export default function TodayScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const c = scheme === "dark" ? colors.dark : colors.light;
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  React.useEffect(() => {
    if (!user) router.replace("/(auth)/login");
  }, [user, router]);

  if (!user) return null;

  const onSignOut = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const firstName = (user.name || user.email).split(" ")[0];

  return (
    <Screen>
      <View style={{ paddingTop: 12 }}>
        <HeroTitle
          eyebrow={greeting()}
          title={`Hi, ${firstName}.`}
          subtitle="Session A + B are live. Session C brings your real Today dashboard."
        />

        <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
          <StatCard label="Plan" value={(user.plan || "freshman").toString()} />
          <StatCard
            label="AI credits"
            value={String(user.ai_credits_remaining ?? 0)}
            hint="Refill monthly"
          />
        </View>

        <View
          style={{
            backgroundColor: c.card,
            borderColor: c.line,
            borderWidth: 1,
            borderRadius: 16,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <Text
            style={{
              color: c.inkMuted,
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 6,
              fontFamily: "Manrope_600SemiBold",
            }}
          >
            Signed in as
          </Text>
          <Text style={{ color: c.ink, fontSize: 16, fontFamily: "Manrope_600SemiBold" }}>
            {user.email}
          </Text>
          {user.referral_code ? (
            <Text
              style={{
                color: c.inkSoft,
                marginTop: 6,
                fontFamily: "Manrope_400Regular",
              }}
            >
              Referral code: {user.referral_code}
            </Text>
          ) : null}
        </View>

        <PrimaryButton
          testID="today-sign-out"
          variant="secondary"
          label="Sign out"
          onPress={onSignOut}
        />
      </View>
    </Screen>
  );
}
