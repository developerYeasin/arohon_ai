import { Linking, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { Btn, C, Card, ErrorBox, H3, Loader, Row, Screen, T, bn, useFetch } from '../lib/ui';

// Admins and teachers manage content on the web panel; on the phone they get today's to-do and the numbers.
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'http://localhost:5173').replace(/\/$/, '');

export default function Staff() {
  const { user, logout } = useAuth();
  const { data, error, loading, reload } = useFetch('/admin/overview');
  const { data: queue } = useFetch('/prep/expert/queue');
  if (!user) return null;
  const admin = user.role === 'admin';
  if (loading && !data) return <Loader />;
  const open = (path = '') => Linking.openURL(`${WEB_URL}/admin${path}`);
  const todo = data ? [
    [data.open_reports, 'টি প্রশ্নে ভুল রিপোর্ট', '/reports'],
    [data.needs_review, 'টি প্রশ্ন পর্যালোচনার অপেক্ষায়', '/questions'],
    [queue?.length || 0, 'টি লিখিত উত্তর মূল্যায়নের অপেক্ষায়', '/expert'],
    ...(admin ? [[data.pending_payments, 'টি পেমেন্ট যাচাইয়ের অপেক্ষায়', '/payments']] : []),
  ].filter(([n]) => n > 0) : [];
  const stats = data ? [['সক্রিয় প্রশ্ন', data.active_questions], ['মোট ব্যবহারকারী', data.users], ['আজ সক্রিয়', data.dau], ['এই সপ্তাহে', data.wau],
    ...(admin ? [['সাবস্ক্রাইবার', data.active_subscribers], ['৩০ দিনের আয় ৳', Number(data.revenue_30d)]] : [])] : [];

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Card dark>
        <T light muted small>{admin ? 'অ্যাডমিন' : 'শিক্ষক'} প্যানেল</T>
        <T light bold style={{ fontSize: 20 }}>{user.name}</T>
        {user.institution ? <T light muted small>{user.institution}</T> : null}
      </Card>
      <ErrorBox error={error} />
      <Card>
        <H3>✅ আজকের করণীয়</H3>
        {!todo.length ? <T small muted>সব কাজ হালনাগাদ — অপেক্ষমাণ কিছু নেই।</T> : todo.map(([n, t, p]) => (
          <Row key={p} between style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: C.line, flexWrap: 'nowrap' }}>
            <T small style={{ flex: 1 }}><T small bold>{bn(n)}</T>{t}</T>
            <Btn title="খুলুন" small onPress={() => open(p)} />
          </Row>
        ))}
      </Card>
      <Row>
        {stats.map(([l, v]) => (
          <View key={l} style={{ width: '47%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.line }}>
            <T bold style={{ fontSize: 22 }}>{bn(v)}</T><T small muted>{l}</T>
          </View>
        ))}
      </Row>
      <Card>
        <H3>🛠️ ব্যবস্থাপনা</H3>
        <T small muted>প্রশ্ন যোগ, লাইভ এক্সাম তৈরি, রিপোর্ট ও পেমেন্ট যাচাইয়ের মতো কাজ বড় স্ক্রিনে সহজ — ওয়েব প্যানেলে খুলুন।</T>
        <Btn title="ওয়েবে প্যানেল খুলুন" onPress={() => open()} />
        <Btn title="+ নতুন প্রশ্ন" kind="ghost" onPress={() => open('/questions')} />
      </Card>
      <Btn title="লগআউট" kind="light" onPress={logout} />
    </Screen>
  );
}
