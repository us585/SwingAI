import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from './server.mjs';
import {agentRequest} from './public/agent-ui.mjs';

test('agent requests time out and Stop aborts pending capture immediately',async()=>{
  const pending=(_url,{signal})=>new Promise((resolve,reject)=>{
    if(signal.aborted)reject(new DOMException('Stopped','AbortError'));
    else signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true});
  });
  await assert.rejects(agentRequest(pending,'/api/agent/capture',{},undefined,15),/Screenshot capture timed out/);
  const controller=new AbortController();
  const job=agentRequest(pending,'/api/agent/capture',{},controller.signal);
  controller.abort();await assert.rejects(job,{name:'AbortError'});
  await assert.rejects(agentRequest(pending,'/api/agent/capture',{},controller.signal),{name:'AbortError'});
});

test('capture cancellation stops helper, releases busy state and permits retry', {skip:process.platform!=='win32'},async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'swing-capture-test-'));
  let started,aborted=false,calls=0;
  const ready=new Promise(r=>{started=r;});
  const desktop=async(command,x,y,signal)=>{
    assert.equal(command,'capture');calls++;
    if(calls>1)return {image:'test-image',width:100,height:100};
    return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(Object.assign(Error('Stopped'),{status:409}));},{once:true});started();});
  };
  const app=createApp({authFile:path.join(root,'account.json'),desktop});
  await new Promise(r=>app.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${app.address().port}`;
  let cookie='';
  const post=(route,body={})=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
  try{
    const signup=await post('/api/auth/setup',{username:'tester',password:'abcde'});cookie=signup.headers.get('set-cookie').split(';')[0];
    await post('/api/agent/settings',{enabled:true});
    const capture=post('/api/agent/capture');await ready;
    assert.equal((await post('/api/agent/cancel')).status,200);
    assert.equal((await capture).status,409);assert.equal(aborted,true);
    const retry=await post('/api/agent/capture');assert.equal(retry.status,200);assert.equal((await retry.json()).image,'test-image');
  }finally{
    app.closeAllConnections();await new Promise(r=>app.close(r));
    assert.equal(path.dirname(path.resolve(root)),path.resolve(tmpdir()));assert.ok(path.basename(root).startsWith('swing-capture-test-'));
    await rm(root,{recursive:true,force:true});
  }
});
