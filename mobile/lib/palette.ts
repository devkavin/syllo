// Subject palette. Ids must stay in sync with backend seed.
export type SubjectColorId =
  | "sage"
  | "ochre"
  | "terracotta"
  | "dusty_blue"
  | "lavender"
  | "rosewood"
  | "muted_olive"
  | "slate";

type SubjectPalette = {
  name: string;
  dot: string;
  bgLight: string;
  textLight: string;
  bgDark: string;
  textDark: string;
};

export const SUBJECT_COLORS: Record<SubjectColorId, SubjectPalette> = {
  sage: { name: "Sage", dot: "#4A7C59", bgLight: "#EAF2E8", textLight: "#274F29", bgDark: "#1F2B20", textDark: "#B5D9B2" },
  ochre: { name: "Ochre", dot: "#D9822B", bgLight: "#FDF4E7", textLight: "#7A4B13", bgDark: "#2E2316", textDark: "#F5C78E" },
  terracotta: { name: "Terracotta", dot: "#C85A5A", bgLight: "#FCEFEF", textLight: "#7D2D2D", bgDark: "#2E1B1B", textDark: "#F2B0B0" },
  dusty_blue: { name: "Dusty Blue", dot: "#4C7DA7", bgLight: "#EFF4F9", textLight: "#26486B", bgDark: "#1B2530", textDark: "#B3D1EE" },
  lavender: { name: "Lavender", dot: "#7E5EA6", bgLight: "#F4F1F9", textLight: "#4A3366", bgDark: "#231B2E", textDark: "#D2C2EC" },
  rosewood: { name: "Rosewood", dot: "#A84B73", bgLight: "#FAF0F4", textLight: "#6B2A45", bgDark: "#2B1A22", textDark: "#EEB7CE" },
  muted_olive: { name: "Olive", dot: "#6B753B", bgLight: "#F3F4EA", textLight: "#404620", bgDark: "#222518", textDark: "#CCD2A5" },
  slate: { name: "Slate", dot: "#5F666D", bgLight: "#EFEFEF", textLight: "#33373B", bgDark: "#212325", textDark: "#CDD1D5" },
};

export const SUBJECT_COLOR_IDS = Object.keys(SUBJECT_COLORS) as SubjectColorId[];

export function subjectColor(id?: string | null): SubjectPalette {
  if (id && (SUBJECT_COLORS as Record<string, SubjectPalette>)[id]) {
    return (SUBJECT_COLORS as Record<string, SubjectPalette>)[id];
  }
  return SUBJECT_COLORS.slate;
}

export function subjectClasses(id: string | null | undefined, isDark: boolean) {
  const c = subjectColor(id);
  return {
    bg: isDark ? c.bgDark : c.bgLight,
    text: isDark ? c.textDark : c.textLight,
    dot: c.dot,
  };
}
