import {createChatStore} from './chat-store.mjs';
export async function createAccountChatStore(request,storage,onConflict=()=>{}) {
  const post=(route,body)=>request(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:false});
  let current=null,cache=new Map(),revisions=new Map(),chain=Promise.resolve(),pending=0,version=0;
  const aliases=new Map();
  const failed=new Set();
  const resolve=id=>{while(aliases.has(id))id=aliases.get(id);return id;};
  async function refresh(){
    if(pending||failed.size)return;
    const started=version;
    const data=await request('/api/chats');if(pending||failed.size||version!==started)return;
    version++;
    const currentRevision=revisions.get(current);
    cache=new Map(data.chats.map(c=>[c.id,c]));revisions=new Map(data.chats.map(c=>[c.id,c.revision]));
    // Refreshing the sidebar must not authorize overwriting a newer remote turn
    // with the older conversation still displayed in this tab.
    if(currentRevision!==undefined)revisions.set(current,currentRevision);
  }
  function enqueue(task){pending++;const job=chain.catch(()=>{}).then(task);chain=job;return job.finally(()=>pending--);}
  await refresh();
  // Only remove an old browser record after the server confirms the exact copy.
  let migrationFailed=false;
  try {
    const legacy=createChatStore(storage);current=legacy.current();
    for(const chat of legacy.list()){
      const key='shant-chat:v1:'+chat.id,raw=storage.getItem(key);
      try{await post('/api/chats/import',{chat});if(storage.getItem(key)===raw)storage.removeItem(key);}
      catch{migrationFailed=true;}
    }
    if(!migrationFailed)storage.removeItem('shant-chat:current');
  }catch{migrationFailed=true;}
  await refresh();
  return {
    migrationFailed,
    list:()=>[...cache.values()].sort((a,b)=>b.updated-a.updated),
    current:()=>current,
    select:id=>{version++;current=resolve(id);if(cache.get(current)?.revision!==undefined)revisions.set(current,cache.get(current).revision);},
    refresh,
    flush:()=>chain,
    hasPending:()=>pending>0||failed.size>0,
    save(input){
      version++;
      const snapshot=JSON.parse(JSON.stringify(input));
      snapshot.id=resolve(snapshot.id);cache.set(snapshot.id,snapshot);current=snapshot.id;
      return enqueue(async()=>{
        snapshot.id=resolve(snapshot.id);
        let response;
        try{response=await post('/api/chats/save',{chat:snapshot,revision:revisions.get(snapshot.id)||0});}
        catch(error){
          if(error.status!==409)throw error;
          const old=snapshot.id;
          const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
          const latest=cache.get(old)||snapshot;
          response=await post('/api/chats/save',{chat:{...snapshot,id},revision:0});
          aliases.set(old,id);cache.delete(old);cache.set(id,{...latest,id});snapshot.id=id;
          failed.delete(old);
          if(current===old)current=id;
          onConflict(old,id);
        }
        revisions.set(snapshot.id,response.chat.revision);
        failed.delete(snapshot.id);
        // Keep any newer draft that was queued during this request.
        if(cache.get(snapshot.id)===snapshot)cache.set(snapshot.id,response.chat);
        return response.chat;
      }).catch(error=>{failed.add(resolve(snapshot.id));throw error;});
    },
    remove(id){version++;return enqueue(async()=>{id=resolve(id);await post('/api/chats/delete',{id,revision:revisions.get(id)||0});cache.delete(id);revisions.delete(id);failed.delete(id);});}
  };
}
