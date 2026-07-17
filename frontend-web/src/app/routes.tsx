import { type RouteObject } from 'react-router-dom';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Account from '@/pages/Account';
import Armurerie from '@/pages/Armurerie';
import AddGear from '@/pages/AddGear';
import FreelanceGear from '@/pages/FreelanceGear';
import Search from '@/pages/Search';
import Messages from '@/pages/Messages';
import MessageThread from '@/pages/MessageThread';
import NotFound from '@/pages/NotFound';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';

// Table de routes (SH-19). Module sans effet de bord : les tests l'importent sans
// construire de router browser-history (SH-38).
export const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    path: '/mon-compte',
    element: (
      <ProtectedRoute>
        <Account />
      </ProtectedRoute>
    ),
  },
  {
    path: '/mon-armurerie',
    element: (
      <ProtectedRoute>
        <Armurerie />
      </ProtectedRoute>
    ),
  },
  {
    path: '/mon-armurerie/ajouter',
    element: (
      <ProtectedRoute>
        <AddGear />
      </ProtectedRoute>
    ),
  },
  {
    // Vue publique de l'Armurerie (SH-21b) : « publique » au sens profil consultable,
    // pas anonyme — session requise, et le backend réserve la donnée au rôle RECRUITER.
    path: '/freelances/:freelanceId/armurerie',
    element: (
      <ProtectedRoute>
        <FreelanceGear />
      </ProtectedRoute>
    ),
  },
  {
    // Recherche par matching (SH-22) — le backend réserve la donnée au rôle RECRUITER.
    path: '/recherche',
    element: (
      <ProtectedRoute>
        <Search />
      </ProtectedRoute>
    ),
  },
  {
    // Chat contextuel (SH-24) : liste des conversations, pour les DEUX rôles.
    path: '/messages',
    element: (
      <ProtectedRoute>
        <Messages />
      </ProtectedRoute>
    ),
  },
  {
    // Fil de discussion 1-à-1 — le backend impose la paire RECRUITER↔FREELANCE.
    path: '/messages/:userId',
    element: (
      <ProtectedRoute>
        <MessageThread />
      </ProtectedRoute>
    ),
  },
  { path: '*', element: <NotFound /> },
];
