import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import CreateRoomPage from './pages/CreateRoomPage';
import GamePage from './pages/GamePage';
import JoinRoomPage from './pages/JoinRoomPage';
import LobbyPage from './pages/LobbyPage';

export default function App() {
  return (
    <Router>
      <AppShell>
        <Routes>
          <Route path="/" element={<CreateRoomPage />} />
          <Route path="/room/:roomCode/lobby" element={<LobbyPage />} />
          <Route path="/room/:roomCode" element={<GamePage />} />
          <Route path="/join" element={<JoinRoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </Router>
  );
}
