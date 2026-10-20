import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { configSchema, defaultConfig } from './market';
const access=z.object({id:z.string().uuid(),key:z.string().min(40).max(100)});
async function fingerprint(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}

export const createChannel=createServerFn({method:'POST'}).inputValidator((value:unknown)=>z.object({token:z.string().min(20).max(6000),controlKey:z.string().min(40).max(100),overlayKey:z.string().min(40).max(100)}).parse(value)).handler(async({data})=>{
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {data:auth,error}=await supabaseAdmin.auth.getUser(data.token);if(error||!auth.user)throw new Error('Sign in to create your private ticker.');
 const {data:existing}=await supabaseAdmin.from('ticker_channels').select('id').eq('user_id',auth.user.id).limit(1).maybeSingle();
 const keys={control_hash:await fingerprint(data.controlKey),overlay_hash:await fingerprint(data.overlayKey)};
 if(existing){const {error:e}=await supabaseAdmin.from('ticker_channels').update(keys).eq('id',existing.id);if(e)throw new Error(e.message);return {id:existing.id};}
 const {data:row,error:e}=await supabaseAdmin.from('ticker_channels').insert({...keys,user_id:auth.user.id,config:defaultConfig}).select('id').single();if(e||!row)throw new Error(e?.message??'Unable to create ticker');return {id:row.id};
});
export const readChannel=createServerFn({method:'POST'}).inputValidator((value:unknown)=>access.extend({role:z.enum(['control','overlay'])}).parse(value)).handler(async({data})=>{
 const hash=await fingerprint(data.key);const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {data:row,error}=await supabaseAdmin.from('ticker_channels').select('config,previous_config,presets').eq('id',data.id).eq(data.role==='control'?'control_hash':'overlay_hash',hash).maybeSingle();
 if(error)throw new Error(error.message);if(!row)throw new Error('This access link is invalid or has been replaced.');
 const {data:relay}=await supabaseAdmin.from('ticker_relay').select('status,expires_at,duplicate_at,channel_id').eq('id',1).maybeSingle();
 return {config:configSchema.parse(row.config),presets:row.presets as Record<string,unknown>,previous:row.previous_config,relay:relay&&Date.parse(relay.expires_at)>Date.now()?relay:null};
});
export const saveChannel=createServerFn({method:'POST'}).inputValidator((value:unknown)=>access.extend({config:configSchema,action:z.enum(['apply','restore','preset']),name:z.string().max(40).optional()}).parse(value)).handler(async({data})=>{
 const hash=await fingerprint(data.key);const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {data:row}=await supabaseAdmin.from('ticker_channels').select('config,previous_config,presets').eq('id',data.id).eq('control_hash',hash).maybeSingle();if(!row)throw new Error('Invalid dashboard access link.');
 const updates=data.action==='preset'?{presets:{...(row.presets as Record<string,unknown>),[data.name||'Untitled']:data.config}}:{config:data.action==='restore'?(row.previous_config??defaultConfig):data.config,previous_config:row.config};
 const {error}=await supabaseAdmin.from('ticker_channels').update(updates).eq('id',data.id);if(error)throw new Error(error.message);return {ok:true};
});