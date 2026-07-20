import { Outlet } from 'react-router-dom';

/**
 * Coquille des écrans publics (SH-46) : accueil, connexion, inscription.
 * Volontairement sans navigation — l'utilisateur n'a pas encore de rôle.
 */
export default function PublicLayout() {
  return (
    <div className="bg-hud-bg flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
