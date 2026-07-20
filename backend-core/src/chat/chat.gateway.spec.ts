import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

function makeSocket(token?: string): Socket & { joined: string[]; disconnected: boolean } {
  const socket = {
    handshake: { auth: token === undefined ? {} : { token } },
    data: {},
    joined: [] as string[],
    disconnected: false,
    join: jest.fn().mockImplementation(function (this: { joined: string[] }, room: string) {
      socket.joined.push(room);
    }),
    disconnect: jest.fn().mockImplementation(() => {
      socket.disconnected = true;
    }),
  };
  return socket as unknown as Socket & { joined: string[]; disconnected: boolean };
}

describe('💬 ChatGateway — WebSocket authentifié (SH-24)', () => {
  let gateway: ChatGateway;
  let jwtVerify: jest.Mock;
  let sendMessage: jest.Mock;
  let emit: jest.Mock;

  beforeEach(async () => {
    jwtVerify = jest.fn();
    sendMessage = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: JwtService, useValue: { verify: jwtVerify } },
        { provide: ChatService, useValue: { sendMessage } },
      ],
    }).compile();

    gateway = module.get(ChatGateway);
    // Serveur socket.io factice : on capture les émissions par room
    emit = jest.fn();
    const to = jest.fn().mockReturnValue({ to: jest.fn().mockReturnValue({ emit }), emit });
    (gateway as unknown as { server: unknown }).server = { to };
  });

  it('refuse la connexion sans jeton (S2)', () => {
    const socket = makeSocket();
    gateway.handleConnection(socket);
    expect(socket.disconnected).toBe(true);
    expect(socket.joined).toHaveLength(0);
  });

  it('refuse un jeton qui n\'est pas de type access (refresh, twofa_pending…)', () => {
    jwtVerify.mockReturnValue({ userId: 'u-1', role: 'RECRUITER', type: 'refresh' });
    const socket = makeSocket('un-refresh-token');
    gateway.handleConnection(socket);
    expect(socket.disconnected).toBe(true);
  });

  it('accepte un access token valide et rejoint la room personnelle', () => {
    jwtVerify.mockReturnValue({ userId: 'u-1', role: 'RECRUITER', type: 'access' });
    const socket = makeSocket('bon-token');
    gateway.handleConnection(socket);

    expect(socket.disconnected).toBe(false);
    expect(socket.joined).toEqual(['user:u-1']);
    expect((socket.data as { user: { userId: string } }).user.userId).toBe('u-1');
  });

  it('message:send : persiste via ChatService puis pousse aux DEUX parties (S1)', async () => {
    jwtVerify.mockReturnValue({ userId: 'u-recruteur', role: 'RECRUITER', type: 'access' });
    const socket = makeSocket('bon-token');
    gateway.handleConnection(socket);

    const saved = { id: 'm-1', body: 'Bonjour', senderId: 'u-recruteur' };
    sendMessage.mockResolvedValue(saved);

    const ack = await gateway.onSendMessage(socket, { toUserId: 'u-freelance', body: 'Bonjour' });

    expect(sendMessage).toHaveBeenCalledWith(
      { userId: 'u-recruteur', role: 'RECRUITER' },
      'u-freelance',
      'Bonjour',
    );
    expect(emit).toHaveBeenCalledWith('message:new', saved);
    expect(ack).toEqual({ ok: true, message: saved });
  });

  it("message:send : une erreur métier revient à l'émetteur SANS crasher la gateway (S4)", async () => {
    jwtVerify.mockReturnValue({ userId: 'u-recruteur', role: 'RECRUITER', type: 'access' });
    const socket = makeSocket('bon-token');
    gateway.handleConnection(socket);
    sendMessage.mockRejectedValue(new Error('Le message ne peut pas être vide'));

    const ack = await gateway.onSendMessage(socket, { toUserId: 'u-freelance', body: '' });

    expect(ack).toEqual({ ok: false, error: 'Le message ne peut pas être vide' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('message:send sans connexion authentifiée : refus silencieux', async () => {
    const socket = makeSocket(); // jamais passé par handleConnection avec succès
    const ack = await gateway.onSendMessage(socket, { toUserId: 'x', body: 'y' });
    expect(ack).toEqual({ ok: false, error: 'Non authentifié' });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
