import type { Quote, NewsItem } from './market';
import { normalizeTrade } from './market';

export interface MarketProvider {
 snapshot(symbol:string):Promise<Quote|null>;
 news():Promise<NewsItem[]>;
 connect(symbols:string[],onTrade:(q:Quote)=>void,onStatus:(state:'connected'|'reconnecting'|'error',message?:string)=>void):Promise<()=>void>;
}
// This module is loaded only inside a server handler. Its API is provider-neutral.
export function finnhubProvider(apiKey:string):MarketProvider{
 const baselines=new Map<string,number|null>();
 async function get(path:string){
  const response=await fetch(`https://finnhub.io/api/v1/${path}`,{headers:{'X-Finnhub-Token':apiKey}});
  if(!response.ok) { const detail=await response.text(); throw new Error(`Finnhub [${response.status}]: ${detail.replaceAll(apiKey,'[redacted]')}`); }
  return response.json();
 }
 return {
  async snapshot(symbol){const q=await get(`quote?symbol=${encodeURIComponent(symbol)}`); if(!(q.c>0)||!(q.t>0))return null; const previousClose=q.pc>0?q.pc:null;baselines.set(symbol,previousClose);return {...normalizeTrade(symbol,q.c,q.t*1000,previousClose),source:'snapshot'};},
  async news(){const rows=await get('news?category=general');return rows.slice(0,8).map((r:NewsItem)=>({id:r.id,headline:r.headline,source:r.source,datetime:r.datetime,url:r.url}));},
  async connect(symbols,onTrade,onStatus){
   let stopped=false;let closeSocket:(()=>void)|undefined;let retry:ReturnType<typeof setTimeout>|undefined;let attempts=0;
   async function open(){
    if(stopped)return;
    try{
     const url=`wss://ws.finnhub.io?token=${encodeURIComponent(apiKey)}`;
     type Socket={send:(s:string)=>void;close:()=>void;addEventListener:(type:string,cb:(e:any)=>void)=>void;accept?:()=>void};
     let socket:Socket;
     // Workers use fetch Upgrade for an outbound socket; Node dev uses ws.
     if('WebSocketPair' in globalThis){
      const response=await fetch(url.replace('wss:','https:'),{headers:{Upgrade:'websocket'}});
      const upgraded=(response as Response & {webSocket?:Socket}).webSocket;
      if(!upgraded)throw new Error('This host did not accept the upstream WebSocket upgrade.');
      socket=upgraded;socket.accept?.();
     }else{
      const {default:WebSocket}=await import('ws');
      const nodeSocket=new WebSocket(url);
      await new Promise<void>((resolve,reject)=>{nodeSocket.once('open',resolve);nodeSocket.once('error',()=>reject(new Error('Finnhub WebSocket handshake failed.')));});
      socket=nodeSocket;
     }
     if(stopped){socket.close();return;}
     closeSocket=()=>socket.close();attempts=0;
     for(const symbol of symbols)socket.send(JSON.stringify({type:'subscribe',symbol}));
     onStatus('connected');
     socket.addEventListener('message',(event)=>{
      try{const packet=JSON.parse(String(event.data));
       if(packet.type==='error'){onStatus('error',String(packet.msg??'Finnhub rejected a subscription').replaceAll(apiKey,'[redacted]'));return;}
       if(packet.type==='trade')for(const t of packet.data??[]){if(symbols.includes(t.s)&&t.p>0&&t.t>0)onTrade(normalizeTrade(t.s,t.p,t.t,baselines.get(t.s)??null));}
      }catch{onStatus('error','Unreadable market-data message');}
     });
     const reconnect=()=>{if(stopped||retry)return;onStatus('reconnecting','Reconnecting to Finnhub');retry=setTimeout(()=>{retry=undefined;void open();},Math.min(30000,1000*2**attempts++));};
     socket.addEventListener('close',reconnect);socket.addEventListener('error',()=>{socket.close();reconnect();});
    }catch{if(!stopped){onStatus('reconnecting','Finnhub connection unavailable; retrying');retry=setTimeout(()=>{retry=undefined;void open();},Math.min(30000,2000*2**attempts++));}}
   }
   void open();return ()=>{stopped=true;if(retry)clearTimeout(retry);closeSocket?.();};
  },
 };
}