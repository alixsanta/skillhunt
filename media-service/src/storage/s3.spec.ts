import { contentTypeFor } from './s3';

// C2.2.3 — Le type MIME n'est pas cosmétique : S3 le renvoie tel quel au navigateur.
describe('contentTypeFor (SH-16b)', () => {
  it('type les playlists HLS', () => {
    // hls.js s'appuie sur ce type : un mauvais type et le lecteur refuse le manifeste.
    expect(contentTypeFor('720p.m3u8')).toBe('application/vnd.apple.mpegurl');
  });

  it('type les segments de transport', () => {
    expect(contentTypeFor('seg-00001.ts')).toBe('video/mp2t');
  });

  it('type le poster', () => {
    expect(contentTypeFor('poster.jpg')).toBe('image/jpeg');
  });

  it('ignore la casse de l\'extension', () => {
    expect(contentTypeFor('POSTER.JPG')).toBe('image/jpeg');
  });

  it('accepte un chemin complet et pas seulement un nom de fichier', () => {
    // `uploadFile` lui passe un chemin local, pas un basename.
    expect(contentTypeFor('/tmp/media/m-1/out/360p/seg-00002.ts')).toBe('video/mp2t');
  });

  it('retombe sur un type binaire neutre pour une extension inconnue', () => {
    // JAMAIS de type deviné : un `text/html` inventé sur un fichier inconnu serait
    // servi comme tel par S3, ce qui ouvrirait un vecteur de XSS stocké.
    expect(contentTypeFor('bizarre.xyz')).toBe('application/octet-stream');
    expect(contentTypeFor('sans-extension')).toBe('application/octet-stream');
  });

  it('ne devine pas de HTML, quoi qu\'on lui donne', () => {
    for (const nom of ['piege.html', 'piege.htm', 'piege.svg', 'piege.js']) {
      expect(contentTypeFor(nom)).toBe('application/octet-stream');
    }
  });
});
