const replies={brainstorm:'Try starting small: a weekend project, a question you keep coming back to, or an idea you haven’t found the words for yet.',draft:'A useful first draft starts with three things: who it’s for, what you want to say, and how you want it to feel.'};
document.querySelectorAll('[data-idea]').forEach(button=>button.addEventListener('click',()=>{
  if(button.dataset.idea==='agent'){document.querySelector('#agent').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});return;}
  const reply=document.querySelector('#idea-reply');reply.hidden=false;reply.textContent='Example response: '+replies[button.dataset.idea];
}));
const result=document.querySelector('#demo-result'),actions=document.querySelector('.review-actions'),reset=document.querySelector('#reset-demo');
function finishDemo(approved){actions.hidden=true;result.hidden=false;reset.hidden=false;document.querySelector('#review-title').textContent=approved?'A little progress. Just like that.':'Your call. Every time.';result.textContent=approved?'Demo complete: Ideas would be created in your Agent workspace. No files were changed.':'Action cancelled. In Swing, nothing runs until you approve it.';reset.focus();}
document.querySelector('#approve-demo').onclick=()=>finishDemo(true);document.querySelector('#cancel-demo').onclick=()=>finishDemo(false);
reset.onclick=()=>{actions.hidden=false;result.hidden=true;reset.hidden=true;document.querySelector('#review-title').textContent='A small step, ready for review.';document.querySelector('#approve-demo').focus();};
const dialog=document.querySelector('#film-dialog'),film=document.querySelector('#film');
document.querySelectorAll('.watch').forEach(button=>button.onclick=()=>{dialog.showModal();film.play().catch(()=>{});});
document.querySelector('#close-film').onclick=()=>dialog.close();dialog.addEventListener('close',()=>film.pause());dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
