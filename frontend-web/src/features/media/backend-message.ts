import { isAxiosError } from 'axios';

/**
 * Message utilisateur fourni par le backend, pour les statuts où il est fiable.
 *
 * Les exceptions métier de NestJS (quota atteint, transcodage en cours, validation) portent
 * un message déjà rédigé en français pour l'utilisateur : mieux vaut l'afficher tel quel
 * qu'un générique « réessaie », qui est parfois le pire conseil possible. Les autres
 * réponses (5xx inattendus, panne réseau) n'ont pas de message fiable : l'appelant fournit
 * alors son propre texte.
 *
 * @param statuses statuts HTTP dont le message est jugé affichable par l'appelant.
 */
export function backendMessage(error: unknown, statuses: readonly number[]): string | null {
  if (!isAxiosError<{ message?: string | string[] }>(error)) return null;
  const status = error.response?.status;
  if (status === undefined || !statuses.includes(status)) return null;
  const message = error.response?.data?.message;
  if (!message) return null;
  // Le ValidationPipe rend un TABLEAU de messages, les exceptions métier une chaîne.
  return [message].flat().join(' ');
}
