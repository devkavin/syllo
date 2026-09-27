/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Solid values (RN NativeWind cannot resolve hsl(var())):
        paper: "#F5F1E9",
        ink: "#232019",
        inkMuted: "#8A8577",
        card: "#FFFFFF",
        line: "#E5DED0",
        // Dark tokens
        paperDark: "#161513",
        inkDark: "#EDE7DA",
        inkMutedDark: "#8E8778",
        cardDark: "#1D1B18",
        lineDark: "#2A2723",
        // Subject accents
        sage: "#4A7C59",
        ochre: "#D9822B",
        terracotta: "#C85A5A",
        dustyBlue: "#4C7DA7",
        lavender: "#7E5EA6",
        rosewood: "#A84B73",
        oliveMuted: "#6B753B",
        slate: "#5F666D",
        // Primary brand
        primary: "#2D3A2C",
        primaryDark: "#B9C7B4",
      },
      fontFamily: {
        sans: ["Manrope_400Regular"],
        sansMedium: ["Manrope_500Medium"],
        sansSemibold: ["Manrope_600SemiBold"],
        sansBold: ["Manrope_700Bold"],
        display: ["BricolageGrotesque_600SemiBold"],
        displayBold: ["BricolageGrotesque_700Bold"],
        mono: ["JetBrainsMono_500Medium"],
      },
    },
  },
  plugins: [],
};
