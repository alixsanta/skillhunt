import { type RouteObject } from 'react-router-dom';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Account from '@/pages/Account';
import Armurerie from '@/pages/Armurerie';
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
  { path: '*', element: <NotFound /> },
];
