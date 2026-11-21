import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAccountChats} from './account-chats.mjs';
import {createAccountChatStore} from './public/account-chat-store.mjs';
import {createApp} from './server.mjs';
const example=(id='chat1',content='Hello')=>({id,updated:1,model:'test',draft:'',messages:[{role:'user',content},{role:'assistant',content:'Hi'}]});
async function temporary(){return mkdtemp(path.join(tmpdir(),'swing-chats-test-'));}
async function cleanup(root){assert.equal(path.dirname(path.resolve(root)),path.resolve(tmpdir()));assert.ok(path.basename(root).startsWith('swing-chats-test-'));await rm(root,{recursive:true,force:true});}
function memoryStorage(){const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}

test('account chats survive restart, isolate accounts, handle conflicts and migrate idempotently',async()=>{
  const root=await temporary();let store=createAccountChats(root);
  try{
    await store.migrate('alice',example());await store.migrate('alice',example());
    assert.equal((await store.list('alice')).length,1);assert.deepEqual(await store.list('bob'),[]);
    const saved=await store.save('alice',{chat:example(),revision:1});assert.equal(saved.revision,2);
    await store.migrate('alice',{...example(),updated:900});assert.equal((await store.list('alice')).length,1);
    const outcomes=await Promise.allSettled([store.save('alice',{chat:example('chat1','first'),revision:2}),store.save('alice',{chat:example('chat1','second'),revision:2})]);
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(outcomes.find(x=>x.status==='rejected').reason.status,409);
    store=createAccountChats(root);assert.equal((await store.list('alice'))[0].revision,3);
    await store.remove('alice','chat1',3);await store.migrate('alice',example());assert.deepEqual(await store.list('alice'),[]);
    await assert.rejects(store.save('alice',{chat:example(),revision:0}),{status:409});
    assert.throws(()=>store.save('alice',{chat:{...example(),id:'../../bad'},revision:0}));
  }finally{await cleanup(root);}
});

test('browser migration clears only acknowledged data, queues drafts and preserves concurrent device edits',async()=>{
  const root=await temporary(),server=createAccountChats(root),storage=memoryStorage();
  storage.setItem('shant-chat:v1:chat1',JSON.stringify(example()));storage.setItem('shant-chat:current','chat1');
  let offline=false;
  const request=async(route,options={})=>{
    if(offline)throw Error('Offline');
    const body=options.body?JSON.parse(options.body):null;
    if(route==='/api/chats')return {chats:await server.list('alice')};
    if(route.endsWith('/import'))return server.migrate('alice',body.chat);
    if(route.endsWith('/save'))return {chat:await server.save('alice',body)};
    if(route.endsWith('/delete'))return server.remove('alice',body.id,body.revision);
    throw Error('Unexpected route');
  };
  try{
    const first=await createAccountChatStore(request,storage);assert.equal(storage.getItem('shant-chat:v1:chat1'),null);
    const second=await createAccountChatStore(request,memoryStorage());first.select('chat1');second.select('chat1');
    await second.save(example('chat1','Other device'));
    await first.refresh(); // Sidebar refresh cannot update the open editor's revision.
    await first.save(example('chat1','My device'));
    const chats=await server.list('alice');assert.equal(chats.length,2);
    assert.ok(chats.some(c=>c.messages[0].content==='Other device'));assert.ok(chats.some(c=>c.messages[0].content==='My device'));
    await Promise.all([first.save({...example('chat1','My device'),draft:'a'}),first.save({...example('chat1','My device'),draft:'ab'})]);
    assert.equal((await server.list('alice')).find(c=>c.id!=='chat1').draft,'ab');
    offline=true;await assert.rejects(first.save({...example('chat1','My device'),draft:'offline'}));assert.equal(first.hasPending(),true);
    offline=false;await first.save({...example('chat1','My device'),draft:'recovered'});assert.equal(first.hasPending(),false);
    const failedStorage=memoryStorage();failedStorage.setItem('shant-chat:v1:old',JSON.stringify(example('old')));
    const failed=await createAccountChatStore((route,opts)=>route.endsWith('/import')?Promise.reject(Error('Failed import')):request(route,opts),failedStorage);
    assert.equal(failed.migrationFailed,true);assert.ok(failedStorage.getItem('shant-chat:v1:old'));
  }finally{await cleanup(root);}
});

test('authenticated devices share chats; other accounts and signed-out requests cannot access them',async()=>{
  const root=await temporary();let app,url;
  async function start(){app=createApp({authFile:path.join(root,'account.json')});await new Promise(r=>app.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${app.address().port}`;}
  async function stop(){app.closeAllConnections();await new Promise(r=>app.close(r));}
  const post=(route,body,cookie='')=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
  const list=cookie=>fetch(url+'/api/chats',{headers:{Cookie:cookie}});
  const login=async(username,route='/api/auth/login')=>(await post(route,{username,password:'abcde'})).headers.get('set-cookie').split(';')[0];
  await start();
  try{
    assert.equal((await list('')).status,401);assert.equal((await post('/api/chats/save',{chat:example(),revision:0})).status,401);
    const alice=await login('alice','/api/auth/setup'),device=await login('alice'),bob=await login('bob','/api/auth/register');
    assert.equal((await post('/api/chats/save',{chat:example(),revision:0,username:'bob'},alice)).status,200);
    assert.equal((await (await list(device)).json()).chats.length,1);
    assert.equal((await (await list(bob)).json()).chats.length,0);
    await post('/api/chats/delete',{id:'chat1',revision:1},bob);
    assert.equal((await (await list(alice)).json()).chats.length,1);
    assert.equal((await fetch(url+'/api/chats',{headers:{Cookie:bob,'X-Swing-User':'alice'}})).status,401);
    const bad=await fetch(url+'/api/chats/save',{method:'POST',headers:{'Content-Type':'application/json',Cookie:alice,Origin:'https://other.example'},body:JSON.stringify({chat:example(),revision:1})});assert.equal(bad.status,403);
    await stop();await start();const again=await login('alice');assert.equal((await (await list(again)).json()).chats[0].messages[0].content,'Hello');
  }finally{await stop();await cleanup(root);}
});
