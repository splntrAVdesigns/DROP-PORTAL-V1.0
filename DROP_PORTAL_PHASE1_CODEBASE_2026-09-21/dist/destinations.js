const PROVIDERS={
  'bandcamp.com':'BANDCAMP',
  'soundcloud.com':'SOUNDCLOUD',
  'music.apple.com':'APPLE MUSIC',
  'open.spotify.com':'SPOTIFY',
  'beatport.com':'BEATPORT',
  'junodownload.com':'JUNO DOWNLOAD'
};

function externalUrl(value){
  try{const url=new URL(value);return url.protocol==='https:'?url:null}catch{return null}
}

function providerFor(url){
  const host=url.hostname.toLowerCase().replace(/^www\./,'');
  const key=Object.keys(PROVIDERS).find(domain=>host===domain||host.endsWith('.'+domain));
  return key?PROVIDERS[key]:host.replace(/^([^.]+\.)?/,'').split('.')[0].toUpperCase();
}

function normalizeEmbedUrl(value,provider){
  const url=externalUrl(value);if(!url)return null;
  if(provider==='BANDCAMP'&&url.hostname.toLowerCase().replace(/^www\./,'')==='bandcamp.com'&&url.pathname.startsWith('/EmbeddedPlayer/')){
    let href=url.href;
    href=/\/bgcol=[^/]+/.test(href)?href.replace(/\/bgcol=[^/]+/,'/bgcol=333333'):href.replace(/\/$/,'/bgcol=333333/');
    href=/\/linkcol=[^/]+/.test(href)?href.replace(/\/linkcol=[^/]+/,'/linkcol=04d9ff'):href.replace(/\/$/,'/linkcol=04d9ff/');
    return href;
  }
  return url.href;
}

function inferredRoles(kind,provider){
  const value=String(kind||'').toLowerCase();
  const roles=new Set();
  if(value.includes('listen')||value.includes('stream'))roles.add('listen');
  if(value.includes('store')||value.includes('buy')||value.includes('purchase'))roles.add('buy');
  if(value.includes('evidence')||value.includes('source'))roles.add('evidence');
  if(provider==='BANDCAMP'){roles.add('listen');roles.add('buy')}
  if(provider==='SOUNDCLOUD'||provider==='SPOTIFY'||provider==='APPLE MUSIC')roles.add('listen');
  if(!roles.size)roles.add('evidence');
  return roles;
}

export function destinations(item){
  const byUrl=new Map();
  for(const link of Array.isArray(item?.links)?item.links:[]){
    const url=externalUrl(link?.url);if(!url)continue;
    const provider=providerFor(url),roles=inferredRoles(link.kind,provider);
    const existing=byUrl.get(url.href);
    if(existing){for(const role of roles)existing.roles.add(role);continue}
    byUrl.set(url.href,{url:url.href,provider,roles,label:typeof link.label==='string'?link.label:null});
  }
  return[...byUrl.values()];
}

export function primaryListen(item){return destinations(item).find(d=>d.roles.has('listen'))||null}
export function primaryBuy(item){return destinations(item).find(d=>d.roles.has('buy'))||null}

export function directPreview(item){
  const preview=item?.preview;
  if(!preview||preview.kind!=='direct-audio'||typeof preview.previewUrl!=='string')return null;
  const local=preview.previewUrl.startsWith('/');
  if(!local&&!externalUrl(preview.previewUrl))return null;
  return preview;
}

export function embedPreview(item){
  const preview=item?.preview;
  if(preview?.kind==='provider-embed'&&externalUrl(preview.embedUrl)){
    const provider=preview.provider||'AUTHORIZED PROVIDER';
    return{url:normalizeEmbedUrl(preview.embedUrl,provider),provider};
  }
  const soundcloud=destinations(item).find(d=>d.provider==='SOUNDCLOUD'&&d.roles.has('listen'));
  if(soundcloud){
    const params=new URLSearchParams({url:soundcloud.url,color:'#04d9ff',auto_play:'false',hide_related:'true',show_comments:'false',show_user:'true',show_reposts:'false',visual:'false'});
    return{url:'https://w.soundcloud.com/player/?'+params.toString(),provider:'SOUNDCLOUD'};
  }
  return null;
}

export function formatReleaseDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [year,month,day]=value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,day))).toUpperCase();
}
