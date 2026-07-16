import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadGatewayException } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { User } from '../users/user.entity';
import { SearchMatchDto } from './dto/search-match.dto';

/**
 * Proxy de matching (SH-22) : relaie la recherche vers le microservice FastAPI interne
 * et enrichit les résultats avec le username. Le fetch est mocké : le contrat HTTP réel
 * est vérifié de bout en bout en local (matching-service démarré), pas ici (C2.2.2).
 */
function q(overrides: Partial<SearchMatchDto> = {}): SearchMatchDto {
  return {
    skills: ['pilotage drone'],
    lat: 43.6045,
    lon: 1.4442,
    radiusKm: 50,
    ...overrides,
  } as SearchMatchDto;
}

const F1 = '3f1b2c9e-6d54-4a1b-9d0e-7c2f5a8b1234';
const F2 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('🎯 MatchingService — proxy vers le matching-service (SH-22)', () => {
  let service: MatchingService;
  let fetchMock: jest.SpyInstance;
  let usersFind: jest.Mock;

  beforeEach(async () => {
    usersFind = jest.fn().mockResolvedValue([
      { id: F1, username: 'pilote-pro' },
      { id: F2, username: 'drone-master' },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        { provide: getRepositoryToken(User), useValue: { find: usersFind } },
      ],
    }).compile();

    service = module.get<MatchingService>(MatchingService);
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  function matchingServiceReplies(body: unknown, status = 200) {
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response);
  }

  it('relaie la demande au format du contrat FastAPI : skills, location [lat, lon], radius_km', async () => {
    matchingServiceReplies([]);

    await service.search(q({ skills: ['thermographie'], lat: 48.8566, lon: 2.3522, radiusKm: 30 }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8000/match');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      skills: ['thermographie'],
      location: [48.8566, 2.3522],
      radius_km: 30,
    });
  });

  it('mappe snake_case→camelCase et enrichit chaque résultat avec le username', async () => {
    matchingServiceReplies([
      { freelance_id: F1, score: 0.92, distance_km: 12.5 },
      { freelance_id: F2, score: 0.71, distance_km: 3.2 },
    ]);

    const results = await service.search(q());

    expect(results).toEqual([
      { freelanceId: F1, username: 'pilote-pro', score: 0.92, distanceKm: 12.5 },
      { freelanceId: F2, username: 'drone-master', score: 0.71, distanceKm: 3.2 },
    ]);
    // Enrichissement en UNE requête (pas de N+1)
    expect(usersFind).toHaveBeenCalledTimes(1);
  });

  it('tolère un freelance supprimé entre-temps : username null, résultat conservé', async () => {
    usersFind.mockResolvedValue([{ id: F1, username: 'pilote-pro' }]);
    matchingServiceReplies([
      { freelance_id: F1, score: 0.9, distance_km: 1 },
      { freelance_id: F2, score: 0.8, distance_km: 2 },
    ]);

    const results = await service.search(q());

    expect(results[1]).toEqual({ freelanceId: F2, username: null, score: 0.8, distanceKm: 2 });
  });

  it('renvoie une liste vide sans interroger le repo users', async () => {
    matchingServiceReplies([]);

    const results = await service.search(q());

    expect(results).toEqual([]);
    expect(usersFind).not.toHaveBeenCalled();
  });

  it('traduit une erreur du microservice en 502 (BadGateway), message en français', async () => {
    matchingServiceReplies({ detail: 'boom' }, 500);

    await expect(service.search(q())).rejects.toThrow(BadGatewayException);
  });

  it('traduit une panne réseau (service éteint) en 502', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(service.search(q())).rejects.toThrow(BadGatewayException);
  });
});
