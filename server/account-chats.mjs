import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import path from 'node:path';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const hash=value=>createHash('sha256').update(value).digest('hex');
export function validateChat(chat) {
  if (!chat || typeof chat.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(chat.id) || !Number.isFinite(chat.updated) || typeof chat.model !== 'string' || chat.model.length>150 || typeof chat.draft !== 'string' || chat.draft.length>12000 || !Array.isArray(chat.messages) || chat.messages.length>4000 || chat.messages.length%2 || chat.messages.some((m,i)=>!m || m.role!==(i%2?'assistant':'user') || typeof m.content!=='string' || m.content.length>100000)) throw fail(400,'Invalid saved chat.');
  const result={id:chat.id,updated:chat.updated,model:chat.model,draft:chat.draft,messages:chat.messages.map(({role,content})=>({role,content}))};
  if(Buffer.byteLength(JSON.stringify(result))>2*1024*1024)throw fail(413,'This chat exceeds the 2 MB save limit. Export it and start a new chat.');
  return result;
}
export function createAccountChats(root) {
  const queues=new Map();
  async function access(username,change) {
    const previous=queues.get(username)||Promise.resolve();
    const job=previous.catch(()=>{}).then(async()=>{
      const filename=path.join(root,hash(username)+'.json');
      let data;
      try { data=JSON.parse(await readFile(filename,'utf8')); }
      catch(error){if(error.code!=='ENOENT')throw error;data={chats:{},deleted:{},imports:{}};}
      const result=await change(data);
      if(result.write){
        const content=JSON.stringify(data);
        if(Buffer.byteLength(content)>50*1024*1024)throw fail(413,'Your account chat storage is full (50 MB). Export and remove older chats.');
        await mkdir(root,{recursive:true});
        const temp=filename+'.'+randomBytes(8).toString('hex')+'.tmp';
        try{await writeFile(temp,content,{flag:'wx',mode:0o600});await rename(temp,filename);}
        finally{await unlink(temp).catch(()=>{});}
      }
      return result.value;
    });
    queues.set(username,job);
    try{return await job;}finally{if(queues.get(username)===job)queues.delete(username);}
  }
  const own=(object,key)=>Object.hasOwn(object,key);
  return {
    list:username=>access(username,data=>({value:Object.values(data.chats).sort((a,b)=>b.updated-a.updated)})),
    save(username,input){
      const chat=validateChat(input.chat);
      if(!Number.isInteger(input.revision)||input.revision<0)throw fail(400,'A chat revision is required.');
      return access(username,data=>{
        const existing=own(data.chats,chat.id)?data.chats[chat.id]:null;
        if((existing?.revision||0)!==input.revision || own(data.deleted,chat.id))throw fail(409,'This chat changed on another device.');
        const saved={...chat,revision:input.revision+1,updated:Date.now()};
        Object.defineProperty(data.chats,chat.id,{value:saved,enumerable:true,writable:true,configurable:true});
        return {write:true,value:saved};
      });
    },
    remove(username,id,revision){
      if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw fail(400,'Invalid chat ID.');
      return access(username,data=>{
        const existing=own(data.chats,id)?data.chats[id]:null;
        if(existing && existing.revision!==revision)throw fail(409,'This chat changed on another device. Refresh before deleting it.');
        delete data.chats[id];
        Object.defineProperty(data.deleted,id,{value:true,enumerable:true,writable:true,configurable:true});
        return {write:true,value:{ok:true}};
      });
    },
    migrate(username,input){
      const chat=validateChat(input);
      const fingerprint=hash(JSON.stringify({...chat,updated:0}));
      return access(username,data=>{
        if(own(data.imports,fingerprint))return {value:{ok:true}};
        if(!own(data.deleted,chat.id)){
          if(own(data.chats,chat.id)){
            const existing=validateChat(data.chats[chat.id]);
            if(hash(JSON.stringify({...existing,updated:0}))!==fingerprint)chat.id='import-'+fingerprint;
          }
          if(!own(data.chats,chat.id)&&!own(data.deleted,chat.id))Object.defineProperty(data.chats,chat.id,{value:{...chat,revision:1},enumerable:true,writable:true,configurable:true});
        }
        data.imports[fingerprint]=true;
        return {write:true,value:{ok:true}};
      });
    }
  };
}
