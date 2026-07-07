import { Button } from '@/components/ui/button';

// Page d'accueil placeholder (SH-19) — aucun écran métier à ce stade.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">SkillHunt</h1>
      <p className="text-muted-foreground">Plateforme de recrutement technique de niche</p>
      <Button>Commencer</Button>
    </main>
  );
}
