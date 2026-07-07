import { Button } from '@/components/ui/button';

// Coquille applicative minimale (SH-19) : démontre que Tailwind + shadcn/ui sont branchés.
export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">SkillHunt</h1>
      <Button>Commencer</Button>
    </main>
  );
}
