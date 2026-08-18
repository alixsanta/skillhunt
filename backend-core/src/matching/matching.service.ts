import { BadGatewayException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { SearchMatchDto } from './dto/search-match.dto';
import { MatchResultDto } from './dto/match-result.dto';
import { REQUEST_ID_HEADER } from '../observability/request-id.middleware';

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

  /**
   * @param requestId identifiant de corrélation relayé au microservice (SH-29). C'est lui
   * qui permet, depuis une seule requête LogQL, de reconstituer le trajet complet d'une
   * recherche à travers le monolithe ET le matching-service — condition pour qu'une
   * anomalie de matching soit reproductible, donc consignable (C4.2.1).
   */
  async search(dto: SearchMatchDto, requestId?: string): Promise<MatchResultDto[]> {
    const baseUrl = process.env.MATCHING_SERVICE_URL ?? 'http://localhost:8000';

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/match`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(requestId ? { [REQUEST_ID_HEADER]: requestId } : {}),
        },
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

    // Enrichissement username + position (SH-23) : le microservice ne connaît que les ids.
    const users = await this.usersRepo.find({
      where: { id: In(raw.map((r) => r.freelance_id)) },
      select: { id: true, username: true, location: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    // L'ordre du microservice fait foi (score décroissant, puis distance croissante).
    return raw.map((r) => {
      const user = userById.get(r.freelance_id);
      // GeoJSON Point = [longitude, latitude] — on ressort des champs EXPLICITES (SH-34)
      const coordinates = user?.location?.coordinates;
      return {
        freelanceId: r.freelance_id,
        username: user?.username ?? null,
        score: r.score,
        distanceKm: r.distance_km,
        latitude: coordinates?.[1] ?? null,
        longitude: coordinates?.[0] ?? null,
      };
    });
  }
}
