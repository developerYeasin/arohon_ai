import { Text } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { C } from '../../lib/ui';

function TabIcon({ emoji, focused }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
}
const icon = (emoji) => function Icon({ focused }) { return <TabIcon emoji={emoji} focused={focused} />; };

export default function TabLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  // Staff don't use the student tabs.
  if (['admin', 'teacher'].includes(user.role)) return <Redirect href="/staff" />;
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: C.brand, tabBarInactiveTintColor: C.muted,
      headerStyle: { backgroundColor: C.navy }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' },
      tabBarLabelStyle: { fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'হোম', headerTitle: '⛰️ আরোহণ', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="practice" options={{ title: 'অনুশীলন', tabBarIcon: icon('📝') }} />
      <Tabs.Screen name="live" options={{ title: 'লাইভ', headerTitle: 'লাইভ এক্সাম', tabBarIcon: icon('🔴') }} />
      <Tabs.Screen name="coach" options={{ title: 'কোচ', headerTitle: 'এআই কোচ', tabBarIcon: icon('🤖') }} />
      <Tabs.Screen name="more" options={{ title: 'আরও', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}
