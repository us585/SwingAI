import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatStore } from './public/chat-store.mjs';

test('chats and drafts survive reload, remain separate, and can be deleted', () => {
  const data = new Map();
  const storage = { get length() { return data.size; }, key:i => [...data.keys()][i], getItem:k => data.get(k) ?? null, setItem:(k,v) => data.set(k,v), removeItem:k => data.delete(k) };
  const firstTab = createChatStore(storage);
  const chat = {id:'first', updated:1, model:'test:1b', draft:'Remember this draft', messages:[{role:'user',content:'My name is Shant'}, {role:'assistant',content:'Hello Shant'}]};
  firstTab.save(chat);
  const reloaded = createChatStore(storage);
  assert.deepEqual(reloaded.list(), [chat]);
  assert.equal(reloaded.current(), 'first');
  const second = {...chat, id:'second', updated:2, messages:[], draft:'Another conversation'};
  reloaded.save(second);
  assert.deepEqual(firstTab.list(), [second, chat]);
  firstTab.select('first');
  assert.equal(reloaded.current(), 'first');
  reloaded.remove('second');
  assert.deepEqual(firstTab.list(), [chat]);
  data.set('shant-chat:v1:corrupted', '{bad json');
  assert.deepEqual(firstTab.list(), [chat]);
  assert.throws(() => firstTab.save({...chat, messages:[{role:'system',content:'bad'}]}));
  const full = createChatStore({...storage, setItem:() => { throw Error('Quota exceeded'); }});
  assert.throws(() => full.save(chat), /Quota/);
});
