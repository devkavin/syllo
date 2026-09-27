// Solid color tokens for Syllo mobile.
// NativeWind on RN cannot resolve hsl(var()) at runtime, so keep hex values.

export const colors = {
  light: {
    paper: "#F5F1E9",
    paperElevated: "#FFFFFF",
    ink: "#232019",
    inkSoft: "#4A4638",
    inkMuted: "#8A8577",
    card: "#FFFFFF",
    line: "#E5DED0",
    lineSoft: "#EFE9DB",
    primary: "#2D3A2C",
    primaryFg: "#F5F1E9",
    accent: "#D9822B",
    danger: "#C85A5A",
  },
  dark: {
    paper: "#161513",
    paperElevated: "#1D1B18",
    ink: "#EDE7DA",
    inkSoft: "#CFC7B6",
    inkMuted: "#8E8778",
    card: "#1D1B18",
    line: "#2A2723",
    lineSoft: "#221F1B",
    primary: "#B9C7B4",
    primaryFg: "#161513",
    accent: "#E39A4D",
    danger: "#D6716E",
  },
};

export type ThemeMode = "light" | "dark";
export type ColorTokens = typeof colors.light;
