export const defaults = {darkMode:false, saveChats:true, training:false, feedback:false};
export function loadPreferences(storage) {
  const value = JSON.parse(storage.getItem('shant-chat:preferences') || '{}');
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, typeof value?.[key] === 'boolean' ? value[key] : fallback]));
}
export function collectExample(storage, preferences, kind, example) {
  if (!preferences[kind]) return false;
  const key = `shant-chat:data:${kind}`;
  const rows = JSON.parse(storage.getItem(key) || '[]');
  if (!Array.isArray(rows)) throw Error('Invalid saved collection');
  rows.push(example);
  storage.setItem(key, JSON.stringify(rows));
  return true;
}
