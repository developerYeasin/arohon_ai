import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../lib/auth';
import { C, Loader } from '../lib/ui';

const PUBLIC = ['login', 'register', 'forgot'];

// Sends signed-out users to login and signed-in users away from the auth screens.
function Gate() {
  const { user, ready } = useAuth();
  const segments = useSegments();
  useEffect(() => {
    if (!ready) return;
    const onPublic = PUBLIC.includes(segments[0]);
    if (!user && !onPublic) router.replace('/login');
    else if (user && onPublic) router.replace('/');
  }, [user, ready, segments]);
  if (!ready) return <Loader />;
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: C.navy }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: 'রেজিস্ট্রেশন' }} />
      <Stack.Screen name="forgot" options={{ title: 'পাসওয়ার্ড রিসেট' }} />
      <Stack.Screen name="exam/[id]" options={{ title: 'পরীক্ষা', gestureEnabled: false }} />
      <Stack.Screen name="result/[id]" options={{ title: 'ডায়াগনস্টিক রিপোর্ট' }} />
      <Stack.Screen name="mistakes" options={{ title: 'ভুল ও রিভিশন' }} />
      <Stack.Screen name="analytics" options={{ title: 'রেডিনেস ও অগ্রগতি' }} />
      <Stack.Screen name="planner" options={{ title: 'স্টাডি প্ল্যানার' }} />
      <Stack.Screen name="billing" options={{ title: 'এক্সাম পাস' }} />
      <Stack.Screen name="profile" options={{ title: 'প্রোফাইল ও লক্ষ্য' }} />
      <Stack.Screen name="current-affairs" options={{ title: 'সাম্প্রতিক বিষয়াবলি' }} />
      <Stack.Screen name="leaderboard" options={{ title: 'লিডারবোর্ড' }} />
      <Stack.Screen name="history" options={{ title: 'পরীক্ষার ইতিহাস' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
