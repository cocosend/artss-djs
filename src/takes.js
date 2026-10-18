const DB='artss-live-takes-v1';
function connect(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window))return reject(Error('IndexedDB unavailable'));const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('takes'))req.result.createObjectStore('takes',{keyPath:'id',autoIncrement:true});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function run(mode,operation){const db=await connect();return new Promise((resolve,reject)=>{const tx=db.transaction('takes',mode),store=tx.objectStore('takes'),req=operation(store);let value;req.onsuccess=()=>{value=req.result;};req.onerror=()=>{};tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error);};});}
export const saveTake=(blob,extension)=>run('readwrite',store=>store.add({blob,extension,time:Date.now()}));
export const listTakes=()=>run('readonly',store=>store.getAll());
export const getTake=id=>run('readonly',store=>store.get(id));
export const deleteTake=id=>run('readwrite',store=>store.delete(id));
export function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}