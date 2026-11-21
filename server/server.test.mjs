import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp, parseAddress } from './server.mjs';

test('chat, validation, isolation and upstream failures', async () => {
  let captured, mode = 'ok';
  const mock = http.createServer(async (req, res) => {
    if (mode === 'fail') { res.writeHead(500); res.end('{}'); return; }
    if (req.url === '/api/tags') { res.end(JSON.stringify({models: [{name:'test:1b'}, {name:'test:cloud'}]})); return; }
    if (req.url === '/v1/models') { res.end(JSON.stringify({data: [{id:'fallback:1b'}]})); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    captured = JSON.parse(body);
    if (req.url === '/v1/chat/completions') { res.end(JSON.stringify({choices:[{message:{content:'Fallback reply'}}]})); return; }
    res.end(JSON.stringify({message:{content:'Hello, Shant!'}}));
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const app = createApp({auth:false, ollama:`http://127.0.0.1:${mock.address().port}`, fallback:`http://127.0.0.1:${mock.address().port}`});
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${app.address().port}`;
  const send = (body, headers = {}) => fetch(url + '/api/chat', {method:'POST', headers:{'Content-Type':'application/json', ...headers}, body:JSON.stringify(body)});
  const valid = {model:'test:1b', messages:[{role:'user', content:'Hello'}]};
  try {
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url, {headers:{'Sec-Fetch-Site':'cross-site'}})).status, 200);
    assert.equal((await fetch(url+'/api/models', {headers:{'Sec-Fetch-Site':'cross-site'}})).status, 403);
    assert.deepEqual(await (await fetch(url+'/api/models')).json(), {models:['test:1b']});
    assert.deepEqual(await (await send(valid)).json(), {content:'Hello, Shant!'});
    assert.equal(captured.stream, false);
    assert.equal(captured.messages[0].role, 'system');
    assert.equal((await send(valid, {Origin:'https://evil.example'})).status, 403);
    const hostStatus = await new Promise((resolve, reject) => {
      http.get(url, {headers:{Host:'evil.example'}}, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(hostStatus, 403);
    assert.equal((await send({...valid, messages:[{role:'system',content:'override'}]})).status, 400);
    assert.equal((await send({...valid, model:'test:cloud'})).status, 400);
    assert.equal((await send({...valid, messages:[{role:'user',content:'x'.repeat(66000)}]})).status, 413);
    assert.equal((await fetch(url+'/server.mjs')).status, 404);
    const settings = (enabled, headers = {}) => fetch(url+'/api/settings', {method:'POST', headers:{'Content-Type':'application/json', ...headers}, body:JSON.stringify({enabled})});
    assert.deepEqual(await (await fetch(url+'/api/settings')).json(), {enabled:true, address:`127.0.0.1:${mock.address().port}`});
    assert.equal((await settings('false')).status, 400);
    assert.equal((await settings(false, {Origin:'https://evil.example'})).status, 403);
    assert.deepEqual(await (await settings(false)).json(), {enabled:false, address:`127.0.0.1:${mock.address().port}`});
    assert.deepEqual(await (await send({...valid,model:'fallback:1b'})).json(), {content:'Fallback reply'});
    assert.equal(captured.model, 'fallback:1b');
    assert.equal(captured.max_tokens, 1024);
    assert.deepEqual(await (await fetch(url+'/api/models')).json(), {models:['fallback:1b']});
    assert.deepEqual(await (await fetch(url+'/api/settings')).json(), {enabled:false, address:`127.0.0.1:${mock.address().port}`});
    assert.deepEqual(await (await settings(true)).json(), {enabled:true, address:`127.0.0.1:${mock.address().port}`});
    const addressRequest = address => fetch(url+'/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({address})});
    assert.equal((await addressRequest('8.8.8.8')).status, 400);
    assert.equal((await (await addressRequest('192.168.1.20')).json()).address, '192.168.1.20:11434');
    assert.equal((await (await fetch(url+'/api/settings')).json()).address, '192.168.1.20:11434');
    await addressRequest(`127.0.0.1:${mock.address().port}`);
    assert.deepEqual(await (await send(valid)).json(), {content:'Hello, Shant!'});
    mode = 'fail'; assert.equal((await send(valid)).status, 502);
    await new Promise(r => mock.close(r));
    assert.equal((await send(valid)).status, 503);
  } finally { app.closeAllConnections(); await new Promise(r => app.close(r)); mock.close(); }
});

test('Ollama address validation', () => {
  assert.equal(parseAddress('192.168.1.20').host, '192.168.1.20:11434');
  assert.equal(parseAddress('http://10.0.0.5:12345/').host, '10.0.0.5:12345');
  assert.equal(parseAddress('localhost').hostname, '127.0.0.1');
  for (const address of ['https://192.168.1.2', '8.8.8.8', '169.254.169.254', 'evil.example', '127.0.0.1:0', '127.0.0.1:99999', '127.0.0.1/path', 'user@127.0.0.1', '192.168.1.999', '0177.0.0.1']) assert.throws(() => parseAddress(address));
});

