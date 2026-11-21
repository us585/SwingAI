import { createAccountChatStore } from './account-chat-store.mjs';
import { defaults, loadPreferences, collectExample } from './preferences.mjs';
import { accountStorage } from './account-storage.mjs';
import { setupAgent } from './agent-ui.mjs';
import { renderMessageContent } from './code-blocks.mjs';
const identity = await (await fetch('/api/auth/status')).json();
if (!identity.signedIn || !identity.user) { location.replace('/signin'); throw Error('Sign-in required.'); }
const userStorage = accountStorage(window.localStorage, identity.user.storageKey);
const $ = id => document.getElementById(id);
$('openSettings').onclick = () => $('settings').showModal();
$('closeSettings').onclick = () => $('settings').close();
document.querySelector('#welcome .eyebrow').textContent = `HELLO, ${identity.user.username.toUpperCase()}`;
let history = [], active = null;
let ollamaEnabled = false, settingsBusy = false, loadingModels = false;
let savedAddress = '', addressDirty = false;
let installedModels = [], customModel = false;
function syncModelPicker() {
  const name = $('model').value.trim();
  $('modelPicker').replaceChildren();
  for (const model of installedModels) $('modelPicker').add(new Option(model, model));
  $('modelPicker').add(new Option('Custom…', '__custom__'));
  if (customModel || (name && !installedModels.includes(name)) || !installedModels.length) {
    $('modelPicker').value = '__custom__'; $('customModelField').hidden = false;
  } else {
    $('modelPicker').value = name || installedModels[0];
    $('model').value = $('modelPicker').value;
    $('customModelField').hidden = true;
  }
}
const status = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('error', error); };
const agentUI = setupAgent({request,status,stop:()=>active?.abort()});
// randomUUID requires HTTPS, but getRandomValues also works on a local Wi-Fi HTTP page.
const newChatId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
let chatId = newChatId(), chatStore, chatsReady=false, draftTimer=null;
let preferences = {...defaults};
try { preferences = loadPreferences(userStorage); } catch { /* Fall back to opt-out defaults. */ }
function applyPreferences() {
  document.documentElement.dataset.theme = preferences.darkMode ? 'dark' : 'light';
  for (const key of Object.keys(defaults)) $(key).checked = preferences[key];
  $('storageNotice').textContent = preferences.saveChats ? 'Chats saved to your account.' : 'Chat saving is off. New messages stay in this tab only.';
  document.querySelectorAll('.rating').forEach(row => { row.hidden = !preferences.feedback; });
}
function dataCounts() {
  try {
    const training = JSON.parse(userStorage.getItem('shant-chat:data:training') || '[]');
    const feedback = JSON.parse(userStorage.getItem('shant-chat:data:feedback') || '[]');
    $('dataStatus').textContent = `${training.length} training examples · ${feedback.length} ratings saved locally`;
  } catch { $('dataStatus').textContent = 'Could not read collected data.'; }
}
for (const key of Object.keys(defaults)) {
  $(key).onchange = () => {
    const previous = preferences[key];
    preferences[key] = $(key).checked;
    try { userStorage.setItem('shant-chat:preferences', JSON.stringify(preferences)); }
    catch { preferences[key] = previous; applyPreferences(); $('dataStatus').textContent = 'Setting could not be saved. Browser storage may be full or blocked.'; return; }
    applyPreferences();
    if (key === 'saveChats' && !preferences.saveChats) { clearTimeout(draftTimer); draftTimer=null; }
    if (key === 'saveChats' && preferences.saveChats && (history.length || $('prompt').value)) persistChat();
  };
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const link = document.createElement('a'); link.href = url; link.download = name;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('exportChats').onclick = async () => {
  try { await chatStore?.refresh(); download('swing-chats.json', JSON.stringify(chatStore?.list() || [], null, 2), 'application/json'); }
  catch { storageWarning(); }
};
for (const [button, kind] of [['exportTraining','training'], ['exportFeedback','feedback']]) {
  $(button).onclick = () => {
    try {
      const rows = JSON.parse(userStorage.getItem(`shant-chat:data:${kind}`) || '[]');
      if (!rows.length) { $('dataStatus').textContent = 'No collected data to export yet.'; return; }
      download(`swing-${kind}.jsonl`, rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'application/x-ndjson');
    } catch { $('dataStatus').textContent = 'Export failed. Collected data could not be read.'; }
  };
}
$('clearCollected').onclick = () => {
  if (!confirm('Delete all collected training examples and feedback? Saved chats will stay.')) return;
  try { userStorage.removeItem('shant-chat:data:training'); userStorage.removeItem('shant-chat:data:feedback'); dataCounts(); }
  catch { $('dataStatus').textContent = 'Could not clear collected data.'; }
};
function storageWarning() {
  $('storageNotice').textContent = 'Could not sync chats to your account. Keep this tab open and check the server connection.';
}
function persistChat() {
  clearTimeout(draftTimer); draftTimer=null;
  if (!chatStore || !preferences.saveChats) return;
  $('storageNotice').textContent = 'Saving to your account…';
  const saving=chatStore.save({id:chatId, updated:Date.now(), model:$('model').value, draft:$('prompt').value, messages:history});
  renderChats();
  return saving.then(()=>{ if(preferences.saveChats) $('storageNotice').textContent = chatStore.hasPending() ? 'Saving to your account…' : 'Chats saved to your account.'; renderChats(); }).catch(storageWarning);
}
function showChat(chat) {
  chatId = chat?.id || newChatId();
  history = chat?.messages || [];
  document.querySelectorAll('.message').forEach(m => m.remove());
  $('welcome').hidden = history.length > 0;
  history.forEach(m => addMessage(m.role, m.content));
  $('prompt').value = chat?.draft || '';
  if (chat?.model) $('model').value = chat.model;
  customModel = false; syncModelPicker();
  try { if (preferences.saveChats) chatStore?.select(chatId); } catch { storageWarning(); }
  renderChats(); controls();
}
function renderChats() {
  if (!chatStore) return;
  try {
    $('chatList').replaceChildren();
    for (const chat of chatStore.list()) {
      const row = document.createElement('div'); row.className = 'saved-chat';
      const open = document.createElement('button');
      const title = (chat.messages[0]?.content || chat.draft || 'New chat').slice(0, 55);
      open.textContent = title; open.title = title;
      open.setAttribute('aria-current', String(chat.id === chatId));
      open.disabled = !!active;
      open.onclick = () => { if (!active) { if(draftTimer)persistChat(); showChat(chat); status('Saved chat opened.'); } };
      const remove = document.createElement('button'); remove.textContent = '×';
      remove.setAttribute('aria-label', `Delete chat: ${title}`); remove.disabled = !!active;
      remove.onclick = async () => {
        if (active || !confirm(`Delete saved chat “${title}”?`)) return;
        try { if(draftTimer)await persistChat(); await chatStore.remove(chat.id); if (chat.id === chatId) showChat(null); else renderChats(); }
        catch { storageWarning(); }
      };
      row.append(open, remove); $('chatList').append(row);
    }
  } catch { storageWarning(); }
}
function controls() {
  $('send').disabled = !chatsReady || !!active || settingsBusy || loadingModels || (ollamaEnabled && addressDirty) || !$('model').value.trim();
  $('model').disabled = !!active || settingsBusy;
  $('modelPicker').disabled = !!active || settingsBusy || loadingModels;
  $('ollamaAddress').disabled = !!active || settingsBusy;
  $('saveAddress').disabled = !!active || settingsBusy || location.protocol === 'file:';
  $('refresh').disabled = !!active || settingsBusy || loadingModels;
  $('ollamaEnabled').checked = ollamaEnabled;
  $('ollamaEnabled').disabled = !!active || settingsBusy || loadingModels || location.protocol === 'file:';
  $('ollamaState').textContent = ollamaEnabled ? 'On' : 'Off';
  $('newChat').disabled = !!active;
  $('stop').hidden = !active;
  $('send').hidden = !!active;
  $('chatList').querySelectorAll('button').forEach(button => { button.disabled = !!active; });
  for (const key of ['saveChats','training','feedback']) $(key).disabled = !!active;
}
async function request(url, options = {}) {
  const response = await fetch(url, {...options, headers:{...options.headers, 'X-Swing-User':identity.user.username}});
  const data = await response.json();
  if (response.status === 401) { location.replace('/signin'); throw Error('Please sign in again.'); }
  if (!response.ok) throw Object.assign(Error(data.error || 'Request failed.'),{status:response.status});
  return data;
}
$('signOut').onclick = async () => {
  active?.abort();
  try { if(draftTimer)await persistChat(); await chatStore?.flush(); if(chatStore?.hasPending())throw Error('Some chats have not saved. Retry saving before signing out.'); await request('/api/auth/logout', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); location.replace('/signin'); }
  catch (error) { status(error.message, true); }
};
function addMessage(role, content) {
  $('welcome').hidden = true;
  const article = document.createElement('article'); article.className = `message ${role}`;
  const name = document.createElement('strong'); name.textContent = role === 'user' ? 'YOU' : 'SWING';
  const text = document.createElement('div'); text.className = 'message-content'; renderMessageContent(text, content, {codeBlocks:role === 'assistant'});
  article.append(name, text); $('messages').append(article);
  if (role === 'assistant') {
    const index = Array.from($('messages').querySelectorAll('.message')).indexOf(article);
    const rating = document.createElement('div'); rating.className = 'rating'; rating.hidden = !preferences.feedback;
    for (const [label, value] of [['Helpful', 'helpful'], ['Not helpful', 'not_helpful']]) {
      const button = document.createElement('button'); button.textContent = label;
      button.onclick = () => {
        if (!preferences.feedback) return;
        try {
          collectExample(userStorage, preferences, 'feedback', {chatId, model:$('model').value, rating:value, messages:history.slice(Math.max(0,index-1),index+1), created:new Date().toISOString()});
          rating.querySelectorAll('button').forEach(b => { b.disabled = true; });
          button.textContent = `${label} · Saved`; dataCounts();
        } catch { $('dataStatus').textContent = 'Rating was not saved. Browser storage may be full.'; status('Could not save your rating.', true); }
      };
      rating.append(button);
    }
    article.append(rating);
  }
  $('messages').scrollTop = $('messages').scrollHeight;
  return article;
}
async function models() {
  if (location.protocol === 'file:') {
    status('Preview only. Start Chat.bat, then open http://127.0.0.1:3000 to chat.', true);
    controls();
    return;
  }
  loadingModels = true; controls();
  status('Checking the active AI server…');
  try {
    const data = await request('/api/models');
    installedModels = [...new Set(data.models)];
    $('availableModels').textContent = data.models.length ? `Installed models: ${data.models.join(', ')}` : 'No installed models found on this server.';
    syncModelPicker();
    status(data.models.length ? 'Ready when you are.' : 'No models listed. Install a model on the active server, or choose Custom.', !data.models.length);
  } catch (error) { installedModels = []; syncModelPicker(); $('availableModels').textContent = 'Could not list models from the active server. Check its address and connection.'; status(error.message, true); }
  finally { loadingModels = false; controls(); }
}
async function loadSettings() {
  if (location.protocol === 'file:') { await models(); return; }
  settingsBusy = true; controls();
  try {
    const data = await request('/api/settings');
    ollamaEnabled = data.enabled;
    savedAddress = data.address;
    if (!addressDirty) $('ollamaAddress').value = savedAddress;
    await models();
  } catch (error) { status(error.message, true); }
  finally { settingsBusy = false; controls(); }
}
$('ollamaEnabled').onchange = async event => {
  const enabled = event.target.checked;
  settingsBusy = true; controls();
  try {
    const data = await request('/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({enabled})});
    ollamaEnabled = data.enabled;
    await models();
  } catch (error) { status(error.message, true); }
  finally { settingsBusy = false; controls(); }
};
$('model').oninput = () => { controls(); if (history.length || $('prompt').value) persistChat(); };
$('modelPicker').onchange = () => {
  customModel = $('modelPicker').value === '__custom__';
  if (!customModel) $('model').value = $('modelPicker').value;
  syncModelPicker(); controls();
  if (customModel) $('model').focus();
  if (history.length || $('prompt').value) persistChat();
};
$('prompt').addEventListener('input', () => { if(!preferences.saveChats)return; clearTimeout(draftTimer); draftTimer=setTimeout(persistChat,400); });
window.addEventListener('beforeunload',event=>{if(draftTimer||chatStore?.hasPending()){if(draftTimer)persistChat();event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&draftTimer)persistChat();});
async function refreshAccountChats(){if(!chatStore||active||draftTimer||document.hidden)return;try{await chatStore.refresh();renderChats();}catch{storageWarning();}}
setInterval(refreshAccountChats,10000);
window.addEventListener('focus',refreshAccountChats);
window.addEventListener('storage', event => {
  if (event.key === 'shant-chat:preferences') { try { preferences = loadPreferences(userStorage); applyPreferences(); } catch { storageWarning(); } }
  if (event.key?.startsWith('shant-chat:')) { renderChats(); dataCounts(); }
});
$('ollamaAddress').oninput = () => {
  addressDirty = $('ollamaAddress').value.trim() !== savedAddress;
  if (addressDirty) status('Save the new Ollama address before chatting.');
  controls();
};
$('saveAddress').onclick = async () => {
  settingsBusy = true; controls();
  try {
    const data = await request('/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({address:$('ollamaAddress').value.trim()})});
    savedAddress = data.address; addressDirty = false;
    $('ollamaAddress').value = savedAddress; ollamaEnabled = data.enabled;
    status('Address saved.');
    await models();
  } catch (error) { status(error.message, true); }
  finally { settingsBusy = false; controls(); }
};
// Reconcile the shared setting when returning from another tab.
window.addEventListener('focus', () => { if (!active && !settingsBusy && !loadingModels) loadSettings(); });
$('refresh').onclick = models;
$('newChat').onclick = () => { if (history.length || $('prompt').value) persistChat(); showChat(null); status('New chat started. Earlier chats are in the sidebar.'); $('prompt').focus(); };
$('stop').onclick = () => { active?.abort(); agentUI.cancelReview(); };
document.querySelectorAll('[data-prompt]').forEach(button => { button.onclick = () => { $('prompt').value = button.dataset.prompt; $('prompt').focus(); }; });
$('prompt').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('chatForm').requestSubmit(); } });
$('chatForm').addEventListener('submit', async event => {
  event.preventDefault();
  const text = $('prompt').value.trim();
  if (!text || !chatsReady || active || settingsBusy || loadingModels || (ollamaEnabled && addressDirty) || !$('model').value.trim()) return;
  $('model').value = $('model').value.trim();
  // Keep complete recent turns; older turns are omitted from the model's context.
  const messages = [...history.slice(-18), { role: 'user', content: text }];
  if (new TextEncoder().encode(JSON.stringify({model: $('model').value, messages})).length > 65536) { status('Conversation too large. Start a new chat or shorten your message.', true); return; }
  const bubble = addMessage('user', text);
  persistChat(); // Preserve the prompt as a draft if the page closes mid-reply.
  $('prompt').value = ''; $('prompt').disabled = true;
  active = new AbortController(); controls(); status('Thinking… The first reply may take longer while the model loads.');
  try {
    const agentInput = await agentUI.prepare(text,active.signal);
    const phase=agentInput.agent==='Computer'?'Analyzing your screenshot':agentInput.agent?'Planning the action':'Thinking';
    status(`${phase}… The model may take up to 3 minutes. Stop cancels the request.`);
    const started=Date.now();
    const progress=setInterval(()=>status(`${phase}… ${Math.floor((Date.now()-started)/1000)} seconds. Stop cancels the request.`),1000);
    let data;
    try { data = await request('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({model: $('model').value, messages,...agentInput}), signal: active.signal }); }
    finally { clearInterval(progress); }
    history = [...history, {role:'user', content:text}, {role: 'assistant', content: data.content}];
    try {
      collectExample(userStorage, preferences, 'training', {model:$('model').value, messages:[...messages, {role:'assistant', content:data.content}]});
      dataCounts();
    } catch { $('dataStatus').textContent = 'Training example was not saved. Browser storage may be full.'; }
    persistChat();
    const reply = addMessage('assistant', data.content);
    if (data.proposal) {
      const result = await agentUI.approve(data.proposal,active.signal);
      history.at(-1).content += `\n\n${result}`;
      renderMessageContent(reply.querySelector('.message-content'), history.at(-1).content);
      persistChat();
    }
    status('Ready · The model remembers up to the last 9 exchanges.');
  } catch (error) {
    bubble.remove(); $('prompt').value = text;
    persistChat();
    if (!history.length) $('welcome').hidden = false;
    status(error.name === 'AbortError' ? 'Stopped. Your message is ready to edit or resend.' : error.message, error.name !== 'AbortError');
  } finally { active = null; $('prompt').disabled = false; controls(); $('prompt').focus(); }
});
try {
  chatStore = await createAccountChatStore(request,userStorage,(oldId,newId)=>{if(chatId===oldId)chatId=newId;status('This chat changed on another device. Your version was saved as a separate chat.');});
  chatsReady=true;
  const chats = chatStore.list();
  const selected = chatStore.current();
  showChat(preferences.saveChats ? chats.find(chat => chat.id === selected) || (selected ? null : chats[0]) : null);
} catch { storageWarning(); }
applyPreferences(); dataCounts();
if(!chatsReady)storageWarning();
if(chatStore?.migrationFailed){const notice=document.createElement('p');notice.className='settings-help';notice.textContent='Some older browser chats could not be transferred. They are still stored in this browser. Reopen Swing here to retry.';$('chatList').before(notice);}
loadSettings();


