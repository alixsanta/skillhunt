import { apiClient, DEFAULT_API_URL } from './client';

describe('apiClient', () => {
  it('utilise VITE_API_URL comme baseURL (fallback DEFAULT_API_URL)', () => {
    // Même sémantique `||` que client.ts : une variable vide retombe sur le fallback (SH-38).
    const expected = import.meta.env.VITE_API_URL || DEFAULT_API_URL;
    expect(apiClient.defaults.baseURL).toBe(expected);
  });
});
