import {send} from '../lib/repository.js';
import {issuePublisherSession,clearPublisherSession,constantTimeEqual,validPublisherSession,publisherSessionTTL,sameOrigin} from '../lib/publisher-session.js';

export default function handler(req,res){
  const key=process.env.DROP_PORTAL_ADMIN_KEY;
  // A same-origin public status check discloses only whether this browser is
  // already unlocked. Never send secrets or raw cookies in JSON responses.
  if(req.method==='GET'){
    return send(res,200,{unlocked:Boolean(key&&validPublisherSession(req,key)),sessionHours:8});
  }
  if(req.method==='DELETE'){
    if(!sameOrigin(req))return send(res,403,{message:'Cross-origin access denied.'});
    res.setHeader('Set-Cookie',clearPublisherSession());
    return send(res,200,{unlocked:false});
  }
  if(req.method!=='POST'){
    res.setHeader('Allow','GET, POST, DELETE');
    return send(res,405,{message:'Method not allowed.'});
  }
  if(!sameOrigin(req))return send(res,403,{message:'Cross-origin access denied.'});
  if(!key||!process.env.GITHUB_TOKEN)return send(res,503,{message:'Publisher access is not configured.'});
  let body=req.body;
  try{if(typeof body==='string')body=JSON.parse(body);}catch{return send(res,400,{message:'Invalid access request.'});}
  if(!constantTimeEqual(body?.adminKey,key)){
    return send(res,401,{message:'Incorrect admin access code.'});
  }
  res.setHeader('Set-Cookie',issuePublisherSession(key));
  return send(res,200,{unlocked:true,sessionHours:publisherSessionTTL()/3600});
}
