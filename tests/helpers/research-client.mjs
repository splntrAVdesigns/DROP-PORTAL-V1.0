import assert from 'node:assert/strict';
export function sqlClient(db){return {async rpc(name,args={}){
  try{
    const keys=Object.keys(args),params=keys.map(k=>k==='p_seeds'?JSON.stringify(args[k]):args[k]);
    const result=await db.query('select * from '+name+'('+keys.map((k,i)=>k+' => $'+(i+1)).join(',')+')',params);
    const scalar=['dp_research_readiness','dp_refresh_retrieval_index','dp_save_embedding'];
    return {data:scalar.includes(name)?result.rows[0][name]:result.rows,error:null};
  }catch(error){return {data:null,error};}
},from(table){
  const conditions=[],params=[];let mode='select',columns='*',values,options={},single=false;
  const ident=s=>{assert.match(s,/^[a-z_][a-z_0-9]*$/);return '"'+s+'"';};
  const q={select(c){columns=c;return q;},maybeSingle(){single=true;return q;},
    eq(k,v){conditions.push(ident(k)+'=$'+(params.push(v)));return q;},
    in(k,v){conditions.push(ident(k)+'=any($'+(params.push(v))+'::text[])');return q;},
    upsert(v,o={}){mode='upsert';values=Array.isArray(v)?v:[v];options=o;return q;},
    update(v){mode='update';values=v;return q;},async then(resolve,reject){try{
      let result;
      if(mode==='upsert'){
        for(const row of values){
          const keys=Object.keys(row),args=keys.map(k=>row[k]&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k]);
          const conflict=options.onConflict.split(',').map(ident).join(',');
          const action=options.ignoreDuplicates?'nothing':'update set '+keys.map(k=>ident(k)+'=excluded.'+ident(k)).join(',');
          await db.query('insert into '+ident(table)+'('+keys.map(ident).join(',')+') values('+keys.map((_,i)=>'$'+(i+1)).join(',')+') on conflict('+conflict+') do '+action,args);
        }result={rows:[]};
      }else if(mode==='update'){
        const assignments=Object.entries(values).map(([k,v])=>ident(k)+'=$'+params.push(v&&typeof v==='object'?JSON.stringify(v):v));
        result=await db.query('update '+ident(table)+' set '+assignments.join(',')+' where '+conditions.join(' and '),params);
      }else result=await db.query('select '+(columns==='*'?'*':columns.split(',').map(ident).join(','))+' from '+ident(table)+(conditions.length?' where '+conditions.join(' and '):''),params);
      resolve({data:single?result.rows[0]||null:result.rows,error:null});
    }catch(error){reject(error);}}};return q;
}};}

