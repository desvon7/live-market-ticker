import { z } from 'zod';

export const sectors = ['Information Technology','Communication Services','Consumer Discretionary','Consumer Staples','Financials','Health Care','Industrials','Energy','Materials','Real Estate','Utilities'];
export const registry: Record<string, { name: string; domain: string; sector: string; kind: 'stock' | 'ETF' }> = {
 NVDA:{name:'NVIDIA',domain:'nvidia.com',sector:sectors[0],kind:'stock'}, AAPL:{name:'Apple',domain:'apple.com',sector:sectors[0],kind:'stock'}, MSFT:{name:'Microsoft',domain:'microsoft.com',sector:sectors[0],kind:'stock'}, GOOGL:{name:'Alphabet',domain:'abc.xyz',sector:sectors[1],kind:'stock'}, AMZN:{name:'Amazon',domain:'amazon.com',sector:sectors[2],kind:'stock'}, META:{name:'Meta',domain:'meta.com',sector:sectors[1],kind:'stock'}, AVGO:{name:'Broadcom',domain:'broadcom.com',sector:sectors[0],kind:'stock'}, ORCL:{name:'Oracle',domain:'oracle.com',sector:sectors[0],kind:'stock'},
 WMT:{name:'Walmart',domain:'walmart.com',sector:sectors[3],kind:'stock'}, JPM:{name:'JPMorgan Chase',domain:'jpmorganchase.com',sector:sectors[4],kind:'stock'}, JNJ:{name:'Johnson & Johnson',domain:'jnj.com',sector:sectors[5],kind:'stock'}, CAT:{name:'Caterpillar',domain:'caterpillar.com',sector:sectors[6],kind:'stock'}, XOM:{name:'ExxonMobil',domain:'exxonmobil.com',sector:sectors[7],kind:'stock'}, LIN:{name:'Linde',domain:'linde.com',sector:sectors[8],kind:'stock'}, PLD:{name:'Prologis',domain:'prologis.com',sector:sectors[9],kind:'stock'}, NEE:{name:'NextEra Energy',domain:'nexteraenergy.com',sector:sectors[10],kind:'stock'},
 SPY:{name:'SPDR S&P 500 ETF',domain:'',sector:'ETF',kind:'ETF'}, QQQ:{name:'Invesco QQQ ETF',domain:'',sector:'ETF',kind:'ETF'}, DIA:{name:'SPDR Dow Jones ETF',domain:'',sector:'ETF',kind:'ETF'}, IWM:{name:'iShares Russell 2000 ETF',domain:'',sector:'ETF',kind:'ETF'},
};
export const symbolSchema=z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9.-]{0,9}$/);
export const configSchema=z.object({
 symbols:z.array(symbolSchema).min(1).max(40), etfs:z.array(z.enum(['SPY','QQQ','DIA','IWM'])).max(4),
 mode:z.enum(['top','sector','all','random','watchlist','custom']), sector:z.string().max(60),
 height:z.number().min(90).max(160),speed:z.number().min(15).max(180),fontSize:z.number().min(16).max(28),logoSize:z.number().min(24).max(48),opacity:z.number().min(0).max(100),
 paused:z.boolean(),direction:z.enum(['left','right']),showNames:z.boolean(),showLogos:z.boolean(),showEtfs:z.boolean(),news:z.boolean(),safeArea:z.number().min(0).max(600),
 domains:z.record(symbolSchema,z.string().regex(/^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/)).default({}),
});
export type TickerConfig=z.infer<typeof configSchema>;
export const defaultConfig:TickerConfig={symbols:['NVDA','AAPL','MSFT','GOOGL','AMZN','META','AVGO','ORCL'],etfs:['SPY','QQQ','DIA','IWM'],mode:'sector',sector:sectors[0],height:104,speed:65,fontSize:20,logoSize:30,opacity:95,paused:false,direction:'left',showNames:false,showLogos:true,showEtfs:true,news:false,safeArea:0,domains:{}};
export function activeSymbols(config:TickerConfig){return [...new Set([...(config.showEtfs?config.etfs:[]),...config.symbols])];}
export type Quote={symbol:string;price:number;previousClose:number|null;change:number|null;percent:number|null;timestamp:number;source:'snapshot'|'trade'};
export type FeedStatus='connecting'|'connected'|'reconnecting'|'offline'|'duplicate'|'error';
export type FeedEvent={type:'quote';quote:Quote}|{type:'status';status:FeedStatus;message?:string}|{type:'config';config:TickerConfig}|{type:'news';items:NewsItem[]};
export type NewsItem={id:number;headline:string;source:string;datetime:number;url:string};
export function normalizeTrade(symbol:string,price:number,timestamp:number,previousClose:number|null):Quote{
 const change=previousClose&&previousClose>0?price-previousClose:null;
 return {symbol,price,previousClose,change,percent:change===null||!previousClose?null:change/previousClose*100,timestamp,source:'trade'};
}
export function freshness(q:Quote|undefined,now:number){if(!q)return 'Awaiting data'; return now-q.timestamp>120000?'Last reported':'Latest trade';}
export function securityKind(symbol:string){return ['SPY','QQQ','DIA','IWM'].includes(symbol)?'ETF':registry[symbol]?.kind??'stock';}
export const pageHead=(title:string,description:string)=>({meta:[{title},{name:'description',content:description},{property:'og:title',content:title},{property:'og:description',content:description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]});