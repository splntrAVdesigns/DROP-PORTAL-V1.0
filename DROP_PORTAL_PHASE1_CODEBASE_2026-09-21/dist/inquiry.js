const API='/api/inquiry';

async function json(options){
  const response=await fetch(API,{cache:'no-store',...options});
  let body=null;
  try{body=await response.json()}catch{}
  if(!response.ok){
    const error=new Error(body?.message||('Tuner request failed '+response.status));
    error.status=response.status;
    error.code=body?.error||null;
    throw error;
  }
  return body;
}
export async function saveInquiry({scope,profile,clear=false,adminKey}){
  return json({
    method:'POST',
    headers:{'Content-Type':'application/json','X-DROP-PORTAL-ADMIN-KEY':adminKey||''},
    body:JSON.stringify({scope,profile,clear})
  });
}
