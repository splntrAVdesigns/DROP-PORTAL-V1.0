export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({message:'Method not allowed.'});
  const requested=process.env.DROP_PORTAL_PRIVATE_ENABLED==='true';
  const ready=Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.SUPABASE_URL&&process.env.SUPABASE_ANON_KEY&&process.env.DROP_PORTAL_BETA_EMAILS&&process.env.DROP_PORTAL_WORKER_SECRET?.length>=32);
  return res.status(200).json({active:requested&&ready,state:requested?(ready?'ready':'setup_required'):'setup_required'});
}
