import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MediaQueue } from './media.queue';
import { MediaService } from './media.service';

/** Raison enregistrée quand BullMQ n'en fournit aucune. */
const RAISON_PAR_DEFAUT = 'Échec du transcodage';

/** Raison UTILISATEUR d'un job interrompu (worker tué, hôte en veille, verrou expiré). */
const RAISON_INTERROMPU = 'Le traitement a été interrompu. Déposez de nouveau la vidéo.';

/**
 * Raisons d'échec produites par BullMQ LUI-MÊME, et non par le worker.
 *
 * Les messages du worker sont déjà des messages utilisateur (`TranscodeError`, côté
 * media-service). Mais quand un job est interrompu, c'est BullMQ qui écrit la raison,
 * en anglais et dans son vocabulaire interne — « job stalled more than allowable
 * limit », « Missing lock for job … ». Le portfolio affichant `errorReason` tel quel,
 * ces textes arrivaient sous les yeux de l'utilisateur (relevé en recette SH-16b).
 */
const RAISONS_INTERNES_BULLMQ = /stalled|missing lock|lock mismatch/i;

/** Traduit la raison d'échec reçue de la file en message affichable. */
export function raisonUtilisateur(failedReason: string | undefined): string {
  if (!failedReason) {
    return RAISON_PAR_DEFAUT;
  }
  return RAISONS_INTERNES_BULLMQ.test(failedReason) ? RAISON_INTERROMPU : failedReason;
}

/**
 * Écouteur `QueueEvents` (SH-16a, décision D7).
 *
 * C'est le monolithe — et lui seul — qui écrit dans PostgreSQL : `media-service` reste
 * un worker pur, sans accès à la base et sans API à authentifier. `jobId = mediaId`,
 * donc aucune table de correspondance n'est nécessaire.
 */
@Injectable()
export class MediaTranscodeListener implements OnModuleInit {
  private readonly logger = new Logger(MediaTranscodeListener.name);

  constructor(
    private readonly queue: MediaQueue,
    private readonly mediaService: MediaService,
  ) {}

  onModuleInit(): void {
    this.queue.events.on('completed', ({ jobId, returnvalue }) => {
      // `returnvalue` est typé `string` par les définitions BullMQ, mais la version
      // installée le décode déjà en objet AVANT d'émettre `completed`
      // (`queue-events.js:102`) : `applyTranscodeResult` accepte donc `unknown` et gère
      // les deux formes plutôt que de faire confiance à ce typage.
      void this.mediaService.applyTranscodeResult(jobId, returnvalue).catch((err: Error) => {
        // On ne relance pas : un résultat illisible ne deviendra pas lisible en réessayant.
        this.logger.error(`Résultat de transcodage inexploitable (${jobId}) : ${err.message}`);
      });
    });

    this.queue.events.on('failed', ({ jobId, failedReason }) => {
      void this.mediaService
        .markFailed(jobId, raisonUtilisateur(failedReason))
        .catch((err: Error) => {
          this.logger.error(`Impossible de marquer l'échec de ${jobId} : ${err.message}`);
        });
    });

    // Sans écouteur, une erreur de la connexion d'événements remonterait en exception
    // non captée — même défaut que celui relevé en revue de SH-15.
    this.queue.events.on('error', (err: Error) => {
      this.logger.error(`Flux d'événements BullMQ en erreur : ${err.message}`);
    });
  }
}
