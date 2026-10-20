import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { activeSymbols,configSchema,type FeedEvent } from '@/lib/market';

export const Route=createFileRoute('/api/ticker-stream')({server:{handlers:{POST:async({request})=>{
 const parsed=z.object({id:z.string().uuid(),key:z.string().min(40).max(100)}).safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:'Invalid request'},{status:400});
 const {id,key}=parsed.data;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {data:channel}=await supabaseAdmin.from('ticker_channels').select('config').eq('id',id).eq('overlay_hash',hash).maybeSingle();if(!channel)return Response.json({error:'Invalid overlay access'},{status:403});
 const apiKey=process.env['FINNHUB_API_KEY'];if(!apiKey)return Response.json({error:'Finnhub key is not configured'},{status:503});
 const owner=crypto.randomUUID();const {data:claimed,error:claimError}=await supabaseAdmin.rpc('claim_ticker_relay',{p_channel:id,p_owner:owner});
 if(claimError)return Response.json({error:claimError.message},{status:503});if(!claimed)return Response.json({error:'Another ticker copy already owns the free-plan connection. Close that OBS source before retrying.'},{status:409});
 let config=configSchema.parse(channel.config);let alive=true;let stopProvider:(()=>void)|undefined;let heartbeat:ReturnType<typeof setInterval>|undefined;let send:(event:FeedEvent)=>void=()=>{};let busy=false;
 const {finnhubProvider}=await import('@/lib/market-provider');const provider=finnhubProvider(apiKey);
 const cleanup=async()=>{if(!alive)return;alive=false;stopProvider?.();if(heartbeat)clearInterval(heartbeat);await supabaseAdmin.from('ticker_relay').update({status:'offline',expires_at:new Date().toISOString()}).eq('id',1).eq('owner_id',owner);};
 const stream=new ReadableStream<Uint8Array>({start(controller){
  send=(event)=>{if(alive)try{controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));}catch{void cleanup();}};
  async function startFeed(){stopProvider?.();send({type:'status',status:'connecting'});
   for(const symbol of activeSymbols(config)){if(!alive)return;try{const quote=await provider.snapshot(symbol);if(quote)send({type:'quote',quote});}catch(e){send({type:'status',status:'error',message:e instanceof Error?e.message:'Quote unavailable'});}}
   if(!alive)return;stopProvider=await provider.connect(activeSymbols(config),quote=>send({type:'quote',quote}),(status,message)=>{send({type:'status',status,message});void supabaseAdmin.from('ticker_relay').update({status}).eq('id',1).eq('owner_id',owner).then(()=>{});});
   if(config.news)try{send({type:'news',items:await provider.news()});}catch{send({type:'news',items:[]});}
  }
  send({type:'config',config});void startFeed();
  heartbeat=setInterval(async()=>{if(!alive||busy)return;busy=true;try{
   controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
   const {data:lease}=await supabaseAdmin.from('ticker_relay').update({expires_at:new Date(Date.now()+45000).toISOString()}).eq('id',1).eq('owner_id',owner).select('owner_id').maybeSingle();if(!lease){send({type:'status',status:'duplicate'});await cleanup();controller.close();return;}
   const {data:updated}=await supabaseAdmin.from('ticker_channels').select('config').eq('id',id).maybeSingle();if(updated){const next=configSchema.parse(updated.config);if(JSON.stringify(next)!==JSON.stringify(config)){const changed=JSON.stringify(activeSymbols(next))!==JSON.stringify(activeSymbols(config))||next.news!==config.news;config=next;send({type:'config',config});if(changed)void startFeed();}}
  }catch{send({type:'status',status:'reconnecting',message:'Connection interrupted'});}finally{busy=false;}},10000);
  request.signal.addEventListener('abort',()=>{void cleanup();try{controller.close();}catch{}},{once:true});
 },cancel(){void cleanup();}});
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}});
}}}});