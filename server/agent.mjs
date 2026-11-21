import { mkdir, lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const fail = (message, status = 400) => Object.assign(new Error(message), {status});
const digest = value => createHash('sha256').update(value).digest('hex');
export function createAgent(base,desktop=desktopCommand) {
  const proposals = new Map();
  let executing = false;
  let running = null;
  async function workspace(user) {
    if (!/^[a-z0-9_-]{3,32}$/.test(user)) throw fail('Invalid account.');
    const root = path.join(base, user);
    await mkdir(root, {recursive:true});
    if ((await lstat(base)).isSymbolicLink() || (await lstat(root)).isSymbolicLink()) throw fail('Workspace links are not allowed.');
    return root;
  }
  async function resolve(user, name) {
    if (typeof name !== 'string' || name.length > 200 || !name || name.includes('\\')) throw fail('Use a relative workspace path with / separators.');
    const parts = name.split('/');
    if (parts.some(p => !/^[a-zA-Z0-9_ -][a-zA-Z0-9_. -]*$/.test(p) || p.endsWith('.') || p.endsWith(' ') || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) throw fail('That path is not allowed in the workspace.');
    let target = await workspace(user);
    for (const part of parts) {
      target = path.join(target, part);
      try { if ((await lstat(target)).isSymbolicLink()) throw fail('File and folder links are not allowed.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return target;
  }
  async function snapshot(user, name) {
    const target = await resolve(user, name);
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.size > 32000) throw fail('Only text files up to 32 KB can be edited.');
      const buffer = await readFile(target);
      if (buffer.includes(0)) throw fail('This is not a text file.');
      return {content:buffer.toString('utf8'), hash:digest(buffer)};
    } catch (error) { if (error.code === 'ENOENT') return {content:null, hash:null}; throw error; }
  }
  async function list(user) {
    const root = await workspace(user), entries = [];
    async function walk(dir, prefix = '', depth = 0) {
      for (const item of await readdir(dir, {withFileTypes:true})) {
        if (entries.length >= 100) return;
        if (item.isSymbolicLink()) continue;
        const name = prefix + item.name;
        entries.push(name + (item.isDirectory() ? '/' : ''));
        if (item.isDirectory() && depth < 3) await walk(path.join(dir,item.name), name+'/', depth+1);
      }
    }
    await walk(root);
    return {root, entries};
  }
  async function propose(user, action, desktop) {
    if (!action || !['create_folder','read_file','write_file','click'].includes(action.type)) throw fail('The model did not return a supported action. Try a clearer request or another model.');
    let clean;
    if (action.type === 'click') {
      if (!desktop) throw fail('Desktop control requires the original account and an approved screenshot.',403);
      if (!Number.isInteger(action.x) || !Number.isInteger(action.y) || action.x < 0 || action.y < 0 || action.x >= desktop.width || action.y >= desktop.height) throw fail('Invalid click coordinates.');
      clean = {type:'click',x:action.x,y:action.y};
    } else {
      await resolve(user, action.path);
      clean = {type:action.type, path:action.path};
      if (action.type === 'write_file') {
        if (typeof action.content !== 'string' || Buffer.byteLength(action.content) > 32000 || action.content.includes('\0')) throw fail('File content must be text, up to 32 KB.');
        const previous = await snapshot(user, action.path);
        clean.content = action.content;
        clean.previous = previous.content;
        clean.hash = previous.hash;
      }
    }
    for (const [id,p] of proposals) if (p.expires < Date.now()) proposals.delete(id);
    if (proposals.size >= 100) throw fail('Too many pending proposals. Wait a few minutes.',429);
    const id = randomBytes(24).toString('hex');
    proposals.set(id,{user,action:clean,expires:Date.now()+5*60*1000,desktop});
    return {id, action:clean};
  }
  function cancel(user) { for (const [id,p] of proposals) if (p.user === user) proposals.delete(id); if(running?.user === user) running.controller.abort(); }
  async function execute(user,id,desktopAllowed) {
    if (executing) throw fail('Another action is running.',409);
    const proposal = proposals.get(id);
    if (!proposal || proposal.user !== user || proposal.expires < Date.now()) throw fail('This proposal expired or belongs to another account.',409);
    proposals.delete(id);
    executing = true;
    running = {user,controller:new AbortController()};
    try {
      const a = proposal.action;
      if (a.type === 'click') {
        if (!desktopAllowed) throw fail('Desktop access is unavailable here.',403);
        await desktop('click', a.x,a.y,running.controller.signal);
        return 'Clicked the approved coordinates. Check the desktop to confirm the result.';
      }
      const target = await resolve(user,a.path);
      if (a.type === 'create_folder') { await mkdir(target,{recursive:true}); return `Created folder: ${a.path}`; }
      if (a.type === 'read_file') { const result = await snapshot(user,a.path); if (result.content === null) throw fail('File not found.'); return `Contents of ${a.path}:\n${result.content}`; }
      const now = await snapshot(user,a.path);
      if (now.hash !== a.hash) throw fail('The file changed after the preview. Ask again to review the latest version.',409);
      // Existing contents have already been shown for approval. Never execute files.
      await writeFile(target,a.content,{flag:now.hash === null ? 'wx' : 'w'});
      return `Saved file: ${a.path}`;
    } finally { executing = false; running = null; }
  }
  return {list,snapshot,propose,execute,cancel};
}
export async function desktopCommand(command,x=0,y=0,signal) {
  if (process.platform !== 'win32') throw fail('Desktop tools require Windows.');
  try {
    const {stdout} = await run('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./desktop.ps1',import.meta.url)),command,String(x),String(y)],{windowsHide:true,timeout:20000,maxBuffer:12*1024*1024,signal});
    return JSON.parse(stdout.trim());
  } catch(error) {
    if(signal?.aborted)throw fail('Desktop action stopped.',409);
    if(error.killed)throw fail('The Windows desktop helper timed out. Check that the PC is awake and unlocked.',504);
    throw fail('Windows could not complete the desktop action. Check that the PC is unlocked and Start Chat.bat is running in your signed-in Windows session.',503);
  }
}
