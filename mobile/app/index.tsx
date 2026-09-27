import React from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";

export default function Index() {
  const user = useAuth((s) => s.user);
  if (!user) return <Redirect href="/(auth)/login" />;
  return <Redirect href="/today" />;
}
