import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tint, useTheme } from './theme';

export function Screen({ children, scroll = true, testID }: { children: ReactNode; scroll?: boolean; testID?: string }) {
  const t = useTheme();
  const inset = useSafeAreaInsets();
  const style = { padding: 16, paddingBottom: 24 + inset.bottom, gap: 10 };
  return scroll
    ? <ScrollView testID={testID} style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={style}>{children}</ScrollView>
    : <View testID={testID} style={[{ flex: 1, backgroundColor: t.bg }, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: t.ink, marginVertical: 4 }}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', color: t.ink, marginTop: 10 }}>{children}</Text>;
}
export function P({ children, muted, small, style, testID }: { children: ReactNode; muted?: boolean; small?: boolean; style?: object; testID?: string }) {
  const t = useTheme();
  return <Text testID={testID} style={[{ color: muted ? t.muted : t.ink, fontSize: small ? 13 : 15, lineHeight: small ? 18 : 22 }, style]}>{children}</Text>;
}

export function Button({ title, onPress, kind = 'plain', disabled, testID, style }: {
  title: string; onPress: () => void; kind?: 'plain' | 'primary' | 'danger' | 'link'; disabled?: boolean; testID?: string; style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'danger' ? t.warn : kind === 'link' ? 'transparent' : t.card;
  const fg = kind === 'primary' || kind === 'danger' ? '#fff' : kind === 'link' ? t.muted : t.ink;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: kind === 'link' ? 'transparent' : kind === 'plain' ? t.line : bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}>
      <Text style={{ color: fg, fontWeight: kind === 'primary' ? '700' : '500', fontSize: 16, textDecorationLine: kind === 'link' ? 'underline' : 'none' }}>{title}</Text>
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>{children}</View>;
}

export function Card({ children, style, testID }: { children: ReactNode; style?: ViewStyle; testID?: string }) {
  const t = useTheme();
  return <View testID={testID} style={[{ backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 }, style]}>{children}</View>;
}

export function Note({ children, tone = 'warn', testID }: { children: ReactNode; tone?: 'warn' | 'good' | 'info'; testID?: string }) {
  const t = useTheme();
  const c = tone === 'warn' ? t.warn : tone === 'good' ? t.good : t.info;
  return <View testID={testID} style={{ backgroundColor: tint(c, 0.14), borderRadius: 12, padding: 12, gap: 6 }}>{typeof children === 'string' ? <P>{children}</P> : children}</View>;
}

export function Pill({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: t.ink, fontSize: 13 }}>{children}</Text></View>;
}

export function Bar({ value, max }: { value: number; max: number }) {
  const t = useTheme();
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return <View style={{ height: 10, borderRadius: 5, backgroundColor: t.line, overflow: 'hidden' }}><View style={{ width: `${pct * 100}%`, height: 10, backgroundColor: t.accent }} /></View>;
}

const s = StyleSheet.create({
  btn: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
});
