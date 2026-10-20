import {createFileRoute} from '@tanstack/react-router';
import {registry,symbolSchema} from '@/lib/market';
export const Route=createFileRoute('/api/logo')({server:{handlers:{GET:async({request})=>{
 const params=new URL(request.url).searchParams;const symbol=symbolSchema.safeParse(params.get('symbol'));if(!symbol.success)return new Response(null,{status:400});
 let domain=registry[symbol.data]?.domain;
 const override=params.get('domain');if(override&&/^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(override))domain=override;
 if(!domain)return new Response(null,{status:404});const key=process.env['LOGO_DEV_PUBLISHABLE_KEY'];if(!key)return new Response(null,{status:503});
 const response=await fetch(`https://img.logo.dev/${domain}?token=${encodeURIComponent(key)}&size=96&format=png&fallback=404`);
 if(!response.ok)return new Response(null,{status:response.status});return new Response(response.body,{headers:{'Content-Type':response.headers.get('Content-Type')??'image/png','Cache-Control':'public,max-age=86400'}});
}}}});