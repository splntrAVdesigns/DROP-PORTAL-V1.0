import {validDate,localDate,SEARCH_PAST} from './contracts.js';

const months={'1mo':1,'3mo':3,'6mo':6,'1yr':12};
function shiftMonths(date,count){
  const [year,month,day]=date.split('-').map(Number);
  const start=new Date(Date.UTC(year,month-1+count,1));
  const last=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
  start.setUTCDate(Math.min(day,last));
  return start.toISOString().slice(0,10);
}
export function resolveSearchWindow(spec,now=new Date()){
  if(typeof spec==='string')spec={kind:'rolling',duration:spec};
  if(spec?.kind==='rolling'&&SEARCH_PAST.includes(spec.duration)){
    const to=localDate(now);
    return {kind:'rolling',duration:spec.duration,from:shiftMonths(to,-months[spec.duration]),to};
  }
  // Internal contract for a later Archive Dive UI. Its retrieval can resume
  // across runs; the current Tuner exposes only bounded rolling windows.
  if(spec?.kind==='year'&&Number.isInteger(spec.year)&&spec.year>=1980&&spec.year<=now.getUTCFullYear())
    return {kind:'year',year:spec.year,from:`${spec.year}-01-01`,to:`${spec.year}-12-31`};
  if(spec?.kind==='era'&&Number.isInteger(spec.fromYear)&&Number.isInteger(spec.toYear)&&
    spec.fromYear>=1980&&spec.toYear<=now.getUTCFullYear()&&spec.toYear>=spec.fromYear)
    return {kind:'era',fromYear:spec.fromYear,toYear:spec.toYear,from:`${spec.fromYear}-01-01`,to:`${spec.toYear}-12-31`};
  throw Error('Invalid historical search window');
}
export function windowSlices(window){
  if(!validDate(window?.from)||!validDate(window?.to)||window.from>window.to)throw Error('Invalid search date range');
  const slices=[];
  let from=window.from;
  while(from<=window.to){
    const [year,month]=from.split('-').map(Number);
    const monthEnd=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    const to=monthEnd<window.to?monthEnd:window.to;
    slices.push({from,to});
    from=new Date(Date.parse(to+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  }
  return slices;
}
export const inWindow=(date,window)=>validDate(date)&&date>=window.from&&date<=window.to;
