/**
 * Lightweight, zero-dependency in-memory LRU (Least Recently Used) cache.
 * Backed by native JavaScript Map which maintains insertion order.
 */
export class LruMemoryCache<K, V> {
  private readonly map = new Map<K, V>();
  private readonly maxCapacity: number;

  constructor(maxCapacity = 50) {
    if (maxCapacity <= 0) {
      throw new Error('Cache capacity must be greater than 0');
    }
    this.maxCapacity = maxCapacity;
  }

  /**
   * Retrieves an item from the cache.
   * Promotes the accessed entry to the most recently used position.
   */
  get(key: K): V | undefined {
    if (!this.map.has(key)) {
      return undefined;
    }
    const val = this.map.get(key)!;
    // Re-insert to mark as most recently used
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  /**
   * Stores an item in the cache.
   * If capacity is reached, evicts the least recently used item.
   */
  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxCapacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  get capacity(): number {
    return this.maxCapacity;
  }
}
