import { Outlet } from 'react-router-dom';
import { AppHeader } from '@/features/navigation/AppHeader';

/** Coquille des écrans authentifiés (SH-46) : bannière commune + zone de contenu. */
export default function AppLayout() {
  return (
    <div className="bg-hud-bg flex min-h-screen flex-col">
      <header role="banner" className="border-hud-border bg-hud-card sticky top-0 z-40 border-b">
        <AppHeader />
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
