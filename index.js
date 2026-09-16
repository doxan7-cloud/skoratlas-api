import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs/promises';

const app=express(), port=Number(process.env.PORT||8787), cache=new Map();
const TTL=30*60*1000, STALE_TTL=24*60*60*1000, CACHE_FILE='./fixture-cache.json';
app.disable('x-powered-by');
app.use(cors({origin:process.env.ALLOWED_ORIGIN||false}));
app.use(express.json({limit:'32kb'}));
const statusMap=code=>['1H','HT','2H','ET','BT','P','LIVE','INT'].includes(code)?'LIVE':['FT','AET','PEN'].includes(code)?'FINISHED':'UPCOMING';
// Bu listeye yalnızca hak sahibinin izin verdiği resmî HTTPS yayınları eklenir.
const verifiedStreams=new Map();
const mapFixture=item=>{
  const id=String(item.fixture.id), officialStreamUrl=verifiedStreams.get(id);
  return {id,country:item.league.country||'Uluslararası',flag:item.league.flag||'🌍',league:item.league.name,home:item.teams.home.name,away:item.teams.away.name,homeScore:item.goals.home,awayScore:item.goals.away,minute:item.fixture.status.elapsed??undefined,kickoff:new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(item.fixture.date)),status:statusMap(item.fixture.status.short),venue:item.fixture.venue?.name||undefined,officialStreamUrl,streamRightsVerified:Boolean(officialStreamUrl)};
};
app.get('/health',(_req,res)=>res.json({ok:true,service:'SkorAtlas API'}));
app.get('/v1/football/matches/today',async(_req,res)=>{
  if(!process.env.API_FOOTBALL_KEY)return res.status(503).json({error:'Lisanslı veri anahtarı yapılandırılmadı.'});
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=type=>parts.find(x=>x.type===type)?.value;
  const date=`${get('year')}-${get('month')}-${get('day')}`, key=`fixtures:${date}`;
  let hit=cache.get(key);
  if(!hit){try{const saved=JSON.parse(await fs.readFile(CACHE_FILE,'utf8'));if(saved?.key===key&&Array.isArray(saved.matches)){hit={at:saved.at,matches:saved.matches};cache.set(key,hit)}}catch{}}
  if(hit&&hit.matches.length&&Date.now()-hit.at<TTL){res.set('Cache-Control','public, max-age=60');return res.json({matches:hit.matches,cached:true});}
  try{
    const response=await fetch(`https://v3.football.api-sports.io/fixtures?date=${date}&timezone=Europe%2FIstanbul`,{headers:{'x-apisports-key':process.env.API_FOOTBALL_KEY}});
    if(!response.ok)throw new Error(`Provider HTTP ${response.status}`);
    const data=await response.json();
    const providerErrors=data?.errors&&Object.keys(data.errors).length?JSON.stringify(data.errors):'';
    if(providerErrors)throw new Error(`Provider: ${providerErrors}`);
    const matches=(data.response||[]).map(mapFixture);
    if(!matches.length)throw new Error(`Provider ${date} için boş liste döndürdü`);
    const saved={key,at:Date.now(),matches};cache.set(key,saved);await fs.writeFile(CACHE_FILE,JSON.stringify(saved)).catch(()=>{});
    res.set('Cache-Control','public, max-age=60');return res.json({matches,cached:false});
  }
  catch(error){
    console.error('Provider error:',error instanceof Error?error.message:error);
    if(hit&&hit.matches.length&&Date.now()-hit.at<STALE_TTL)return res.json({matches:hit.matches,cached:true,stale:true});
    return res.status(503).json({error:'Günlük canlı skor kotası doldu veya sağlayıcı geçici olarak yanıt vermiyor. Daha sonra tekrar deneyin.'});
  }
});
app.use((_req,res)=>res.status(404).json({error:'Bulunamadı'}));
app.listen(port,()=>console.log(`SkorAtlas API :${port}`));
