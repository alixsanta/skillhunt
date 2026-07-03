# C2.2.2/C2.2.3 — Consumer Redis Streams : invalide le cache /match sur événements métier
import asyncio
import logging
from app.db.redis import get_redis

logger = logging.getLogger(__name__)

STREAM_KEY = "skillhunt:events"
GROUP = "matching"
CONSUMER = "matching-1"
_VERSION_KEY = "match:version"

# Types qui modifient un résultat de matching → invalident le cache
_INVALIDATING = {"gear.validated", "gear.rejected", "freelance.updated"}


async def process_event(fields: dict[str, str]) -> None:
    """Traite un événement : bump la version du cache si le type est pertinent."""
    event_type = fields.get("type")
    if event_type in _INVALIDATING:
        redis = get_redis()
        await redis.incr(_VERSION_KEY)
        logger.info("Cache /match invalidé (événement %s)", event_type)
    else:
        # Type inconnu ou champ manquant : ignoré (forward-compatible)
        logger.debug("Événement ignoré : %s", event_type)


async def ensure_group() -> None:
    """Crée le consumer group (idempotent : ignore l'erreur BUSYGROUP)."""
    redis = get_redis()
    try:
        await redis.xgroup_create(STREAM_KEY, GROUP, id="0", mkstream=True)
    except Exception as exc:
        if "BUSYGROUP" not in str(exc):
            raise


async def consume_loop(stop_event: asyncio.Event) -> None:
    """Boucle de consommation : XREADGROUP bloquant, ACK après traitement."""
    await ensure_group()
    redis = get_redis()
    while not stop_event.is_set():
        try:
            response = await redis.xreadgroup(
                GROUP, CONSUMER, {STREAM_KEY: ">"}, count=10, block=2000
            )
            if not response:
                await asyncio.sleep(0)  # Cède l'event loop quand aucun message (coopératif, C2.2.2)
                continue
            for _stream, messages in response:
                for message_id, fields in messages:
                    try:
                        await process_event(fields)
                        await redis.xack(STREAM_KEY, GROUP, message_id)
                    except Exception as exc:  # pas d'ACK → retraité (reste dans le PEL)
                        logger.error("Échec de traitement %s : %s", message_id, exc)
        except asyncio.CancelledError:
            break
        except Exception as exc:  # panne Redis : on log et on retente après pause
            logger.warning("Consumer Redis interrompu : %s", exc)
            await asyncio.sleep(1)
