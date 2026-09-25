/**
 * Échelle ABR du transcodage (SH-16b, décision EP04 D3 : HLS 360p / 720p / 1080p).
 *
 * Logique PURE, sans aucune I/O — c'est délibéré. Les règles qui comptent ici (pas de
 * sur-échantillonnage, respect du rapport d'aspect, dimensions paires) sont des règles
 * métier : les isoler des binaires permet de les tester sans fixture vidéo, donc de les
 * tester vraiment. Tout ce qui touche à `ffmpeg` vit dans `encode.ts`.
 */

/** Une piste de qualité à produire. `bandwidth` est en bits par seconde. */
export interface RenditionSpec {
  name: string;
  width: number;
  height: number;
  bandwidth: number;
}

/**
 * Paliers cibles, du plus léger au plus lourd.
 *
 * La HAUTEUR est le critère de sélection, pas la largeur : c'est elle qui nomme les
 * définitions par convention (« 720p »), et elle reste comparable entre un 16:9 et un
 * 4:3 — ce qu'une largeur ne permettrait pas.
 */
const RUNGS: readonly { name: string; height: number; bandwidth: number }[] = [
  { name: '360p', height: 360, bandwidth: 800_000 },
  { name: '720p', height: 720, bandwidth: 2_800_000 },
  { name: '1080p', height: 1080, bandwidth: 5_000_000 },
];

/** Débit de repli pour une source sous le premier palier, proportionné à sa surface. */
const FALLBACK_BITS_PER_PIXEL = 4;

/**
 * Arrondit à l'entier pair le plus proche, avec un plancher à 2.
 *
 * `libx264` REFUSE les dimensions impaires en `yuv420p` : sans cela, une source comme
 * 1001x563 ferait échouer ffmpeg — et l'échec tomberait après le téléchargement du
 * master, c'est-à-dire au pire moment.
 */
function toEvenDimension(value: number): number {
  const rounded = Math.round(value);
  return Math.max(2, rounded % 2 === 0 ? rounded : rounded - 1);
}

/**
 * Choisit les pistes à produire pour une source donnée.
 *
 * Deux règles, chacune couverte par son test :
 *  1. **jamais de sur-échantillonnage** — un palier plus haut que la source est écarté ;
 *  2. **au moins une piste** — une source minuscule est rendue à sa définition native,
 *     sans quoi `renditions` serait vide et le monolithe rejetterait tout le résultat.
 *
 * La largeur est DÉRIVÉE du rapport d'aspect de la source, jamais reprise du palier :
 * une source 4:3 ramenée à la largeur d'un palier 16:9 serait étirée.
 */
export function selectLadder(sourceWidth: number, sourceHeight: number): RenditionSpec[] {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    throw new Error(
      `Dimensions source invalides : ${sourceWidth}x${sourceHeight} — sondage ffprobe incohérent.`,
    );
  }

  const selected = RUNGS.filter((rung) => rung.height <= sourceHeight).map((rung) => ({
    name: rung.name,
    width: toEvenDimension((sourceWidth * rung.height) / sourceHeight),
    height: toEvenDimension(rung.height),
    bandwidth: rung.bandwidth,
  }));

  if (selected.length > 0) {
    return selected;
  }

  // Source sous le premier palier : une seule piste, à la définition native. Le débit
  // est déduit de la surface plutôt que figé, pour ne pas sur-encoder une vignette.
  const width = toEvenDimension(sourceWidth);
  const height = toEvenDimension(sourceHeight);
  return [
    {
      name: `${height}p`,
      width,
      height,
      bandwidth: Math.max(1, Math.round(width * height * FALLBACK_BITS_PER_PIXEL)),
    },
  ];
}
