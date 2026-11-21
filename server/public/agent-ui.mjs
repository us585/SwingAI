export async function agentRequest(request,url,body={},signal,timeout=30000) {
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  let expired=false;
  if(signal?.aborted)cancel();
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>{expired=true;controller.abort();},timeout);
  try {
    return await request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
  }catch(error){
    if(expired)throw Error(url.endsWith('/capture')?'Screenshot capture timed out. Check that the PC is awake and unlocked, then try again.':'The agent request timed out. Check the PC connection and try again.');
    throw error;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
export function setupAgent({request,status,stop}) {
  let enabled = false, desktopAllowed = false, pendingClose = null;
  let lastScreen = null;
  const bar = document.createElement('div'); bar.className = 'agent-bar';
  const label = document.createElement('label'); label.className = 'switch';
  const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.role = 'switch'; toggle.setAttribute('aria-label','Agent mode'); toggle.disabled = true;
  const track = document.createElement('span'); track.className = 'switch-track'; track.setAttribute('aria-hidden','true');
  const title = document.createElement('span'); title.textContent = 'Agent';
  label.append(toggle,track,title);
  const help = document.createElement('span'); help.textContent = 'Off';
  bar.append(label,help);
  document.getElementById('messages').before(bar);
  const prompt = document.getElementById('prompt');
  const menu = document.createElement('div'); menu.className = 'agent-menu'; menu.hidden = true;
  menu.setAttribute('aria-label','Agent features');
  prompt.before(menu);
  for (const name of ['Files','Computer']) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = `@${name}`;
    button.onclick = () => { prompt.value = prompt.value.replace(/@\w*$/,`@${name} `); menu.hidden = true; prompt.focus(); prompt.dispatchEvent(new Event('input')); };
    menu.append(button);
  }
  function suggestions() { menu.hidden = !enabled || !/@\w*$/.test(prompt.value); }
  prompt.addEventListener('input',suggestions);
  prompt.addEventListener('keydown',event=>{if(event.key === 'Escape') menu.hidden=true;});
  const dialog = document.createElement('dialog'); dialog.className = 'agent-review';
  dialog.setAttribute('aria-label','Review agent action'); document.body.append(dialog);
  function review(heading,description,details,image,approveText) {
    return new Promise(resolve=>{
      dialog.replaceChildren();
      const h = document.createElement('h2'); h.textContent=heading;
      const p = document.createElement('p'); p.textContent=description;
      dialog.append(h,p);
      if(image) { const img=document.createElement('img'); img.src=`data:image/png;base64,${image}`; img.alt='Primary PC screen captured for this request'; dialog.append(img); }
      if(details) { const pre=document.createElement('pre'); pre.textContent=details; dialog.append(pre); }
      const row=document.createElement('div'); row.className='agent-review-actions';
      const cancel=document.createElement('button'); cancel.textContent='Cancel';
      const approve=document.createElement('button'); approve.textContent=approveText;
      const finish=value=>{ dialog.close(); pendingClose=null; resolve(value); };
      cancel.onclick=()=>finish(false); approve.onclick=()=>finish(true);
      dialog.oncancel=event=>{event.preventDefault();finish(false);};
      pendingClose=()=>finish(false);
      row.append(cancel,approve);dialog.append(row);dialog.showModal();cancel.focus();
    });
  }
  const post=(url,body={},signal)=>agentRequest(request,url,body,signal);
  toggle.onchange=async()=>{
    const next=toggle.checked; toggle.disabled=true;
    if(!next) { stop(); pendingClose?.(); }
    try {
      const result=await post('/api/agent/settings',{enabled:next}); enabled=result.enabled;
      help.textContent=enabled ? 'Type @Files or @Computer' : 'Off';
      status(enabled ? 'Agent mode on. Actions require your approval.' : 'Agent mode off.');
    } catch(error) { status(error.message,true); }
    finally { toggle.checked=enabled;toggle.disabled=false;suggestions(); }
  };
  request('/api/agent/status').then(result=>{
    enabled=result.enabled;desktopAllowed=result.desktopAllowed;toggle.checked=enabled;toggle.disabled=false;
    help.textContent=enabled?'Type @Files or @Computer':'Off';
    bar.title=`Files workspace: ${result.workspace}`;
  }).catch(error=>{help.textContent='Unavailable';status(error.message,true);});
  return {
    async prepare(text,signal) {
      const feature=/(?:^|\s)@(Files|Computer)\b/i.exec(text);
      if(!feature) return {};
      if(!enabled) throw Error('Turn on Agent mode before using @Files or @Computer.');
      const agent=feature[1].toLowerCase()==='files'?'Files':'Computer';
      menu.hidden=true;
      if(agent==='Files') return {agent};
      if(!desktopAllowed) throw Error('For @Computer, sign in with the original account. The server must run on Windows. @Files works for other accounts.');
      const agreed=await review('Capture your PC screen?', 'Swing will capture the primary screen in 5 seconds. Bring the target window to the front. You can review the screenshot before sending it to your configured AI server. A vision-capable model is required.',null,null,'Capture in 5 seconds');
      if(!agreed || signal.aborted) throw new DOMException('Cancelled','AbortError');
      let remaining=5;
      status('Capturing in 5 seconds—bring the target window to the front.');
      const countdown=setInterval(()=>{remaining--;status(remaining>0?`Capturing in ${remaining} seconds—bring the target window to the front.`:'Capturing the PC screen… Stop cancels this request.');},1000);
      let capture;
      try { capture=await post('/api/agent/capture',{},signal); }
      finally { clearInterval(countdown); }
      lastScreen=capture.image;
      if(signal.aborted) throw new DOMException('Cancelled','AbortError');
      status('Screenshot captured. Review it before sending it to the AI.');
      const share=await review('Send this screenshot to the AI?', 'Only this screenshot and your request will be sent to the AI server configured in Settings. Cancel if private information is visible.',null,capture.image,'Send screenshot');
      if(!share || signal.aborted) { await post('/api/agent/cancel'); throw new DOMException('Cancelled','AbortError'); }
      return {agent,captureId:capture.id};
    },
    async approve(proposal,signal) {
      const a=proposal.action;
      const details=a.type==='write_file' ? `File: ${a.path}\n\nCURRENT CONTENTS\n${a.previous ?? '(new file)'}\n\nPROPOSED CONTENTS\n${a.content}` : JSON.stringify(a,null,2);
      const description=a.type==='click' ? 'This will click your PC at the coordinates below, after a 5-second delay. Bring the same target window back to the front. Approve only if the click is safe and the screen has not changed.' : 'This action is limited to your account’s Agent workspace on the PC. Review the exact path and contents below.';
      const approved=await review('Review agent action',description,details,a.type==='click'?lastScreen:null,a.type==='click'?'Approve click in 5 seconds':'Approve action');
      lastScreen=null;
      if(!approved || signal.aborted || !enabled) { await post('/api/agent/cancel').catch(()=>{}); return 'Action cancelled. No action was run.'; }
      status(a.type==='click'?'Click in 5 seconds—bring the target window to the front.':'Running approved action…');
      try { const result=await post('/api/agent/execute',{id:proposal.id},signal); return result.content; }
      catch(error) { return `Action failed: ${error.message}`; }
    },
    cancelReview() { pendingClose?.(); post('/api/agent/cancel').catch(()=>{}); }
  };
}
