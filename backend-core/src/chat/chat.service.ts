import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MESSAGE_MAX_LENGTH } from './message.schema';
import { User } from '../users/user.entity';
import { UserRole } from '../common/enums';

/** Identité minimale issue du token JWT — jamais d'un id fourni par le client (anti-usurpation, OWASP). */
export interface ChatParticipant {
  userId: string;
  role: UserRole;
}

/** Message normalisé renvoyé aux clients (REST et WS) — jamais le document Mongo brut. */
export interface ChatMessageView {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: Date;
}

/** Résumé d'une conversation pour la liste `/messages` (interlocuteur + dernier message). */
export interface ConversationSummary {
  conversationId: string;
  with: { id: string; username: string; role: UserRole };
  lastMessage: ChatMessageView;
}

// Historique : les 50 derniers messages (S5) — la pagination plus fine attendra un vrai besoin.
const HISTORY_LIMIT = 50;

/** Document Mongo brut (create/lean/aggregate) avant normalisation en ChatMessageView. */
type RawMessageDoc = Pick<Message, 'conversationId' | 'senderId' | 'body' | 'createdAt'> & {
  _id: unknown;
};

/**
 * Chat contextuel temps réel (SH-24) — cœur métier côté persistance.
 * Les identités viennent TOUJOURS du token (ChatParticipant) ; la cible est revalidée en
 * base à chaque opération : paire RECRUITER↔FREELANCE imposée, en écriture COMME en lecture.
 */
@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectModel(Message.name)
    private readonly messages: Model<Message>,
  ) {}

  /** Identifiant de conversation déterministe : les deux ids triés puis joints. */
  conversationIdFor(userIdA: string, userIdB: string): string {
    return [userIdA, userIdB].sort().join(':');
  }

  /** Persiste un message après validation stricte du contenu et de la paire de rôles (C2.2.3). */
  async sendMessage(
    sender: ChatParticipant,
    toUserId: string,
    body: string,
  ): Promise<ChatMessageView> {
    const trimmed = (body ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('Le message ne peut pas être vide');
    }
    if (trimmed.length > MESSAGE_MAX_LENGTH) {
      throw new BadRequestException(
        `Le message dépasse la longueur maximale de ${MESSAGE_MAX_LENGTH} caractères`,
      );
    }

    await this.assertRecruiterFreelancePair(sender, toUserId);

    const saved = await this.messages.create({
      conversationId: this.conversationIdFor(sender.userId, toUserId),
      senderId: sender.userId,
      body: trimmed,
    });
    return this.toView(saved);
  }

  /**
   * Historique du fil avec `otherUserId` (50 derniers, ordre chronologique).
   * Étanchéité (S3) : le fil est dérivé de l'id du LECTEUR (token) + celui de l'interlocuteur,
   * et la paire de rôles est revalidée — un tiers obtient 403, jamais le fil d'autrui.
   */
  async history(reader: ChatParticipant, otherUserId: string): Promise<ChatMessageView[]> {
    await this.assertRecruiterFreelancePair(reader, otherUserId);

    const conversationId = this.conversationIdFor(reader.userId, otherUserId);
    const docs = await this.messages
      .find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .lean();

    // La requête ramène les N plus récents (desc) ; l'affichage se fait en ordre chronologique.
    return docs.reverse().map((doc) => this.toView(doc));
  }

  /** Liste des conversations du lecteur : interlocuteur + dernier message, la plus récente d'abord (S5). */
  async conversations(reader: ChatParticipant): Promise<ConversationSummary[]> {
    // Le userId vient du token et est un UUID (aucun métacaractère regex possible) ;
    // il apparaît dans conversationId soit en tête (`id:`), soit en queue (`:id`).
    const rows = await this.messages.aggregate<{ _id: string; last: RawMessageDoc }>([
      { $match: { conversationId: { $regex: reader.userId } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$conversationId', last: { $first: '$$ROOT' } } },
      { $sort: { 'last.createdAt': -1 } },
    ]);

    const otherIds = rows
      .map((row) => this.otherParticipantId(row._id, reader.userId))
      .filter((id): id is string => Boolean(id));
    const others = otherIds.length
      ? await this.users.find({ where: { id: In(otherIds) } })
      : [];
    const byId = new Map(others.map((user) => [user.id, user]));

    return rows.flatMap((row) => {
      const otherId = this.otherParticipantId(row._id, reader.userId);
      const other = otherId ? byId.get(otherId) : undefined;
      // Interlocuteur introuvable (compte supprimé) : on n'expose pas de fil orphelin.
      if (!other) {
        return [];
      }
      return [
        {
          conversationId: row._id,
          with: { id: other.id, username: other.username, role: other.role },
          lastMessage: this.toView(row.last),
        },
      ];
    });
  }

  /** L'autre participant d'un `conversationId` (les deux ids triés joints par ':'). */
  private otherParticipantId(conversationId: string, selfId: string): string | undefined {
    return conversationId.split(':').find((id) => id !== selfId);
  }

  /**
   * La cible doit exister (sinon 404) et la paire être RECRUITER↔FREELANCE (sinon 403) :
   * pas de freelance→freelance, pas de recruteur→recruteur, pas de message à soi-même.
   */
  private async assertRecruiterFreelancePair(
    participant: ChatParticipant,
    otherUserId: string,
  ): Promise<User> {
    const other = await this.users.findOne({ where: { id: otherUserId } });
    if (!other) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const roles = new Set([participant.role, other.role]);
    const isRecruiterFreelancePair =
      roles.size === 2 && roles.has(UserRole.RECRUITER) && roles.has(UserRole.FREELANCE);
    if (!isRecruiterFreelancePair) {
      throw new ForbiddenException(
        'Une conversation relie toujours un recruteur et un freelance',
      );
    }
    return other;
  }

  /** Normalise un document Mongo en vue publique (id en chaîne, champs explicites uniquement). */
  private toView(doc: RawMessageDoc): ChatMessageView {
    return {
      id: String(doc._id),
      conversationId: doc.conversationId,
      senderId: doc.senderId,
      body: doc.body,
      createdAt: doc.createdAt,
    };
  }
}
