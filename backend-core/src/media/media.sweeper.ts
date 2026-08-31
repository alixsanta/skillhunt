import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Media } from './media.entity';
import { MediaStatus } from '../common/enums';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { MediaService } from './media.service';

/**
 * Balayage des déclarations abandonnées (SH-16a, design EP04 §9.2).
 *
 * Une URL PUT est délivrée puis, parfois, jamais suivie d'un dépôt confirmé : onglet
 * fermé, réseau coupé, upload interrompu. La ligne `DRAFT` resterait à consommer le
 * quota du freelance, et l'objet à moitié déposé à occuper le stockage.
 */
@Injectable()
export class MediaSweeper {
  private readonly logger = new Logger(MediaSweeper.name);

  constructor(
    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
    private readonly mediaService: MediaService,
  ) {}

  /** Toutes les heures : le seuil se compte en heures, inutile de balayer plus souvent. */
  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    const purged = await this.purgeStaleDrafts();
    if (purged > 0) {
      this.logger.log(`${purged} déclaration(s) de média abandonnée(s) purgée(s)`);
    }
  }

  async purgeStaleDrafts(): Promise<number> {
    const threshold = new Date(Date.now() - this.draftTtlHours * 3600 * 1000);

    const stale = await this.mediaRepo.find({
      where: { status: MediaStatus.DRAFT, createdAt: LessThan(threshold) },
    });
    if (stale.length === 0) {
      return 0;
    }

    for (const media of stale) {
      // Objets d'abord : si la suppression de ligne échouait après, le balayage suivant
      // rattraperait la ligne — l'inverse laisserait un objet sans référence.
      await this.storage.deletePrefix(this.mediaService.buildMediaPrefix(media.freelanceId, media.id));
    }
    await this.mediaRepo.remove(stale);

    return stale.length;
  }

  private get draftTtlHours(): number {
    return Number(process.env.MEDIA_DRAFT_TTL_HOURS ?? 24);
  }
}
