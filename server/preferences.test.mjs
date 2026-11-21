import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, loadPreferences, collectExample } from './public/preferences.mjs';

test('privacy defaults, persistence, and independent collection switches', () => {
  const map = new Map();
  const storage = {getItem:key => map.get(key) ?? null, setItem:(key,value) => map.set(key,value)};
  assert.deepEqual(loadPreferences(storage), defaults);
  const row = {messages:[{role:'user',content:'Hello'},{role:'assistant',content:'Hi'}]};
  assert.equal(collectExample(storage, defaults, 'training', row), false);
  assert.equal(collectExample(storage, defaults, 'feedback', row), false);
  assert.equal(map.size, 0);
  const prefs = {...defaults, darkMode:true, saveChats:false, training:true};
  storage.setItem('shant-chat:preferences', JSON.stringify(prefs));
  assert.deepEqual(loadPreferences(storage), prefs);
  assert.equal(collectExample(storage, prefs, 'training', row), true);
  assert.equal(collectExample(storage, prefs, 'feedback', row), false);
  assert.deepEqual(JSON.parse(storage.getItem('shant-chat:data:training')), [row]);
  prefs.training = false;
  collectExample(storage, prefs, 'training', row);
  assert.equal(JSON.parse(storage.getItem('shant-chat:data:training')).length, 1);
  prefs.feedback = true;
  collectExample(storage, prefs, 'feedback', {...row, rating:'helpful'});
  assert.equal(JSON.parse(storage.getItem('shant-chat:data:feedback'))[0].rating, 'helpful');
});
