import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { ChatParticipant, ChatMessageView, ChatService } from './chat.service';
import { resolveCorsOrigins } from '../common/cors';
import { UserRole } from '../common/enums';

/** Accusé renvoyé à l'émetteur d'un `message:send` (jamais d'exception brute côté WS). */
type SendAck = { ok: true; message: ChatMessageView } | { ok: false; error: string };

/**
 * Passerelle WebSocket du chat (SH-24) — socket.io.
 *
 * Sécurité (C2.2.3) :
 * - le jeton JWT arrive dans `handshake.auth` (JAMAIS en query string : les URLs se loguent) ;
 * - seul un token de type `access` ouvre la connexion (un refresh ou un twofa_pending est refusé) ;
 * - chaque socket rejoint UNIQUEMENT sa room personnelle `user:{id}` : les émissions ciblent
 *   des utilisateurs, pas des conversations — pas de room "devinable" à rejoindre.
 * - CORS aligné sur l'API HTTP (`resolveCorsOrigins`, joker refusé).
 */
@WebSocketGateway({
  cors: { origin: resolveCorsOrigins(process.env.CORS_ORIGIN), credentials: true },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly chatService: ChatService,
  ) {}

  /** Authentification au handshake (S2) : sans access token valide, la connexion est coupée. */
  handleConnection(client: Socket): void {
    const { token } = client.handshake.auth as { token?: string };
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwt.verify<{ userId: string; role: UserRole; type?: string }>(token);
      if (payload.type !== 'access') {
        client.disconnect(true);
        return;
      }

      const user: ChatParticipant = { userId: payload.userId, role: payload.role };
      client.data.user = user;
      client.join(`user:${user.userId}`);
    } catch {
      client.disconnect(true);
    }
  }

  /**
   * Envoi d'un message (S1) : persistance via ChatService PUIS émission `message:new`
   * aux deux parties (destinataire + émetteur en accusé multi-onglets). Toute erreur
   * métier revient à l'émetteur dans l'accusé — la gateway ne crashe jamais (S4).
   */
  @SubscribeMessage('message:send')
  async onSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { toUserId: string; body: string },
  ): Promise<SendAck> {
    const user = (client.data as { user?: ChatParticipant }).user;
    if (!user) {
      return { ok: false, error: 'Non authentifié' };
    }

    try {
      const message = await this.chatService.sendMessage(user, payload.toUserId, payload.body);
      this.server
        .to(`user:${user.userId}`)
        .to(`user:${payload.toUserId}`)
        .emit('message:new', message);
      return { ok: true, message };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Erreur inattendue',
      };
    }
  }
}
