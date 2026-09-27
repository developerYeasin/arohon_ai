import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Loader } from './components/ui.jsx';
import Layout, { MoreMenu } from './components/Layout.jsx';
import StaffLayout from './components/StaffLayout.jsx';
import Landing from './pages/Landing.jsx';

// Pages load on demand so the first visit downloads only what it needs (important on mobile data).
const Login = lazy(() => import('./pages/Auth.jsx').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Auth.jsx').then((m) => ({ default: m.Register })));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Practice = lazy(() => import('./pages/Practice.jsx'));
const ExamPlayer = lazy(() => import('./pages/ExamPlayer.jsx'));
const Result = lazy(() => import('./pages/Result.jsx'));
const Mistakes = lazy(() => import('./pages/Mistakes.jsx'));
const Analytics = lazy(() => import('./pages/Analytics.jsx'));
const Coach = lazy(() => import('./pages/Coach.jsx'));
const Live = lazy(() => import('./pages/Live.jsx'));
const TestLeaderboard = lazy(() => import('./pages/Live.jsx').then((m) => ({ default: m.TestLeaderboard })));
const Leaderboard = lazy(() => import('./pages/Leaderboard.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Billing = lazy(() => import('./pages/Billing.jsx'));
const Terms = lazy(() => import('./pages/Billing.jsx').then((m) => ({ default: m.Terms })));
const Planner = lazy(() => import('./pages/Planner.jsx'));
const Forgot = lazy(() => import('./pages/Forgot.jsx'));
const Written = lazy(() => import('./pages/Written.jsx'));
const WrittenEditor = lazy(() => import('./pages/Written.jsx').then((m) => ({ default: m.WrittenEditor })));
const WrittenSubmission = lazy(() => import('./pages/Written.jsx').then((m) => ({ default: m.WrittenSubmission })));
const Viva = lazy(() => import('./pages/Viva.jsx'));
const VivaSession = lazy(() => import('./pages/Viva.jsx').then((m) => ({ default: m.VivaSession })));
const Battles = lazy(() => import('./pages/Social.jsx').then((m) => ({ default: m.Battles })));
const BattleRoom = lazy(() => import('./pages/Social.jsx').then((m) => ({ default: m.BattleRoom })));
const BattleJoin = lazy(() => import('./pages/Social.jsx').then((m) => ({ default: m.BattleJoin })));
const Groups = lazy(() => import('./pages/Social.jsx').then((m) => ({ default: m.Groups })));
const GroupPage = lazy(() => import('./pages/Social.jsx').then((m) => ({ default: m.GroupPage })));
const Market = lazy(() => import('./pages/Market.jsx'));
const ProductPage = lazy(() => import('./pages/Market.jsx').then((m) => ({ default: m.ProductPage })));
const Library = lazy(() => import('./pages/Market.jsx').then((m) => ({ default: m.Library })));
const CreatorStudio = lazy(() => import('./pages/Market.jsx').then((m) => ({ default: m.CreatorStudio })));
const CreatorProduct = lazy(() => import('./pages/Market.jsx').then((m) => ({ default: m.CreatorProduct })));
const CurrentAffairs = lazy(() => import('./pages/Misc.jsx').then((m) => ({ default: m.CurrentAffairs })));
const Intelligence = lazy(() => import('./pages/Misc.jsx').then((m) => ({ default: m.Intelligence })));
const History = lazy(() => import('./pages/Misc.jsx').then((m) => ({ default: m.History })));
const Bookmarks = lazy(() => import('./pages/Misc.jsx').then((m) => ({ default: m.Bookmarks })));
const QuestionPage = lazy(() => import('./pages/Misc.jsx').then((m) => ({ default: m.QuestionPage })));
const Profile = lazy(() => import('./pages/Misc.jsx').then((m) => ({ default: m.Profile })));

const isStaff = (u) => ['admin', 'teacher'].includes(u?.role);
export const homeFor = (u) => (isStaff(u) ? '/admin' : '/app');

function RequireAuth({ children, roles, studentArea }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Loader />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  // Staff work in their own panel; the student practice area isn't theirs.
  if (studentArea && isStaff(user)) return <Navigate to="/admin" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<Loader />}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/exam/:testId" element={<RequireAuth><ExamPlayer /></RequireAuth>} />
      <Route path="/app" element={<RequireAuth studentArea><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="practice" element={<Practice />} />
        <Route path="result/:attemptId" element={<Result />} />
        <Route path="mistakes" element={<Mistakes />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="coach" element={<Coach />} />
        <Route path="live" element={<Live />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="leaderboard/test/:testId" element={<TestLeaderboard />} />
        <Route path="current-affairs" element={<CurrentAffairs />} />
        <Route path="market" element={<Market />} />
        <Route path="market/:id" element={<ProductPage />} />
        <Route path="library" element={<Library />} />
        <Route path="creator" element={<CreatorStudio />} />
        <Route path="creator/:id" element={<CreatorProduct />} />
        <Route path="intelligence" element={<Intelligence />} />
        <Route path="history" element={<History />} />
        <Route path="bookmarks" element={<Bookmarks />} />
        <Route path="question/:id" element={<QuestionPage />} />
        <Route path="profile" element={<Profile />} />
        <Route path="more" element={<MoreMenu />} />
        <Route path="billing" element={<Billing />} />
        <Route path="planner" element={<Planner />} />
        <Route path="written" element={<Written />} />
        <Route path="written/:id" element={<WrittenEditor />} />
        <Route path="written/submission/:id" element={<WrittenSubmission />} />
        <Route path="viva" element={<Viva />} />
        <Route path="viva/:id" element={<VivaSession />} />
        <Route path="battles" element={<Battles />} />
        <Route path="battle/join/:code" element={<BattleJoin />} />
        <Route path="battle/:id" element={<BattleRoom />} />
        <Route path="groups" element={<Groups />} />
        <Route path="groups/:id" element={<GroupPage />} />
      </Route>
      <Route path="/admin" element={<RequireAuth roles={['admin', 'teacher']}><StaffLayout /></RequireAuth>}>
        <Route index element={<Admin />} />
        <Route path="groups" element={<Groups />} />
        <Route path="groups/:id" element={<GroupPage />} />
        <Route path="question/:id" element={<QuestionPage />} />
        <Route path="result/:attemptId" element={<Result />} />
        <Route path=":section" element={<Admin />} />
      </Route>
      <Route path="/app/admin/*" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
