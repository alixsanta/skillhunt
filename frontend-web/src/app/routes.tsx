import { type RouteObject } from 'react-router-dom';
import Home from '@/pages/Home';
import NotFound from '@/pages/NotFound';

// Table de routes (SH-19). Les routes métier (auth, armurerie…) s'ajouteront ici.
// Module sans effet de bord : les tests l'importent sans construire de router
// browser-history (SH-38).
export const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '*', element: <NotFound /> },
];
