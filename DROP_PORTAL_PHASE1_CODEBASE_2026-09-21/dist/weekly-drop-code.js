export function weeklyDropCode(drop){return drop?.kind==='weekly'&&Number.isSafeInteger(drop.weekly_sequence)&&drop.weekly_sequence>0?'DROP'+String(drop.weekly_sequence).padStart(3,'0'):'';}
