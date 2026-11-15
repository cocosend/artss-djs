export function createRateLimiter({limit = 300, windowMs = 60_000, maxClients = 10_000, now = Date.now} = {}) {
  if (![limit, windowMs, maxClients].every(value => Number.isSafeInteger(value) && value > 0) || typeof now !== 'function') {
    throw new RangeError('Rate limiter settings must be positive integers');
  }

  const clients = new Map();
  return (req, res, next) => {
    const timestamp = now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let client = clients.get(key);

    if (!client || timestamp >= client.resetAt) {
      if (!client && clients.size >= maxClients) {
        for (const [address, entry] of clients) {
          if (timestamp >= entry.resetAt) clients.delete(address);
        }
        if (clients.size >= maxClients) {
          res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
          return res.status(429).send('Too many requests');
        }
      }
      client = {count: 0, resetAt: timestamp + windowMs};
      clients.set(key, client);
    }

    if (client.count >= limit) {
      res.setHeader('Retry-After', String(Math.ceil((client.resetAt - timestamp) / 1000)));
      return res.status(429).send('Too many requests');
    }

    client.count++;
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(limit - client.count));
    res.setHeader('RateLimit-Reset', String(Math.ceil((client.resetAt - timestamp) / 1000)));
    next();
  };
}
