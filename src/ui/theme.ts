import { useColorScheme } from 'react-native';

const light = {
  bg: '#fbf7f0', card: '#ffffff', ink: '#2d2a26', muted: '#7a7268', line: '#e7e0d5',
  accent: '#2f7d5b', accent2: '#e08a2c', good: '#2f7d5b', warn: '#b5532a', info: '#4a6fa5',
  mapBg: '#e9f1df', water: '#a9d3e8', path: '#f6f1e4', route: '#2f7d5b', poi: '#8a7a65', hub: '#4a6fa5', me: '#2563eb',
  simBg: '#fff1c2', simInk: '#6b5200',
};
const dark: typeof light = {
  ...light,
  bg: '#171a17', card: '#222622', ink: '#ece8e1', muted: '#a39b90', line: '#343a34',
  mapBg: '#243024', water: '#2f5566', path: '#3d4a3c', poi: '#b2a48f', simBg: '#4a3d10', simInk: '#ffe9a8',
};
export type Theme = typeof light;
export function useTheme(): Theme { return useColorScheme() === 'dark' ? dark : light; }
export const tint = (hex: string, alpha: number) => hex + Math.round(alpha * 255).toString(16).padStart(2, '0');
