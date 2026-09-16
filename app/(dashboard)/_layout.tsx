import { Tabs } from 'expo-router';
import { colors, fonts } from '@/constants/theme';

export default function DashboardLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.border,
        tabBarStyle: { backgroundColor: colors.bgDarkest },
        tabBarLabelStyle: { fontFamily: fonts.body, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="documents" options={{ title: 'Documents' }} />
      <Tabs.Screen name="coverage" options={{ title: 'Coverage' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
      <Tabs.Screen name="assets" options={{ href: null }} />
      <Tabs.Screen name="bills" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="estate" options={{ href: null }} />
    </Tabs>
  );
}
