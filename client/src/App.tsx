import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeaguePage from './pages/LeaguePage';
import LeagueSettingsPage from './pages/LeagueSettingsPage';
import RoundPage from './pages/RoundPage';
import ResultsPage from './pages/ResultsPage';
import JoinPage from './pages/JoinPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/join/:token" element={<ProtectedRoute><JoinPage /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/leagues/:id" element={<ProtectedRoute><LeaguePage /></ProtectedRoute>} />
          <Route path="/leagues/:id/settings" element={<ProtectedRoute><LeagueSettingsPage /></ProtectedRoute>} />
          <Route path="/leagues/:id/rounds/:roundId" element={<ProtectedRoute><RoundPage /></ProtectedRoute>} />
          <Route path="/leagues/:id/rounds/:roundId/results" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
