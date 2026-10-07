module.exports = (fn) => {
  const store = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (!store.has(key)) store.set(key, fn(...args).catch((e) => { store.delete(key); throw e; }));
    return store.get(key);
  };
};
