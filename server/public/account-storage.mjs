export function accountStorage(storage, key) {
  const prefix = key === 'legacy' ? '' : `swing-user:${key}:`;
  const keys = () => Array.from({length:storage.length}, (_, i) => storage.key(i)).filter(k => k && (prefix ? k.startsWith(prefix) : k.startsWith('shant-chat:')));
  return {
    get length() { return keys().length; },
    key:i => keys()[i]?.slice(prefix.length) ?? null,
    getItem:k => storage.getItem(prefix+k),
    setItem:(k,v) => storage.setItem(prefix+k,v),
    removeItem:k => storage.removeItem(prefix+k)
  };
}
