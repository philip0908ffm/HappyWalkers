import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading } from './components/Loading';
import { RequireAuth } from './components/RequireAuth';

/*
 * Seiten werden einzeln nachgeladen (schnellerer Start auf älteren Laptops).
 * Deutsche, sprechende Adressen – sie dürfen in Aushängen und E-Mails stehen.
 */
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/auth/Login'));
const Onboarding = lazy(() => import('./pages/auth/Onboarding'));
const WalksPage = lazy(() => import('./pages/walks/WalksPage'));
const WalkDetail = lazy(() => import('./pages/walks/WalkDetail'));
const WalkForm = lazy(() => import('./pages/walks/WalkForm'));
const WalkPrint = lazy(() => import('./pages/walks/WalkPrint'));
const GroupsPage = lazy(() => import('./pages/groups/GroupsPage'));
const GroupDetail = lazy(() => import('./pages/groups/GroupDetail'));
const GroupForm = lazy(() => import('./pages/groups/GroupForm'));
const GroupAdmin = lazy(() => import('./pages/groups/GroupAdmin'));
const GroupPoster = lazy(() => import('./pages/groups/GroupPoster'));
const InviteLanding = lazy(() => import('./pages/groups/InviteLanding'));
const LogWalk = lazy(() => import('./pages/activities/LogWalk'));
const ActivityDetail = lazy(() => import('./pages/activities/ActivityDetail'));
const BadgesPage = lazy(() => import('./pages/badges/BadgesPage'));
const BadgeShare = lazy(() => import('./pages/badges/BadgeShare'));
const ChallengeDetail = lazy(() => import('./pages/badges/ChallengeDetail'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const PersonPage = lazy(() => import('./pages/profile/PersonPage'));
const Settings = lazy(() => import('./pages/profile/Settings'));
const NotificationsPage = lazy(() => import('./pages/profile/NotificationsPage'));
const Nearby = lazy(() => import('./pages/rural/Nearby'));
const PremiumPage = lazy(() => import('./pages/premium/PremiumPage'));
const ProgressPage = lazy(() => import('./pages/premium/ProgressPage'));
const WhoSeesWhat = lazy(() => import('./pages/info/WhoSeesWhat'));
const Privacy = lazy(() => import('./pages/info/Privacy'));
const Imprint = lazy(() => import('./pages/info/Imprint'));
const Help = lazy(() => import('./pages/info/Help'));
const NotFound = lazy(() => import('./pages/info/NotFound'));

const auth = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>;

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* Druckansichten ohne Navigation */}
        <Route path="/gruppen/:id/aushang" element={auth(<GroupPoster />)} />
        <Route path="/walks/:id/drucken" element={auth(<WalkPrint />)} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="anmelden" element={<Login />} />
          <Route path="willkommen" element={<RequireAuth allowNotOnboarded><Onboarding /></RequireAuth>} />
          <Route path="einladung/:code" element={<InviteLanding />} />
          <Route path="walks" element={<WalksPage />} />
          <Route path="walks/neu" element={auth(<WalkForm />)} />
          <Route path="walks/:id" element={<WalkDetail />} />
          <Route path="walks/:id/bearbeiten" element={auth(<WalkForm />)} />
          <Route path="walk-eintragen" element={auth(<LogWalk />)} />
          <Route path="eintraege/:id" element={auth(<ActivityDetail />)} />
          <Route path="gruppen" element={<GroupsPage />} />
          <Route path="gruppen/neu" element={auth(<GroupForm />)} />
          <Route path="gruppen/:id" element={<GroupDetail />} />
          <Route path="gruppen/:id/bearbeiten" element={auth(<GroupForm />)} />
          <Route path="gruppen/:id/verwaltung" element={auth(<GroupAdmin />)} />
          <Route path="abzeichen" element={auth(<BadgesPage />)} />
          <Route path="abzeichen/geteilt/:token" element={<BadgeShare />} />
          <Route path="challenges/:id" element={auth(<ChallengeDetail />)} />
          <Route path="profil" element={auth(<ProfilePage />)} />
          <Route path="profil/einstellungen" element={auth(<Settings />)} />
          <Route path="profil/nachrichten" element={auth(<NotificationsPage />)} />
          <Route path="personen/:id" element={auth(<PersonPage />)} />
          <Route path="in-der-naehe" element={auth(<Nearby />)} />
          <Route path="premium" element={<PremiumPage />} />
          <Route path="fortschritt" element={auth(<ProgressPage />)} />
          <Route path="wer-sieht-was" element={<WhoSeesWhat />} />
          <Route path="datenschutz" element={<Privacy />} />
          <Route path="impressum" element={<Imprint />} />
          <Route path="hilfe" element={<Help />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
