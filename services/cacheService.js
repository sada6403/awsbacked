const NodeCache = require('node-cache');

/**
 * Centralized Cache Service
 * 
 * TTL defaults:
 * - Stats/Dashboard: 10 mins (600s)
 * - Products: 1 hour (3600s)
 * - Members: 5 mins (300s)
 */
class CacheService {
    constructor() {
        this.cache = new NodeCache({
            stdTTL: 600,
            checkperiod: 60,
            useClones: false // Performance optimization for large objects
        });
        console.log('[CacheService] Initialized.');
    }

    get(key) {
        return this.cache.get(key);
    }

    set(key, value, ttl) {
        if (ttl) {
            return this.cache.set(key, value, ttl);
        }
        return this.cache.set(key, value);
    }

    del(key) {
        return this.cache.del(key);
    }

    /**
     * Delete multiple keys matching a pattern
     * @param {string} pattern - Prefix pattern to delete
     */
    delStartWith(pattern) {
        const keys = this.cache.keys();
        const targets = keys.filter(k => k.startsWith(pattern));
        if (targets.length > 0) {
            this.cache.del(targets);
            console.log(`[CacheService] Deleted ${targets.length} keys starting with "${pattern}"`);
        }
    }

    flush() {
        return this.cache.flushAll();
    }

    keys() {
        return this.cache.keys();
    }
}

// Singleton instance
const cacheService = new CacheService();

module.exports = cacheService;
