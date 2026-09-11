export const colors = {
  // Escala principal (escuro → claro)
  bgDarkest: '#131E15',
  primary: '#324138',
  surfaceAlt: '#5B685F',
  neutralMid: '#859087',
  border: '#ADB5B0',
  bgLight: '#DBE0DF',
  // Accent
  accent: '#C9A15C',
  // Base
  black: '#000000',
  white: '#FFFFFF',
  // Texto
  textPrimary: '#000000',
  textInverted: '#FFFFFF',
  textMuted: '#859087',
  // Severidade de alertas
  info: '#5B685F',
  warning: '#C9A15C',
  critical: '#A3402E',
} as const;

// Avenir e Lato não vêm com o Expo — adicionar os .ttf a src/assets/fonts/
// e carregar via expo-font em app/_layout.tsx antes de usar estes tokens.
export const fonts = {
  display: 'Avenir', // títulos, headings principais
  body: 'Lato',       // corpo de texto, descrições, UI
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;
