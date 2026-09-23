import {publisherRequest,acceptPublisherState} from './schedule.js';
const API='/api/inquiry';
export async function loadInquiry(){return acceptPublisherState(await publisherRequest(API+'?v='+Date.now()));}
export async function saveInquiry({scope,profile,clear=false,adminKey,expectedRevision}) {
  return acceptPublisherState(await publisherRequest(API,{method:'POST',headers:{'Content-Type':'application/json','X-DROP-PORTAL-ADMIN-KEY':adminKey||''},body:JSON.stringify({scope,profile,clear,expectedRevision})}));
}
