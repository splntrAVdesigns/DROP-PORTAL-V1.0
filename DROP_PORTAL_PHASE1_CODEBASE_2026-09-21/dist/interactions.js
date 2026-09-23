export function mergeInteractions(a={},b={}) {
  const result={};
  for(const id of new Set([...Object.keys(a||{}),...Object.keys(b||{})])){
    const left=a?.[id]||{},right=b?.[id]||{};
    result[id]={...left,...right,updatedAt:Math.max(left.updatedAt||0,right.updatedAt||0),stamps:{}};
    for(const key of ['saved','heard','hidden']){
      const lt=left.stamps?.[key]??left.updatedAt??0,rt=right.stamps?.[key]??right.updatedAt??0;
      const useRight=key in right&&(!(key in left)||rt>=lt);
      if(key in left||key in right){result[id][key]=!!(useRight?right[key]:left[key]);result[id].stamps[key]=useRight?rt:lt;}
    }
  }
  return result;
}
export function updateInteraction(state,id,key,value,now=Date.now()) {
  const next=mergeInteractions(state,{});next[id]??={stamps:{}};
  next[id][key]=value;next[id].updatedAt=now;next[id].stamps[key]=now;return next;
}
