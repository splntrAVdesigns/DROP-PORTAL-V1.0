import {publisherRequest,acceptPublisherState} from './schedule.js';
const API='/api/inquiry';
export async function loadInquiry(){return acceptPublisherState(await publisherRequest(API+'?v='+Date.now()));}
export async function saveInquiry({scope,profile,clear=false,adminKey,expectedRevision}) {
  return acceptPublisherState(await publisherRequest(API,{method:'POST',headers:{'Content-Type':'application/json','X-DROP-PORTAL-ADMIN-KEY':adminKey||''},body:JSON.stringify({scope,profile,clear,expectedRevision})}));
}

// One request saves the selected Tuner tab and next publication time atomically.
export async function saveDropSettings({scope,profile,date,time,mode,adminKey,expectedRevision}) {
  return acceptPublisherState(await publisherRequest('/api/drop-settings',{method:'POST',headers:{'Content-Type':'application/json','X-DROP-PORTAL-ADMIN-KEY':adminKey||''},body:JSON.stringify({scope,profile,date,time,mode,expectedRevision})}));
}
