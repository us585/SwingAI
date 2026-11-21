import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const fail = (status, message) => Object.assign(new Error(message), {status});
const lifetime = 7 * 24 * 60 * 60 * 1000;

export function createAuth(filename) {
  const sessions = new Map(), attempts = new Map();
  async function account(username) {
    try {
      const owner = JSON.parse(await readFile(filename, 'utf8'));
      if (!username || owner.username === username) return {...owner, storageKey:'legacy'};
      if (!/^[a-z0-9_-]{3,32}$/.test(username)) return null;
      return {...JSON.parse(await readFile(join(dirname(filename),'accounts',`${username}.json`),'utf8')), storageKey:`account-${username}`};
    }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  function token(req) { return /(?:^|;\s*)swing_session=([^;]+)/.exec(req.headers.cookie || '')?.[1]; }
  function signedIn(req) {
    const key = token(req), session = sessions.get(key);
    if (!session || session.expires <= Date.now()) { sessions.delete(key); return false; }
    return !req.headers['x-swing-user'] || req.headers['x-swing-user'] === session.username;
  }
  function cookie(res, value, age) {
    res.setHeader('Set-Cookie', `swing_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}`);
  }
  async function handle(req, res, json) {
    if (req.url === '/api/auth/status' && req.method === 'GET') {
      const session = signedIn(req) ? sessions.get(token(req)) : null;
      json(200, {signedIn:!!session, user:session ? {username:session.username, storageKey:session.storageKey} : null, needsSetup:!(await account()), canSetup:['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)}); return true;
    }
    if (!['/api/auth/login','/api/auth/setup','/api/auth/register','/api/auth/logout'].includes(req.url) || req.method !== 'POST') return false;
    if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, 'JSON required.');
    if (req.url === '/api/auth/logout') { sessions.delete(token(req)); cookie(res, '', 0); json(200, {ok:true}); return true; }
    const ip = req.socket.remoteAddress;
    for (const [key, item] of attempts) if (item.reset <= Date.now()) attempts.delete(key);
    const attempt = attempts.get(ip) || {count:0, reset:Date.now()+15*60*1000};
    if (attempt.count >= 5) throw fail(429, 'Too many attempts. Try again in 15 minutes.');
    attempt.count++; attempts.set(ip, attempt);
    let raw = '', size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 4096) throw fail(413, 'Request too large.'); raw += chunk; }
    let input;
    try { input = JSON.parse(raw); } catch { throw fail(400, 'Invalid request.'); }
    if (typeof input?.username !== 'string' || typeof input.password !== 'string' || input.password.length > 256) throw fail(400, 'Enter a username and password.');
    const username = input.username.trim().toLowerCase();
    let saved = await account(username);
    if (req.url === '/api/auth/setup' || req.url === '/api/auth/register') {
      const owner = await account();
      if (!owner && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip)) throw fail(403, 'Create the first account on the PC at http://127.0.0.1:3000.');
      if (req.url === '/api/auth/setup' && owner) throw fail(409, 'An account already exists. Sign in instead.');
      if (saved) throw fail(409, 'That username is already taken. Choose another.');
      if (!/^[a-z0-9_-]{3,32}$/.test(username) || input.password.length < 5) throw fail(400, 'Use a 3–32 character username (letters, numbers, _ or -) and a password of at least 5 characters.');
      const salt = randomBytes(16).toString('hex');
      const hash = (await scrypt(input.password, salt, 64)).toString('hex');
      saved = {username, salt, hash, storageKey:owner ? `account-${username}` : 'legacy'};
      const destination = owner ? join(dirname(filename),'accounts',`${username}.json`) : filename;
      await mkdir(dirname(destination), {recursive:true});
      try { await writeFile(destination, JSON.stringify(saved), {flag:'wx', mode:0o600}); }
      catch (error) { if (error.code === 'EEXIST') throw fail(409, 'An account already exists. Sign in instead.'); throw error; }
    } else {
      const derived = await scrypt(input.password, saved?.salt || 'swing-dummy-salt', 64);
      if (!saved || !timingSafeEqual(derived, Buffer.from(saved.hash, 'hex')) || saved.username !== username) throw fail(401, 'Incorrect username or password.');
    }
    attempts.delete(ip);
    sessions.delete(token(req));
    for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
    const key = randomBytes(32).toString('base64url');
    sessions.set(key, {expires:Date.now()+lifetime, username:saved.username, storageKey:saved.storageKey});
    cookie(res, key, lifetime/1000); json(200, {ok:true}); return true;
  }
  return {signedIn, handle, user: req => signedIn(req) ? sessions.get(token(req)) : null};
}


