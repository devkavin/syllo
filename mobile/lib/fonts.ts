import {
  useFonts as useManropeFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from "@expo-google-fonts/manrope";
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
} from "@expo-google-fonts/bricolage-grotesque";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";

// Single hook that loads every font family Syllo uses.
export function useSylloFonts(): boolean {
  const [loaded] = useManropeFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    JetBrainsMono_500Medium,
  });
  return loaded;
}
