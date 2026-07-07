import { RouterProvider } from 'react-router-dom';
import { router } from './router';

// Coquille applicative (SH-19) : monte le routeur applicatif.
export default function App() {
  return <RouterProvider router={router} />;
}
