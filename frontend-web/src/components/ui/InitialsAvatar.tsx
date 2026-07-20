import { getAvatarPalette, getInitials } from '@/lib/avatar';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-2xl',
} as const;

interface InitialsAvatarProps {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Avatar à initiales (SH-46). Décoratif : `aria-hidden` car le nom qu'il représente est
 * toujours affiché en texte à côté — l'annoncer deux fois alourdirait la lecture d'écran.
 */
export function InitialsAvatar({ name, size = 'md', className }: InitialsAvatarProps) {
  const palette = getAvatarPalette(name);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'border-hud-border inline-flex shrink-0 items-center justify-center rounded-full border font-bold',
        SIZES[size],
        palette.background,
        palette.foreground,
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
