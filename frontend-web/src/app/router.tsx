import { createBrowserRouter } from 'react-router-dom';
import { routes } from './routes';

// Router applicatif (browser history) — seul effet de bord assumé, monté par App (SH-38).
export const router = createBrowserRouter(routes);
