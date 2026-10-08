module.exports = (fn, ttl = Infinity) => {
  const store = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = fn(...args).catch((e) => {
      store.delete(key);
      throw e;
    });
    store.set(key, { at: Date.now(), value });
    return value;
  };
};
