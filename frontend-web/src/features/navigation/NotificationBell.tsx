import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUnreadMessages } from './useUnreadMessages';

/**
 * Cloche de notification (SH-46) — l'état est porté par le NOM ACCESSIBLE du lien,
 * pas seulement par la pastille colorée : un lecteur d'écran doit l'entendre (R6).
 */
export function NotificationBell() {
  const { hasUnread, markAllRead } = useUnreadMessages();

  return (
    <Link
      to="/messages"
      onClick={markAllRead}
      aria-label={
        hasUnread ? 'Messages, nouveaux messages non lus' : 'Messages, aucun nouveau message'
      }
      className="text-hud-muted hover:bg-hud-pill focus-visible:ring-ring relative rounded-md p-2 transition-colors hover:text-white focus-visible:ring-2 focus-visible:outline-none"
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {hasUnread && (
        <span className="bg-hud-positive border-hud-card absolute top-1 right-1 h-2.5 w-2.5 rounded-full border-2" />
      )}
    </Link>
  );
}
