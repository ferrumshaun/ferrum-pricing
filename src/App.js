import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ConfigProvider } from './contexts/ConfigContext';
import LoginPage     from './pages/LoginPage';
import QuotePage     from './pages/QuotePage';
import QuotesPage    from './pages/QuotesPage';
import AdminPage     from './pages/AdminPage';
import ActivityPage  from './pages/ActivityPage';
import VoiceQuotePage from './pages/VoiceQuotePage';
import BundleQuotePage    from './pages/BundleQuotePage';
import MultiSiteQuotePage from './pages/MultiSiteQuotePage';
import ChangelogPage   from './pages/ChangelogPage';
import Layout          from './components/Layout';
import MarketRatesPage  from './pages/MarketRatesPage';
import FlexITQuotePage  from './pages/FlexITQuotePage';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={styles.loader}>Loading...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div style={styles.loader}>Loading...</div>;
  return isAdmin ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index           element={<QuotePage />} />
        <Route path="quotes"      element={<QuotesPage />} />
        <Route path="quotes/new"   element={<QuotePage />} />
        <Route path="quotes/:id"   element={<QuotePage />} />
        <Route path="voice"        element={<VoiceQuotePage />} />
        <Route path="voice/new"    element={<VoiceQuotePage />} />
        <Route path="voice/:id"    element={<VoiceQuotePage />} />
        <Route path="bundle"          element={<BundleQuotePage />} />
        <Route path="bundle/new"      element={<BundleQuotePage />} />
        <Route path="bundle/:id"      element={<BundleQuotePage />} />
        <Route path="multisite"       element={<MultiSiteQuotePage />} />
        <Route path="market-rates"     element={<MarketRatesPage />} />
        <Route path="flexIT/new"         element={<FlexITQuotePage />} />
        <Route path="flexIT/:id"         element={<FlexITQuotePage />} />
        <Route path="multisite/new"   element={<MultiSiteQuotePage />} />
        <Route path="multisite/:id"   element={<MultiSiteQuotePage />} />
        <Route path="changelog"  element={<ChangelogPage />} />
        <Route path="admin"    element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="activity" element={<RequireAdmin><ActivityPage /></RequireAdmin>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ConfigProvider>
          <AppRoutes />
        </ConfigProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

const styles = {
  loader: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', fontFamily: 'system-ui', color: '#6b7280', fontSize: 14
  }
};
