import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { Btn, C, Card, Row, Screen, T, bn } from '../../lib/ui';

const ITEMS = [
  ['🧠', 'ভুল ও রিভিশন', '/mistakes'],
  ['📊', 'রেডিনেস ও অগ্রগতি', '/analytics'],
  ['🗓️', 'স্টাডি প্ল্যানার', '/planner'],
  ['📰', 'সাম্প্রতিক বিষয়াবলি', '/current-affairs'],
  ['🏆', 'লিডারবোর্ড', '/leaderboard'],
  ['🗂️', 'পরীক্ষার ইতিহাস', '/history'],
  ['💳', 'এক্সাম পাস', '/billing'],
  ['⚙️', 'প্রোফাইল ও লক্ষ্য', '/profile'],
];

export default function More() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <Screen>
      <Card dark>
        <T light bold style={{ fontSize: 18 }}>{user.name}</T>
        <T light muted small>{user.email || user.phone} · ⭐ {bn(user.xp)} XP · 🔥 {bn(user.streak)} দিন</T>
      </Card>
      <Card style={{ padding: 0, gap: 0 }}>
        {ITEMS.map(([i, l, href], k) => (
          <Pressable key={href} onPress={() => router.push(href)} style={({ pressed }) => ({ padding: 16, borderTopWidth: k ? 1 : 0, borderColor: C.line, backgroundColor: pressed ? C.brandSoft : '#fff' })}>
            <Row><T style={{ fontSize: 18 }}>{i}</T><T style={{ flex: 1 }}>{l}</T><T muted>›</T></Row>
          </Pressable>
        ))}
      </Card>
      <T small muted center>লিখিত প্রস্তুতি, মক ভাইভা, ব্যাটল ও স্টাডি গ্রুপ আপাতত ওয়েবসাইটে ব্যবহার করুন।</T>
      <Btn title="লগআউট" kind="light" onPress={logout} />
    </Screen>
  );
}
