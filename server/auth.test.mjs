import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir,networkInterfaces} from 'node:os';
import http from 'node:http';
import path from 'node:path';
import {createApp} from './server.mjs';

test('account setup, password hashing, protected routes, logout and persistence', async () => {
  const folder = await mkdtemp(path.join(tmpdir(),'swing-auth-'));
  const authFile = path.join(folder,'account.json');
  let app;
  async function start() { app = createApp({authFile}); await new Promise(r => app.listen(0,'127.0.0.1',r)); return `http://127.0.0.1:${app.address().port}`; }
  async function stop() { app.closeAllConnections(); await new Promise(r => app.close(r)); }
  let url = await start();
  const credentials = {username:'test-user',password:'abcde'};
  const post = (route,body,cookie='') => fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
  try {
    assert.equal((await fetch(url,{redirect:'manual'})).status,302);
    assert.equal((await fetch(url+'/api/models')).status,401);
    assert.equal((await fetch(url+'/api/settings')).status,401);
    assert.equal((await post('/api/chat',{})).status,401);
    assert.equal((await fetch(url+'/signin')).status,200);
    assert.equal((await (await fetch(url+'/api/auth/status')).json()).needsSetup,true);
    assert.equal((await post('/api/auth/setup',{...credentials,password:'abcd'})).status,400);
    const created = await post('/api/auth/setup',credentials);
    assert.equal(created.status,200);
    const header = created.headers.get('set-cookie');
    assert.match(header,/HttpOnly/); assert.match(header,/SameSite=Strict/);
    const cookie = header.split(';')[0];
    assert.equal((await fetch(url+'/api/settings',{headers:{Cookie:cookie}})).status,200);
    assert.equal((await post('/api/auth/setup',credentials)).status,409);
    assert.equal((await readFile(authFile,'utf8')).includes(credentials.password),false);
    assert.equal((await post('/api/auth/logout',{},cookie)).status,200);
    assert.equal((await fetch(url+'/api/settings',{headers:{Cookie:cookie}})).status,401);
    assert.equal((await post('/api/auth/login',{...credentials,password:'wrong'})).status,401);
    const login = await post('/api/auth/login',credentials); assert.equal(login.status,200);
    const oldCookie = login.headers.get('set-cookie').split(';')[0];
    const registered = await post('/api/auth/register',{username:'second-user',password:'12345'});
    assert.equal(registered.status,200);
    const secondCookie = registered.headers.get('set-cookie').split(';')[0];
    const lan = Object.values(networkInterfaces()).flat().find(item=>item?.family==='IPv4'&&!item.internal)?.address;
    if(lan){
      const agentStatus = cookie => new Promise((resolve,reject)=>{
        http.get(url+'/api/agent/status',{headers:{Host:`${lan}:${app.address().port}`,Cookie:cookie}},res=>{
          let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));
        }).on('error',reject);
      });
      const ownerAccess=await agentStatus(oldCookie);
      assert.equal(ownerAccess.status,200);
      assert.equal(ownerAccess.body.desktopAllowed,process.platform==='win32');
      assert.equal((await agentStatus(secondCookie)).body.desktopAllowed,false);
      assert.equal((await agentStatus('')).status,401);
    }
    const secondIdentity = await (await fetch(url+'/api/auth/status',{headers:{Cookie:secondCookie}})).json();
    assert.equal(secondIdentity.user.username,'second-user');
    assert.notEqual(secondIdentity.user.storageKey,'legacy');
    assert.equal((await post('/api/auth/register',{username:'SECOND-USER',password:'12345'})).status,409);
    assert.equal((await fetch(url+'/api/settings',{headers:{Cookie:secondCookie,'X-Swing-User':'test-user'}})).status,401);
    await stop(); url = await start();
    assert.equal((await (await fetch(url+'/api/auth/status')).json()).needsSetup,false);
    assert.equal((await fetch(url+'/api/settings',{headers:{Cookie:oldCookie}})).status,401);
    assert.equal((await post('/api/auth/login',credentials)).status,200);
    assert.equal((await post('/api/auth/login',{username:'second-user',password:'12345'})).status,200);
    for (let i=0;i<5;i++) assert.equal((await post('/api/auth/login',{...credentials,password:'wrong'})).status,401);
    assert.equal((await post('/api/auth/login',credentials)).status,429);
  } finally { await stop(); await rm(folder,{recursive:true,force:true}); }
});

