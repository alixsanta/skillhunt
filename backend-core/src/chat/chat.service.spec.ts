import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ChatService } from './chat.service';
import { Message } from './message.schema';
import { User } from '../users/user.entity';
import { UserRole } from '../common/enums';

/** Faux repository User (PostgreSQL) — la paire de rôles se vérifie côté SQL. */
class FakeUserRepository {
  private store: User[] = [];

  seed(role: UserRole): User {
    const user = {
      id: randomUUID(),
      email: `${randomUUID()}@x.io`,
      username: `user-${role.toLowerCase()}`,
      passwordHash: 'h',
      role,
    } as User;
    this.store.push(user);
    return user;
  }

  findOne({ where }: { where: Partial<User> }): Promise<User | null> {
    const keys = Object.keys(where) as (keyof User)[];
    return Promise.resolve(this.store.find((u) => keys.every((k) => u[k] === where[k])) ?? null);
  }

  find({ where }: { where: { id: { _value?: unknown } | unknown } }): Promise<User[]> {
    // Supporte l'opérateur In() de TypeORM (utilisé pour enrichir la liste des conversations)
    const ids = (where.id as { _value: string[] })._value ?? [];
    return Promise.resolve(this.store.filter((u) => ids.includes(u.id)));
  }
}

/** Faux modèle Mongoose : create + find (chaîné) + aggregate, en mémoire. */
function makeMessageModelMock() {
  const stored: Array<Record<string, unknown>> = [];
  return {
    stored,
    create: jest.fn().mockImplementation((doc: Record<string, unknown>) => {
      const saved = { _id: randomUUID(), createdAt: new Date(), ...doc };
      stored.push(saved);
      return Promise.resolve(saved);
    }),
    find: jest.fn().mockImplementation((filter: { conversationId: string }) => ({
      sort: () => ({
        limit: () => ({
          lean: () =>
            Promise.resolve(
              stored
                .filter((m) => m.conversationId === filter.conversationId)
                .slice()
                .reverse(),
            ),
        }),
      }),
    })),
    aggregate: jest.fn().mockResolvedValue([]),
  };
}

describe('💬 ChatService (SH-24)', () => {
  let service: ChatService;
  let users: FakeUserRepository;
  let messageModel: ReturnType<typeof makeMessageModelMock>;
  let recruiter: User;
  let freelance: User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(User), useClass: FakeUserRepository },
        { provide: getModelToken(Message.name), useFactory: makeMessageModelMock },
      ],
    }).compile();

    service = module.get(ChatService);
    users = module.get(getRepositoryToken(User));
    messageModel = module.get(getModelToken(Message.name));
    recruiter = users.seed(UserRole.RECRUITER);
    freelance = users.seed(UserRole.FREELANCE);
  });

  const asSender = (user: User) => ({ userId: user.id, role: user.role });

  it("l'identifiant de conversation est DÉTERMINISTE quel que soit le sens", () => {
    expect(service.conversationIdFor(recruiter.id, freelance.id)).toBe(
      service.conversationIdFor(freelance.id, recruiter.id),
    );
  });

  it('persiste un message valide et le renvoie normalisé', async () => {
    const message = await service.sendMessage(asSender(recruiter), freelance.id, '  Bonjour !  ');

    expect(message.body).toBe('Bonjour !'); // trim : pas d'espaces parasites persistés
    expect(message.senderId).toBe(recruiter.id);
    expect(message.conversationId).toBe(service.conversationIdFor(recruiter.id, freelance.id));
    expect(messageModel.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['vide', ''],
    ['blanc', '   '],
    ['trop long', 'x'.repeat(2001)],
  ])('refuse (400) un message %s — jamais persisté (C2.2.3)', async (_label, body) => {
    await expect(service.sendMessage(asSender(recruiter), freelance.id, body)).rejects.toThrow(
      BadRequestException,
    );
    expect(messageModel.create).not.toHaveBeenCalled();
  });

  it('impose la paire RECRUITER↔FREELANCE : freelance→freelance refusé (403)', async () => {
    const otherFreelance = users.seed(UserRole.FREELANCE);
    await expect(
      service.sendMessage(asSender(freelance), otherFreelance.id, 'salut'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('cible inexistante => 404 (pas de conversation fantôme)', async () => {
    await expect(
      service.sendMessage(asSender(recruiter), randomUUID(), 'bonjour'),
    ).rejects.toThrow(NotFoundException);
  });

  it("l'historique est réservé aux participants : la paire est revalidée à la lecture", async () => {
    await service.sendMessage(asSender(recruiter), freelance.id, 'premier');
    await service.sendMessage(asSender(freelance), recruiter.id, 'deuxième');

    const history = await service.history(asSender(recruiter), freelance.id);

    expect(history.map((m) => m.body)).toEqual(['premier', 'deuxième']);

    // Un AUTRE freelance ne peut pas lire cette conversation (étanchéité par construction :
    // la conversation est dérivée de SON id + celui du recruteur => fil différent ET la
    // paire de rôles est revalidée).
    const intruder = users.seed(UserRole.FREELANCE);
    await expect(service.history(asSender(intruder), freelance.id)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
