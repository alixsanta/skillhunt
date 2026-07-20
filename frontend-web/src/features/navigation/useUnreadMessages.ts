import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getChatSocket } from '@/features/chat/socket';

/**
 * Signal de message non lu (SH-46).
 *
 * Le backend n'expose AUCUN compteur de non-lus : la pastille ne reflète donc que les
 * messages reçus pendant la session courante. Un rechargement de page la remet à zéro —
 * limite assumée plutôt qu'un compteur inventé (spec §3.4).
 */
export function useUnreadMessages(): { hasUnread: boolean; markAllRead: () => void } {
  const [hasUnread, setHasUnread] = useState(false);
  const { pathname } = useLocation();

  // Entrer dans la messagerie vaut lecture. Ajusté PENDANT le rendu (pas dans un
  // useEffect séparé) via le pattern React officiel « adjusting state when a prop
  // changes » : un `setState` synchrone dans un effet déclenche un rendu en cascade
  // évitable (règle `react-hooks/set-state-in-effect`) — ici React rejoue le rendu
  // avant peinture, sans passer par un effet.
  const [readPathname, setReadPathname] = useState(pathname);
  if (pathname !== readPathname) {
    setReadPathname(pathname);
    if (pathname.startsWith('/messages')) setHasUnread(false);
  }

  useEffect(() => {
    const socket = getChatSocket();
    // Un message reçu alors qu'on lit déjà les messages n'est pas « non lu ».
    const onMessage = () => {
      if (!pathname.startsWith('/messages')) setHasUnread(true);
    };
    socket.on('message:new', onMessage);
    return () => {
      socket.off('message:new', onMessage);
    };
  }, [pathname]);

  const markAllRead = useCallback(() => setHasUnread(false), []);

  return { hasUnread, markAllRead };
}
