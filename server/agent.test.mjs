import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createAgent} from './agent.mjs';
import {createApp} from './server.mjs';

test('file proposals require approval, isolate accounts, reject unsafe paths, detect conflicts and cannot replay',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'swing-agent-'));
  const agent=createAgent(root);
  try {
    for(const name of ['../outside','C:/outside','a\\b','x:stream','CON','folder/../x','/absolute','.hidden']) {
      await assert.rejects(agent.propose('alice',{type:'write_file',path:name,content:'no'}));
    }
    const p=await agent.propose('alice',{type:'write_file',path:'hello.txt',content:'Hello'});
    await assert.rejects(readFile(path.join(root,'alice','hello.txt')));
    await assert.rejects(agent.execute('bob',p.id,false));
    await agent.execute('alice',p.id,false);
    assert.equal(await readFile(path.join(root,'alice','hello.txt'),'utf8'),'Hello');
    await assert.rejects(agent.execute('alice',p.id,false));
    const edit=await agent.propose('alice',{type:'write_file',path:'hello.txt',content:'Updated'});
    assert.equal(edit.action.previous,'Hello');
    const competing=await agent.propose('alice',{type:'write_file',path:'hello.txt',content:'Other'});
    await agent.execute('alice',competing.id,false);
    await assert.rejects(agent.execute('alice',edit.id,false),/changed/);
    const cancelled=await agent.propose('alice',{type:'create_folder',path:'cancelled'});
    agent.cancel('alice'); await assert.rejects(agent.execute('alice',cancelled.id,false));
    const folder=await agent.propose('alice',{type:'create_folder',path:'notes'});
    await agent.execute('alice',folder.id,false);
    assert.ok((await agent.list('alice')).entries.includes('notes/'));
    assert.deepEqual((await agent.list('bob')).entries,[]);
    await assert.rejects(agent.propose('alice',{type:'click',x:1,y:2},null));
    await assert.rejects(agent.propose('alice',{type:'click',x:100,y:2},{width:100,height:100}));
    await assert.rejects(agent.propose('alice',{type:'run',command:'anything'}));
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('agent API requires mode on, executes only stored proposals, and disabling revokes approval',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'swing-agent-api-'));
  let content=JSON.stringify({message:'Create a note',action:{type:'write_file',path:'note.txt',content:'A note'}}), captured;
  const mock=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;captured=JSON.parse(raw);res.end(JSON.stringify({message:{content}}));});
  await new Promise(r=>mock.listen(0,'127.0.0.1',r));
  const app=createApp({auth:false,agentRoot:root,ollama:`http://127.0.0.1:${mock.address().port}`});
  await new Promise(r=>app.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${app.address().port}`;
  const post=(route,body)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const chat={model:'test',messages:[{role:'user',content:'@Files create a note'}],agent:'Files'};
  try {
    assert.equal((await post('/api/chat',chat)).status,403);
    await post('/api/agent/settings',{enabled:true});
    const data=await (await post('/api/chat',chat)).json();
    assert.ok(data.proposal.id);assert.equal(captured.format,'json');
    await assert.rejects(readFile(path.join(root,'test','note.txt')));
    assert.equal((await post('/api/agent/execute',{id:'fake',action:{type:'write_file'}})).status,409);
    assert.equal((await post('/api/agent/execute',{id:data.proposal.id})).status,200);
    assert.equal(await readFile(path.join(root,'test','note.txt'),'utf8'),'A note');
    const second=await (await post('/api/chat',chat)).json();
    await post('/api/agent/settings',{enabled:false});
    assert.equal((await post('/api/agent/execute',{id:second.proposal.id})).status,403);
    await post('/api/agent/settings',{enabled:true});
    assert.equal((await post('/api/agent/execute',{id:second.proposal.id})).status,409);
    assert.equal((await post('/api/agent/capture',{})).status,403);
    content='not JSON';assert.equal((await post('/api/chat',chat)).status,502);
  } finally {app.closeAllConnections();mock.closeAllConnections();await new Promise(r=>app.close(r));await new Promise(r=>mock.close(r));await rm(root,{recursive:true,force:true});}
});
