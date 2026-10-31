export const LOCALE_KEY='evidarium.locale';
/** @param {{query?:string|null,stored?:string|null,browser?:string}} options */
export function resolveLocale({query=null,stored=null,browser='en'}={}){return ['en','ar'].includes(query)?query:['en','ar'].includes(stored)?stored:String(browser).toLowerCase().startsWith('ar')?'ar':'en';}
export function interpolate(message,params={}){return message.replace(/\{([a-zA-Z_][\w]*)\}/g,(all,key)=>Object.hasOwn(params,key)?String(params[key]):all);}
export function localeTag(locale){return locale==='ar'?'ar-EG-u-nu-latn':'en-GB';}
export function formatLocaleNumber(value,locale='en',options={}){return new Intl.NumberFormat(localeTag(locale),options).format(value);}
export function formatLocaleDate(value,locale='en',options){const date=new Date(value);if(!Number.isFinite(date.getTime()))return '—';return new Intl.DateTimeFormat(localeTag(locale),options||{dateStyle:'medium',timeStyle:'short'}).format(date);}
export function formatLocaleBytes(value,locale='en'){const n=Math.max(0,Number(value)||0),units=locale==='ar'?['بايت','ك.بايت','م.بايت','ج.بايت']:['B','KiB','MiB','GiB'];const i=n>=1024**3?3:n>=1024**2?2:n>=1024?1:0;return formatLocaleNumber(n/1024**i,locale,{maximumFractionDigits:i?1:0})+' '+units[i];}
export function pluralCategory(value,locale='en'){return new Intl.PluralRules(localeTag(locale)).select(value);}
