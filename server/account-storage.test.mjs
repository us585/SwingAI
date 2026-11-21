import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountStorage} from './public/account-storage.mjs';
test('separate account storage preserves original chats without sharing them', () => {
  const map = new Map([['shant-chat:v1:old','original']]);
  const raw = {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  const owner=accountStorage(raw,'legacy'), second=accountStorage(raw,'account-second');
  assert.equal(owner.getItem('shant-chat:v1:old'),'original');
  assert.equal(second.getItem('shant-chat:v1:old'),null);
  second.setItem('shant-chat:v1:new','second');
  assert.equal(owner.length,1); assert.equal(second.length,1);
  assert.equal(second.key(0),'shant-chat:v1:new');
  assert.equal(owner.getItem('shant-chat:v1:new'),null);
  second.removeItem('shant-chat:v1:new');
  assert.equal(owner.getItem('shant-chat:v1:old'),'original');
});
