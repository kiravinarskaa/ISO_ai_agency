// Share concurrent reads and briefly cache successes. Failures are never cached
// as empty data; quota errors pause reads so browser refreshes cannot amplify them.
export function createReadCache({ ttl = 30_000, cooldown = 65_000, now = Date.now } = {}) {
  const entries = new Map();
  let blockedUntil = 0, quotaError;
  return {
    clear() { entries.clear(); },
    async read(key, load) {
      const entry = entries.get(key);
      if (entry?.pending) return entry.pending;
      if (entry && now() < entry.expires) return entry.value;
      if (now() < blockedUntil) throw quotaError;
      const pending = Promise.resolve().then(load).then(value => {
        entries.set(key, { value, expires: now() + ttl });
        return value;
      }, error => {
        entries.delete(key);
        if (error.code === 429 || error.response?.status === 429 || /quota exceeded/i.test(error.message || '')) {
          quotaError = error;
          blockedUntil = now() + cooldown;
        }
        throw error;
      });
      entries.set(key, { pending });
      return pending;
    },
  };
}
