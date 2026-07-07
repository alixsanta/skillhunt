import { apiClient } from './client';

describe('apiClient', () => {
  it('utilise VITE_API_URL comme baseURL (fallback localhost:3001)', () => {
    const expected = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
    expect(apiClient.defaults.baseURL).toBe(expected);
  });
});
