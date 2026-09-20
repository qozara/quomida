import { vi } from 'vitest';
const mockSeedData = {
  base_ingredients: [
    { id: 'ing-1', name: 'Test Food', source: 'system', lang: 'es', calories_100g: 100, protein_100g: 10, carbs_100g: 10, fats_100g: 10 }
  ],
  portions: []
};

const originalFetch = globalThis.fetch;
globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('seed_v1.json')) {
    return new Response(JSON.stringify(mockSeedData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (originalFetch) {
    return originalFetch(input, init);
  }
  return new Response('Not Found', { status: 404 });
});
