import { BadGatewayException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { SearchMatchDto } from './dto/search-match.dto';
import { MatchResultDto } from './dto/match-result.dto';

/** Réponse brute du matching-service (contrat Pydantic `MatchResult`). */
interface RawMatchResult {
  freelance_id: string;
  score: number;
  distance_km: number;
}

/**
 * Proxy vers le microservice de matching (SH-22).
 *
 * Le matching-service FastAPI est un service INTERNE (archi §2 : point d'entrée unique) :
 * ni auth ni CORS — le navigateur ne l'atteint jamais. Ce proxy porte le RBAC (contrôleur),
 * relaie la demande sur le réseau privé, et enrichit les ids retournés avec le username
 * (une seule requête `IN`, pas de N+1).
 */
@Injectable()
export class MatchingService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async search(dto: SearchMatchDto): Promise<MatchResultDto[]> {
    const baseUrl = process.env.MATCHING_SERVICE_URL ?? 'http://localhost:8000';

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/match`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          skills: dto.skills,
          // Contrat MatchRequest : location = (lat, lon) — le service inverse lui-même
          // pour ST_MakePoint(lon, lat)
          location: [dto.lat, dto.lon],
          radius_km: dto.radiusKm,
        }),
        // Le KPI du /match est < 250 ms : au-delà de 5 s, le service est considéré en panne
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new BadGatewayException('Le service de matching est momentanément indisponible');
    }

    if (!response.ok) {
      throw new BadGatewayException('Le service de matching est momentanément indisponible');
    }

    const raw = (await response.json()) as RawMatchResult[];
    if (raw.length === 0) {
      return [];
    }

    // Enrichissement username : le microservice ne connaît que les ids (minimisation).
    const users = await this.usersRepo.find({
      where: { id: In(raw.map((r) => r.freelance_id)) },
      select: { id: true, username: true },
    });
    const usernameById = new Map(users.map((u) => [u.id, u.username]));

    // L'ordre du microservice fait foi (score décroissant, puis distance croissante).
    return raw.map((r) => ({
      freelanceId: r.freelance_id,
      username: usernameById.get(r.freelance_id) ?? null,
      score: r.score,
      distanceKm: r.distance_km,
    }));
  }
}
