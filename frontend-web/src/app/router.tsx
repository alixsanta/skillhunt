import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import Home from '@/pages/Home';
import NotFound from '@/pages/NotFound';

// Table de routes (SH-19). Les routes métier (auth, armurerie…) s'ajouteront ici.
export const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '*', element: <NotFound /> },
];

export const router = createBrowserRouter(routes);
