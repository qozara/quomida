import { describe, it, expect } from 'vitest';
import { LruMemoryCache } from '../src/cache/LruMemoryCache.js';

describe('LruMemoryCache', () => {
  it('stores and retrieves items correctly', () => {
    const cache = new LruMemoryCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBeUndefined();
    expect(cache.size).toBe(2);
  });

  it('evicts the least recently used item when capacity is exceeded', () => {
    const cache = new LruMemoryCache<string, string>(3);
    cache.set('a', 'alpha');
    cache.set('b', 'beta');
    cache.set('c', 'gamma');

    // Access 'a' so 'b' becomes the oldest
    cache.get('a');

    // Insert 4th item -> should evict 'b'
    cache.set('d', 'delta');

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('alpha');
    expect(cache.get('c')).toBe('gamma');
    expect(cache.get('d')).toBe('delta');
    expect(cache.size).toBe(3);
  });

  it('updates existing item value and promotes it to most recently used', () => {
    const cache = new LruMemoryCache<string, number>(2);
    cache.set('x', 10);
    cache.set('y', 20);

    // Update 'x'
    cache.set('x', 15);

    // Insert 'z' -> should evict 'y', not 'x'
    cache.set('z', 30);

    expect(cache.get('x')).toBe(15);
    expect(cache.get('z')).toBe(30);
    expect(cache.get('y')).toBeUndefined();
  });

  it('clears all entries properly', () => {
    const cache = new LruMemoryCache<string, number>(5);
    cache.set('one', 1);
    cache.set('two', 2);
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('one')).toBeUndefined();
  });

  it('throws an error if initialized with non-positive capacity', () => {
    expect(() => new LruMemoryCache(0)).toThrow('Cache capacity must be greater than 0');
    expect(() => new LruMemoryCache(-5)).toThrow('Cache capacity must be greater than 0');
  });
});
