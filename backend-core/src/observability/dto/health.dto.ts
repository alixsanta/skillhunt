import { ApiProperty } from '@nestjs/swagger';

/** Contrat de réponse de la sonde de vivacité (SH-29, C2.4.1). */
export class LivenessDto {
  @ApiProperty({ example: 'ok', description: 'État du processus' })
  status!: 'ok';

  @ApiProperty({ example: 'backend-core', description: 'Service interrogé' })
  service!: string;

  @ApiProperty({ example: 4211, description: 'Durée de fonctionnement du processus, en secondes' })
  uptimeSeconds!: number;
}

/** État individuel des dépendances sondées. */
export class ReadinessDependenciesDto {
  @ApiProperty({ example: 'up', enum: ['up', 'down'], description: 'PostgreSQL + PostGIS' })
  postgres!: 'up' | 'down';

  @ApiProperty({ example: 'up', enum: ['up', 'down'], description: 'Redis (cache, bus, tokens)' })
  redis!: 'up' | 'down';

  @ApiProperty({ example: 'up', enum: ['up', 'down'], description: 'MongoDB (chat)' })
  mongodb!: 'up' | 'down';
}

/** Contrat de réponse de la sonde de disponibilité (SH-29, C2.4.1). */
export class ReadinessDto {
  @ApiProperty({ example: 'ok', description: "État global : « ok » ou « degraded » en cas de 503" })
  status!: string;

  @ApiProperty({ example: 'backend-core', description: 'Service interrogé' })
  service!: string;

  @ApiProperty({ type: ReadinessDependenciesDto, description: 'État de chaque dépendance' })
  dependencies!: ReadinessDependenciesDto;
}
