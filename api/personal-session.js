import {personalConfigured,personalClient,allowedEmail,cookie,refreshCookie,accessCookie,sessionCookies,clearPersonalCookies,authenticatePersonal,requirePersonalOrigin,personalBody,personalReply,personalFailure} from '../lib/personal-backend.js';
export function makeSessionHandler(deps={}){
  const configured=deps.configured||personalConfigured,clientFactory=deps.clientFactory||personalClient,authenticate=deps.authenticate||authenticatePersonal,emailAllowed=deps.emailAllowed||allowedEmail;
  return async(req,res)=>{try{
    if(req.method==='GET'){
      if(!configured())return personalReply(res,200,{configured:false,user:null});
      try{const {user}=await authenticate(req);return personalReply(res,200,{configured:true,user:{id:user.id,email:user.email}});}
      catch(e){if(e.status===401)return personalReply(res,200,{configured:true,user:null,canRefresh:Boolean(cookie(req,refreshCookie))});throw e;}
    }
    if(!['POST','DELETE'].includes(req.method))return personalReply(res,405,{message:'Method not allowed.'});
    requirePersonalOrigin(req);
    if(req.method==='DELETE'){
      // Revoke the refresh session before reporting successful sign-out.
      const token=cookie(req,accessCookie),refresh=cookie(req,refreshCookie);
      if(configured()&&refresh){
        const client=clientFactory();const {error}=await client.auth.refreshSession({refresh_token:refresh});
        if(!error){const result=await client.auth.signOut({scope:'local'});if(result.error)throw result.error;}else if(![400,401,403].includes(error.status))throw error;
      }
      res.setHeader('Set-Cookie',clearPersonalCookies());return personalReply(res,200,{user:null});
    }
    if(!configured())return personalReply(res,503,{message:'Personal accounts are awaiting setup.'});
    const body=personalBody(req),client=clientFactory();
    if(body.action==='refresh'){
      const token=cookie(req,refreshCookie);if(!token)return personalReply(res,401,{message:'Please sign in.'});
      const {data,error}=await client.auth.refreshSession({refresh_token:token});
      if(error||!data.session||!emailAllowed(data.user?.email)){res.setHeader('Set-Cookie',clearPersonalCookies());return personalReply(res,401,{message:'Please sign in again.'});}
      res.setHeader('Set-Cookie',sessionCookies(data.session));return personalReply(res,200,{user:{id:data.user.id,email:data.user.email}});
    }
    const email=String(body.email||'').trim().toLowerCase();
    if(email.length>254||!email.includes('@')||!emailAllowed(email))return personalReply(res,403,{message:'This account is not on the private beta list.'});
    if(body.action==='request-code'){
      const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true}});
      if(error)return personalReply(res,429,{message:'A sign-in code could not be sent. Wait a minute and retry.'});
      return personalReply(res,200,{sent:true});
    }
    if(body.action==='verify-code'){
      if(typeof body.code!=='string'||!/^\d{6,8}$/.test(body.code))return personalReply(res,400,{message:'Enter the email verification code.'});
      const {data,error}=await client.auth.verifyOtp({email,token:body.code,type:'email'});
      if(error||!data.session||!emailAllowed(data.user?.email))return personalReply(res,401,{message:'The code is invalid or expired.'});
      res.setHeader('Set-Cookie',sessionCookies(data.session));return personalReply(res,200,{user:{id:data.user.id,email:data.user.email}});
    }
    return personalReply(res,400,{message:'Unknown account action.'});
  }catch(e){return personalFailure(res,e);}};
}
export default makeSessionHandler();
