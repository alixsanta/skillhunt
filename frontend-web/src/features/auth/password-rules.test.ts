/// <reference types="node" />
// Les types Node sont scopés à ce fichier de test (via la triple-slash directive
// ci-dessus), comme dans gear-meta.test.ts : le code applicatif ne doit jamais
// dépendre des types Node (il tourne dans le navigateur).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PASSWORD_RULES, isPasswordValid } from './password-rules';

describe('PASSWORD_RULES (SH-51)', () => {
  it('valide un mot de passe conforme', () => {
    expect(isPasswordValid('PiloteDrone2026')).toBe(true);
  });

  it.each([
    ['Pilote2026', 'length'],
    ['pilotedrone2026', 'upper'],
    ['PILOTEDRONE2026', 'lower'],
    ['PiloteDroneAAAA', 'digit'],
  ])('refuse %s en signalant la règle %s', (mot, regleAttendue) => {
    expect(isPasswordValid(mot)).toBe(false);
    const echouees = PASSWORD_RULES.filter((regle) => !regle.test(mot)).map((r) => r.id);
    expect(echouees).toContain(regleAttendue);
  });

  // Verrou réel (C2.2.3) : on lit RegisterDto.password sur le disque, comme
  // gear-meta.test.ts le fait déjà pour la palette HUD, plutôt que de comparer
  // PASSWORD_RULES à un tableau écrit en dur dans ce même fichier — sinon un
  // changement du DTO backend (ex. 12 → 14 caractères) ne ferait échouer aucun
  // test front alors que le commentaire promet un miroir exact.
  describe('reste aligné sur RegisterDto.password (lecture du DTO backend)', () => {
    // process.cwd() vaut `frontend-web` quand la suite tourne (cf. gear-meta.test.ts) :
    // on remonte donc d'un niveau vers la racine du monorepo pour atteindre backend-core.
    const dtoPath = join(
      process.cwd(),
      '..',
      'backend-core',
      'src',
      'auth',
      'dto',
      'register.dto.ts',
    );
    const dtoSource = readFileSync(dtoPath, 'utf8');

    // Piège du fichier : il déclare aussi LoginDto, qui a SON PROPRE champ `password`
    // (volontairement permissif — @IsString/@IsNotEmpty seulement, cf. commentaire du
    // DTO). On isole donc d'abord le bloc de la classe RegisterDto — borné à la classe
    // suivante — avant d'y chercher `password`, pour ne jamais pouvoir matcher le champ
    // de LoginDto.
    const registerClassStart = dtoSource.indexOf('export class RegisterDto');
    expect(
      registerClassStart,
      'RegisterDto introuvable dans register.dto.ts — le DTO a-t-il été renommé ou déplacé ?',
    ).toBeGreaterThanOrEqual(0);
    const nextClassStart = dtoSource.indexOf('export class', registerClassStart + 1);
    const registerClassSource =
      nextClassStart >= 0
        ? dtoSource.slice(registerClassStart, nextClassStart)
        : dtoSource.slice(registerClassStart);

    // Toujours à l'intérieur du bloc RegisterDto : le fragment de décorateurs de
    // `password` est tout ce qui se trouve entre la fin du champ `username` et la
    // déclaration `password!: string;`. Comme `registerClassSource` s'arrête avant
    // LoginDto, ce fragment ne peut structurellement pas contenir le `password` de
    // LoginDto.
    const usernameFieldEnd = registerClassSource.indexOf('username!: string;');
    const passwordFieldDecl = registerClassSource.indexOf('password!: string;');
    expect(
      usernameFieldEnd,
      "champ `username` introuvable dans RegisterDto — l'extraction du bloc `password` ne peut pas se situer.",
    ).toBeGreaterThanOrEqual(0);
    expect(passwordFieldDecl, 'champ `password` introuvable dans RegisterDto.').toBeGreaterThan(
      usernameFieldEnd,
    );
    const passwordBlock = registerClassSource.slice(
      usernameFieldEnd + 'username!: string;'.length,
      passwordFieldDecl,
    );

    it('cible bien RegisterDto.password (et pas LoginDto.password)', () => {
      // LoginDto.password n'a ni @MinLength ni @Matches (il est volontairement
      // permissif) : leur présence ici prouve que le fragment extrait est bien celui
      // de RegisterDto, pas une extraction vide ou mal bornée.
      expect(passwordBlock).toContain('@MinLength');
      expect(passwordBlock).toContain('@Matches');
    });

    it('longueur minimale : @MinLength de RegisterDto.password === seuil de la règle "length"', () => {
      const minLengthMatch = passwordBlock.match(/@MinLength\((\d+)/);
      expect(
        minLengthMatch,
        'Aucun @MinLength(...) trouvé sur RegisterDto.password : la forme du DTO a changé, adapte ce test.',
      ).not.toBeNull();
      const backendMinLength = Number(minLengthMatch![1]);

      const lengthRule = PASSWORD_RULES.find((r) => r.id === 'length');
      expect(lengthRule, 'PASSWORD_RULES ne définit plus de règle "length".').toBeDefined();

      // Seuil FRONT dérivé du comportement réel de la règle (jamais recopié en dur ici) :
      // on sonde la plus petite longueur pour laquelle `test()` devient vrai.
      let frontThreshold = -1;
      for (let n = 0; n <= 128; n += 1) {
        if (lengthRule!.test('a'.repeat(n))) {
          frontThreshold = n;
          break;
        }
      }
      expect(
        frontThreshold,
        'Impossible de déterminer un seuil pour la règle "length" (sondé jusqu\'à 128 caractères).',
      ).toBeGreaterThanOrEqual(0);

      expect(
        frontThreshold,
        `La règle "length" a changé côté backend (RegisterDto.password exige désormais @MinLength(${backendMinLength})) : ` +
          `mets à jour la règle "length" de PASSWORD_RULES dans password-rules.ts pour refléter ${backendMinLength}.`,
      ).toBe(backendMinLength);
    });

    it('composition : les 3 @Matches(...) de RegisterDto.password correspondent à lower/upper/digit', () => {
      const literalRe = /@Matches\((\/(?:\\.|[^/\\\n])*\/[a-z]*)/g;
      const backendRegexes: RegExp[] = [];
      let m: RegExpExecArray | null;
      while ((m = literalRe.exec(passwordBlock)) !== null) {
        const literal = m[1];
        const lastSlash = literal.lastIndexOf('/');
        backendRegexes.push(new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1)));
      }

      expect(
        backendRegexes.length,
        `RegisterDto.password déclare ${backendRegexes.length} @Matches(...) au lieu de 3 : le nombre de contraintes ` +
          'a changé côté backend, adapte PASSWORD_RULES (et ce test) en conséquence.',
      ).toBe(3);

      // Sondes comportementales (pas de comparaison de source regex, qui casserait pour
      // rien si le backend réécrit une classe équivalente) : pour chaque règle, une
      // chaîne qui ne doit satisfaire QU'ELLE, et une qui ne doit satisfaire qu'elle non
      // plus mais côté négatif pour les deux autres.
      const positiveProbes = { lower: 'a', upper: 'A', digit: '5' } as const;
      const negativeProbes = { lower: 'AAAA0000', upper: 'aaaa0000', digit: 'aaaaAAAA' } as const;

      (Object.keys(positiveProbes) as Array<keyof typeof positiveProbes>).forEach((ruleId) => {
        const rule = PASSWORD_RULES.find((r) => r.id === ruleId);
        expect(rule, `PASSWORD_RULES ne définit plus de règle "${ruleId}".`).toBeDefined();

        // On identifie, parmi les 3 regex backend, celle qui porte la contrainte "ruleId"
        // via la sonde positive — sans supposer d'ordre entre les décorateurs.
        const positiveProbe = positiveProbes[ruleId];
        const owningRegex = backendRegexes.find((re) => re.test(positiveProbe));
        expect(
          owningRegex,
          `Aucune des 3 expressions @Matches(...) de RegisterDto.password n'accepte "${positiveProbe}" : la contrainte ` +
            `"${ruleId}" a peut-être changé côté backend. Mets à jour PASSWORD_RULES (règle "${ruleId}") en conséquence.`,
        ).toBeDefined();
        expect(
          rule!.test(positiveProbe),
          `PASSWORD_RULES (règle "${ruleId}") n'accepte pas "${positiveProbe}" alors que RegisterDto.password l'exige : ` +
            'vérifie password-rules.ts.',
        ).toBe(true);

        const negativeProbe = negativeProbes[ruleId];
        expect(
          owningRegex!.test(negativeProbe),
          `La règle backend "${ruleId}" (RegisterDto.password) accepte à tort "${negativeProbe}".`,
        ).toBe(false);
        expect(
          rule!.test(negativeProbe),
          `PASSWORD_RULES (règle "${ruleId}") accepte à tort "${negativeProbe}" alors que RegisterDto.password le refuserait : ` +
            'mets à jour PASSWORD_RULES en conséquence.',
        ).toBe(false);
      });
    });
  });
});
