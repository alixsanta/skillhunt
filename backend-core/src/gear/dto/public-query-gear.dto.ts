import { PickType } from '@nestjs/swagger';
import { QueryGearDto } from './query-gear.dto';

/**
 * Filtres de la vue publique de l'Armurerie (SH-39).
 *
 * `status` est VOLONTAIREMENT absent de ce DTO : le filtre `VALIDATED` est imposé par le
 * service, jamais dérivé d'une entrée client (C2.2.3). Combiné au ValidationPipe global
 * (`forbidNonWhitelisted`), toute tentative `?status=PENDING` est rejetée en 400 — jamais
 * un 200 contenant du matériel non validé. Ne PAS réutiliser `QueryGearDto` ici.
 */
export class PublicQueryGearDto extends PickType(QueryGearDto, [
  'category',
  'page',
  'limit',
] as const) {}
