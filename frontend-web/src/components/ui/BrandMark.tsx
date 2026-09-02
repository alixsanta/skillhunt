/**
 * Marque SkillHunt (SH-51) — engrenage denté, réticule à quatre équerres, curseur.
 *
 * Tracé UNIQUE de la marque : l'en-tête et la page d'accueil le consomment tous les deux,
 * là où ils recopiaient chacun l'icône `Crosshair` de Lucide. Purement décoratif
 * (`aria-hidden`) : le mot-symbole « SKILLHUNT » l'accompagne toujours en texte, et
 * l'annoncer deux fois alourdirait la lecture d'écran.
 *
 * Couleur : `currentColor` uniquement. Aucun hexadécimal — `gear-meta.test.ts` scanne ce
 * dossier et ferait échouer la CI.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Denture : douze dents réparties tous les 30°. Écrites une à une plutôt qu'en
          <use href="#id"> — un identifiant dupliqué casserait le rendu dès que deux
          BrandMark coexistent sur la même page. */}
      <g fill="currentColor">
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(30 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(60 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(90 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(120 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(150 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(180 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(210 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(240 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(270 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(300 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(330 32 32)" />
      </g>

      {/* Corps de l'engrenage : anneau épais, intérieur laissé transparent — la marque se
          pose ainsi sur n'importe quel fond. */}
      <circle cx="32" cy="32" r="21" stroke="currentColor" strokeWidth="6" />

      {/* Anneau fin intérieur */}
      <circle cx="32" cy="32" r="15.5" stroke="currentColor" strokeWidth="1.8" />

      {/* Réticule : quatre équerres de collimateur */}
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 26.5V23a1 1 0 0 1 1-1h3.5" />
        <path d="M37.5 22H41a1 1 0 0 1 1 1v3.5" />
        <path d="M42 37.5V41a1 1 0 0 1-1 1h-3.5" />
        <path d="M26.5 42H23a1 1 0 0 1-1-1v-3.5" />
      </g>

      {/* Cible */}
      <circle cx="32" cy="32" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="32" cy="32" r="2.6" fill="currentColor" />

      {/* Curseur, débordant sur le quart bas-droit. Le liseré reprend le fond de
          l'application pour détacher la flèche de la denture. */}
      <path
        d="M38.5 38.5 58 46.6l-8.7 2.4-2.4 8.7z"
        fill="currentColor"
        stroke="var(--color-hud-bg)"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
