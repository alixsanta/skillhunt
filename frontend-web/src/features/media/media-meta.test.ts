import { MEDIA_STATUSES, STATUS_META, formatDuration } from './media-meta';

describe('media-meta', () => {
  it('couvre les cinq statuts du cycle de vie', () => {
    expect(MEDIA_STATUSES).toHaveLength(5);
    expect(MEDIA_STATUSES).toEqual(
      expect.arrayContaining(['DRAFT', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED']),
    );
  });

  it('donne à chaque statut un libellé TEXTE — la couleur seule ne suffit jamais', () => {
    for (const status of MEDIA_STATUSES) {
      expect(STATUS_META[status].label.trim()).not.toBe('');
      expect(STATUS_META[status].hint.trim()).not.toBe('');
    }
  });

  it('formate une durée en minutes et secondes', () => {
    expect(formatDuration(134)).toBe('2:14');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('rend un tiret quand la durée est inconnue', () => {
    // Tant que SH-16b n'a pas sondé le média, `durationSeconds` est null.
    expect(formatDuration(null)).toBe('—');
  });
});
