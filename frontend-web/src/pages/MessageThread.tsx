import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useChatThread } from '@/features/chat/useChatThread';
import { MESSAGE_MAX_LENGTH } from '@/features/chat/types';

/**
 * Fil de discussion temps réel (SH-24) : historique REST + messages live WebSocket + envoi.
 * L'émetteur de chaque message est LIBELLÉ (« Moi » / « Interlocuteur ») en plus de
 * l'alignement visuel : l'information ne repose jamais sur la seule mise en forme (R6).
 */
export default function MessageThread() {
  const { userId } = useParams<{ userId: string }>();
  const { me, messages, send, isPending, isError, refetch } = useChatThread(userId ?? '');

  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      return;
    }

    const result = await send(body);
    if (result.ok) {
      // Le message s'affichera via l'écho `message:new` du serveur (source de vérité unique)
      setDraft('');
      setSendError(null);
    } else {
      // Erreur métier (validation, paire de rôles…) : on la montre, la saisie est conservée
      setSendError(result.error);
    }
  }

  return (
    <div className="flex flex-1 flex-col p-4 lg:p-8">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-widest text-white uppercase">Conversation</h1>
          <Button asChild variant="outline">
            <Link to="/messages">Toutes mes conversations</Link>
          </Button>
        </header>

        {isPending && (
          <p role="status" className="text-hud-muted">
            Chargement du fil…
          </p>
        )}

        {isError && (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-hud-rejected">
              Impossible de charger ce fil de discussion.
            </p>
            <Button onClick={() => void refetch()}>Réessayer</Button>
          </div>
        )}

        {!isPending && !isError && (
          <>
            {/* role="log" : les nouveaux messages sont annoncés sans voler le focus (a11y) */}
            <div
              role="log"
              aria-label="Fil de discussion"
              className="border-hud-border bg-hud-card flex-1 rounded-lg border p-4"
            >
              {messages.length === 0 ? (
                <p className="text-hud-muted text-center text-sm">
                  Aucun message pour le moment — écrivez le premier.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {messages.map((message) => {
                    const isMine = message.senderId === me?.userId;
                    return (
                      <li
                        key={message.id}
                        className={`flex max-w-[85%] flex-col gap-0.5 rounded-lg border p-3 ${
                          isMine
                            ? 'border-hud-border self-end bg-white/10'
                            : 'border-hud-border bg-hud-bg self-start'
                        }`}
                      >
                        <span className="text-hud-muted text-xs tracking-widest uppercase">
                          {isMine ? 'Moi' : 'Interlocuteur'}
                        </span>
                        <span className="break-words whitespace-pre-wrap text-white">
                          {message.body}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {sendError && (
              <p role="alert" className="text-hud-rejected text-sm">
                {sendError}
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                aria-label="Message"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={MESSAGE_MAX_LENGTH}
                rows={2}
                placeholder="Votre message…"
                className="border-hud-border bg-hud-card focus-visible:ring-ring flex-1 resize-none rounded-lg border p-3 text-white outline-none focus-visible:ring-2"
              />
              <Button type="submit">Envoyer</Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
