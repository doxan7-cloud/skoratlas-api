import 'dotenv/config';
import cors from 'cors';
import express from 'express';

const app=express(), port=Number(process.env.PORT||8787), cache=new Map(), TTL=15000;
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
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()), key=`fixtures:${date}`, hit=cache.get(key);
  if(hit&&Date.now()-hit.at<TTL)return res.json({matches:hit.matches});
  try{const response=await fetch(`https://v3.football.api-sports.io/fixtures?date=${date}&timezone=Europe%2FIstanbul`,{headers:{'x-apisports-key':process.env.API_FOOTBALL_KEY}});if(!response.ok)throw new Error(`Provider ${response.status}`);const data=await response.json(),matches=(data.response||[]).map(mapFixture);cache.set(key,{at:Date.now(),matches});res.set('Cache-Control','public, max-age=10');return res.json({matches});}
  catch(error){console.error('Provider error:',error instanceof Error?error.message:error);return res.status(502).json({error:'Canlı skor sağlayıcısına ulaşılamadı.'});}
});
app.use((_req,res)=>res.status(404).json({error:'Bulunamadı'}));
app.listen(port,()=>console.log(`SkorAtlas API :${port}`));
