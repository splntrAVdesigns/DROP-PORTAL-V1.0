export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({message:'Method not allowed.'});
  return res.status(200).json({active:process.env.DROP_PORTAL_PRIVATE_ENABLED==='true'&&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.DROP_PORTAL_WORKER_SECRET)});
}
