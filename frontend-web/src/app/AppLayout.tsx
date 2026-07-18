import { Outlet } from 'react-router-dom';

/**
 * Coquille des écrans authentifiés (SH-46) : bannière commune + zone de contenu.
 * Le header est rempli en Task 6 ; ici on fige la structure et les repères ARIA.
 */
export default function AppLayout() {
  return (
    <div className="bg-hud-bg flex min-h-screen flex-col">
      <header role="banner" className="border-hud-border bg-hud-card sticky top-0 z-40 border-b" />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
