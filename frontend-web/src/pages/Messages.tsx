import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useConversations } from '@/features/chat/useConversations';

/**
 * Liste des conversations (SH-24, S5) — indispensable côté freelance : c'est ici qu'il
 * retrouve les recruteurs qui l'ont contacté. Chaque entrée mène au fil `/messages/:userId`.
 */
export default function Messages() {
  const { data, isPending, isError, refetch } = useConversations();

  const conversations = data ?? [];

  return (
    <main className="bg-hud-bg min-h-screen p-4 lg:p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold tracking-widest text-white uppercase">Messages</h1>
        </header>

        {isPending && (
          <p role="status" className="text-hud-muted">
            Chargement des conversations…
          </p>
        )}

        {isError && (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-hud-rejected">
              Impossible de charger vos conversations.
            </p>
            <Button onClick={() => void refetch()}>Réessayer</Button>
          </div>
        )}

        {!isPending && !isError && conversations.length === 0 && (
          <p className="text-hud-muted border-hud-border bg-hud-card rounded-lg border border-dashed p-10 text-center">
            Aucune conversation pour le moment. Elles apparaîtront ici dès le premier échange.
          </p>
        )}

        {!isPending && !isError && conversations.length > 0 && (
          <ul className="flex flex-col gap-2">
            {conversations.map((conversation) => (
              <li key={conversation.conversationId}>
                <Link
                  to={`/messages/${conversation.with.id}`}
                  className="border-hud-border bg-hud-card hover:border-hud-muted flex flex-col gap-1 rounded-lg border p-4 transition-colors"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-white">{conversation.with.username}</span>
                    <span className="text-hud-muted text-xs tracking-widest uppercase">
                      {conversation.with.role === 'FREELANCE' ? 'Freelance' : 'Recruteur'}
                    </span>
                  </span>
                  <span className="text-hud-muted truncate text-sm">
                    {conversation.lastMessage.body}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
