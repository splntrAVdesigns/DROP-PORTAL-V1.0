import {fetchWeeklyFeed,commitWeeklyFeed} from './feed.js';
// Staging avoids replacing an active provider iframe or an in-progress edit.
export function createFeedRefresh({canApply,onApplied,onPending,onError,fetchFeed=fetchWeeklyFeed,commitFeed=commitWeeklyFeed}) {
  let running=false,pending=null;
  function flush(){if(!pending||!canApply())return false;const candidate=pending;pending=null;commitFeed(candidate);onApplied();onPending(false);return true;}
  async function check(){
    if(running)return;running=true;
    try{const candidate=await fetchFeed();if(candidate){pending=candidate;if(!flush())onPending(true);}else {if(!flush()&&!pending)onPending(false);}}
    catch(error){onError(error);}
    finally{running=false;}
  }
  return {check,flush};
}
