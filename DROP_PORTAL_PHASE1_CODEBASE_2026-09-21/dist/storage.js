export function read(key,fallback){try{return JSON.parse(localStorage.getItem('drop-portal:'+key))??fallback}catch{return fallback}}
export function write(key,value){try{localStorage.setItem('drop-portal:'+key,JSON.stringify(value));return true}catch{return false}}
