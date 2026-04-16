import GoalDashboard from './components/GoalDashboard';
import DipPrioritisation from './components/DipPrioritisation';
import{useState,useEffect,useMemo,useCallback}from'react'
import{LineChart,Line,ResponsiveContainer,Tooltip}from'recharts'

const FUNDS=[
  {id:'niscf', name:'Nippon India Small Cap',     searchQ:'Nippon India Small Cap',      goals:['retirement','education'],category:'Small Cap',       index:'smallcap'},
  {id:'hdfcsc',name:'HDFC Small Cap',             searchQ:'HDFC Small Cap Fund',         goals:['retirement','education'],category:'Small Cap',       index:'smallcap'},
  {id:'hdfcmd',name:'HDFC Mid-Cap Opportunities', searchQ:'HDFC Mid Cap Fund',           goals:['retirement','education'],category:'Mid Cap',         index:'midcap'},
  {id:'nimcap',name:'Nippon India MultiCap',       searchQ:'Nippon India Multi Cap',      goals:['retirement'],           category:'Multi Cap',       index:'midcap'},
  {id:'hdfcfc',name:'HDFC Flexi Cap',             searchQ:'HDFC Flexi Cap Fund',         goals:['retirement','education'],category:'Flexi Cap',       index:'largecap'},
  {id:'mirae', name:'Mirae Large & Midcap',       searchQ:'Mirae Asset Large',           goals:['retirement','education'],category:'Large & Mid Cap', index:'midcap'},
  {id:'sbiarb',name:'SBI Arbitrage Opps',          searchQ:'SBI Arbitrage Opportunities', goals:['education'],            category:'Arbitrage',       index:null},
  {id:'sbisc', name:'SBI Small Cap',              searchQ:'SBI Small Cap Fund',          goals:['retirement','education'],category:'Small Cap',       index:'smallcap'},
]

const CAT={
  'Small Cap':       {bg:'#FAECE7',text:'#993C1D'},
  'Mid Cap':         {bg:'#E6F1FB',text:'#185FA5'},
  'Multi Cap':       {bg:'#EEEDFE',text:'#534AB7'},
  'Flexi Cap':       {bg:'#E1F5EE',text:'#0F6E56'},
  'Large & Mid Cap': {bg:'#FAEEDA',text:'#854F0B'},
  'Arbitrage':       {bg:'#EAF3DE',text:'#3B6D11'},
}

const SIG={
  dip:    {id:'dip',    label:'Buy Dip',   color:'#A32D2D',bg:'#FCEBEB'},
  watch:  {id:'watch',  label:'Watch',     color:'#854F0B',bg:'#FAEEDA'},
  run:    {id:'run',    label:'Strong Run',color:'#3B6D11',bg:'#EAF3DE'},
  neutral:{id:'neutral',label:'Neutral',   color:'#5F5E5A',bg:'#F1EFE8'},
  stable: {id:'stable', label:'Stable',   color:'#185FA5',bg:'#E6F1FB'},
}

const PE_BANDS={
  smallcap: {cheap:25,fair:35,label:'Nifty SC250'},
  midcap:   {cheap:30,fair:42,label:'Nifty MC150'},
  largecap: {cheap:20,fair:28,label:'Nifty 50'},
}

const DEFAULT_GOALS={
  retirement:{label:'Retirement',  yearsLeft:22, targetLakh:500, emoji:'🎯',
    funds:{niscf:5000,hdfcsc:5000,hdfcmd:3000,nimcap:3000,hdfcfc:2000,mirae:2000,sbisc:5000},
    sipDates:{niscf:5,hdfcsc:10,hdfcmd:5,nimcap:10,hdfcfc:15,mirae:15,sbisc:7}},
  education: {label:'Kids Education',yearsLeft:12, targetLakh:75,  emoji:'🎓',
    funds:{hdfcsc:2000,hdfcmd:2000,hdfcfc:1000,mirae:1000,sbiarb:3000,sbisc:2000},
    sipDates:{hdfcsc:5,hdfcmd:5,hdfcfc:10,mirae:10,sbiarb:1,sbisc:7}},
}

const STORAGE_KEY='artha_config_v1'
// SW-3: Lump sum amount persisted to localStorage so user doesn't re-enter each visit
const LUMP_SUM_STORAGE_KEY='artha_lump_sum'

function loadConfig(){
  try{const s=localStorage.getItem(STORAGE_KEY);return s?JSON.parse(s):DEFAULT_GOALS}catch{return DEFAULT_GOALS}
}
function saveConfig(cfg){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(cfg))}catch{}
}
function loadLumpSum(){
  try{return parseFloat(localStorage.getItem(LUMP_SUM_STORAGE_KEY))||0}catch{return 0}
}
function saveLumpSum(val){
  try{localStorage.setItem(LUMP_SUM_STORAGE_KEY,JSON.stringify(val))}catch{}
}

const fmtINR=n=>`₹${parseFloat(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmtPct=(n,d=2)=>n==null?'--':(n>=0?'+':'')+parseFloat(n).toFixed(d)+'%'
const pctClr=n=>n==null?'var(--text-secondary)':n>=0?'#3B6D11':'#A32D2D'

function peLabel(pe,index){
  if(!pe||!index||!PE_BANDS[index])return null
  const b=PE_BANDS[index]
  if(pe<b.cheap)return{label:'Cheap',color:'#3B6D11',bg:'#EAF3DE',conviction:'high',advice:'Market cheap — high conviction to buy dips.'}
  if(pe<b.fair) return{label:'Fair value',color:'#854F0B',bg:'#FAEEDA',conviction:'medium',advice:'Market fairly valued — buy dips selectively.'}
  return{label:'Expensive',color:'#A32D2D',bg:'#FCEBEB',conviction:'low',advice:'Market expensive — SIP only, avoid lump sums.'}
}

function goalContext(yearsLeft){
  if(yearsLeft>15)return{horizon:'Long term',dipAction:'Top up SIP or add lump sum.',runAction:'Stay invested, continue SIP.',dipMultiplier:2.0,color:'#3B6D11',bg:'#EAF3DE'}
  if(yearsLeft>10)return{horizon:'Long term',dipAction:'Top up SIP this month.',runAction:'Continue SIP. Plan glide path for last 5Y.',dipMultiplier:1.5,color:'#3B6D11',bg:'#EAF3DE'}
  if(yearsLeft>5) return{horizon:'Medium term',dipAction:'Buy selectively. Begin shifting 20% to large cap.',runAction:'Book 15–20% profits, move to large cap/hybrid.',dipMultiplier:1.0,color:'#854F0B',bg:'#FAEEDA'}
  if(yearsLeft>2) return{horizon:'Short term',dipAction:'Do NOT add. Derisk to large cap or debt.',runAction:'Book profits now. Move to debt/arbitrage.',dipMultiplier:0,color:'#A32D2D',bg:'#FCEBEB'}
  return{horizon:'Imminent',dipAction:'Exit equity. Move to liquid fund immediately.',runAction:'Exit equity. Move to liquid fund immediately.',dipMultiplier:0,color:'#A32D2D',bg:'#FCEBEB'}
}

function synthesise(fund,m,goalsConfig,marketPE,avgDays,dipPct){
  if(!m||fund.category==='Arbitrage')return null
  const verdicts=[]
  // Collect all goal IDs this fund belongs to:
  // 1. From fund.goals (hardcoded legacy mapping)
  // 2. From goalsConfig entries where funds[fund.id] exists (new goals)
  const goalIds=new Set(fund.goals)
  Object.entries(goalsConfig).forEach(([gid,gc])=>{
    if(gc.funds?.[fund.id]!==undefined && gc.funds[fund.id]>0)goalIds.add(gid)
  })
  goalIds.forEach(gid=>{
    const gc=goalsConfig[gid]
    if(!gc)return
    const ctx=goalContext(gc.yearsLeft)
    const pe=marketPE[fund.index]
    const peBand=peLabel(pe,fund.index)
    const sipAmt=gc.funds?.[fund.id]||0
    const sipDate=gc.sipDates?.[fund.id]||1
    const drawdownFrom52=m.hi>0?((m.cur-m.hi)/m.hi*100):null

    let action='',conviction='',detail=''

    if(m.signal.id==='dip'||m.signal.id==='watch'){
      const isDip=m.signal.id==='dip'
      if(ctx.dipMultiplier===0){
        conviction='avoid'
        action=ctx.dipAction
        detail=`Goal is ${gc.yearsLeft}Y away — capital preservation takes priority over buying this dip.`
      } else if(peBand?.conviction==='low'){
        conviction='low'
        action=`SIP only (₹${sipAmt.toLocaleString('en-IN')}/mo on ${sipDate}th). Avoid lump sum — market is expensive.`
        detail=`${PE_BANDS[fund.index]?.label||''} P/E is ${pe?.toFixed(1)} — elevated. Wait for broader market correction before adding extra.`
      } else if(peBand?.conviction==='high'&&isDip){
        const extra=Math.round(sipAmt*ctx.dipMultiplier/500)*500
        conviction='high'
        action=`Strong buy. Add ₹${extra.toLocaleString('en-IN')} extra this month on top of regular SIP.`
        detail=`${PE_BANDS[fund.index]?.label||''} P/E is ${pe?.toFixed(1)} (cheap) + fund is down ${Math.abs(m.fromAvg).toFixed(1)}% from avg + ${gc.yearsLeft}Y runway = high conviction.`
      } else {
        const extra=Math.round(sipAmt*0.5/500)*500
        conviction='medium'
        action=`Buy moderately. Add ₹${extra>0?extra.toLocaleString('en-IN'):'a small amount'} extra this month.`
        detail=`Fund is down ${Math.abs(m.fromAvg).toFixed(1)}% from ${avgDays}d avg. Market at fair value. ${gc.yearsLeft}Y horizon gives time to recover.`
      }
    } else if(m.signal.id==='run'){
      if(ctx.dipMultiplier===0||gc.yearsLeft<=5){
        conviction='sell'
        action=ctx.runAction
        detail=`With only ${gc.yearsLeft}Y left, this rally is an opportunity to derisk — not stay invested.`
      } else {
        conviction='hold'
        action=`Continue SIP (₹${sipAmt.toLocaleString('en-IN')}/mo). Avoid adding lump sum at elevated NAV.`
        detail=`Fund is ${m.fromAvg.toFixed(1)}% above ${avgDays}d avg. Strong momentum — stay invested but don't chase.`
      }
    } else {
      // Neutral/stable signal — but still check if goal horizon demands derisking
      if(ctx.dipMultiplier===0){
        // Short/imminent horizon: equity exposure is the problem, not the signal
        conviction='avoid'
        action=ctx.dipAction
        detail=`Goal is ${gc.yearsLeft}Y away — you should not have equity exposure this close to your target. Move to debt/liquid regardless of market signals.`
      } else {
        conviction='hold'
        action=`Continue SIP (₹${sipAmt.toLocaleString('en-IN')}/mo on ${sipDate}th). No action needed.`
        detail=`NAV is ${m.fromAvg>=0?'+':''}${m.fromAvg.toFixed(1)}% vs ${avgDays}d avg — within normal range.`
      }
    }

    const drawdownNote=drawdownFrom52!=null&&drawdownFrom52<-20
      ?` Fund is ${Math.abs(drawdownFrom52).toFixed(0)}% below its 52W high — a meaningful correction.`
      :drawdownFrom52!=null&&drawdownFrom52<-10
      ?` Fund is ${Math.abs(drawdownFrom52).toFixed(0)}% below 52W high.`
      :''

    verdicts.push({gid,gc,ctx,peBand,pe,sipAmt,sipDate,conviction,action,detail:detail+drawdownNote,drawdownFrom52})
  })
  return verdicts
}

function computeMetrics(raw,avgDays,dipPct){
  if(!raw||raw.length<5)return null
  const navs=raw.map(d=>parseFloat(d.nav))
  const cur=navs[0]
  const ret=days=>days<navs.length?(cur-navs[days])/navs[days]*100:null
  const slice=navs.slice(0,Math.min(avgDays,navs.length))
  const avg=slice.reduce((a,b)=>a+b,0)/slice.length
  const fromAvg=(cur-avg)/avg*100
  const yr=navs.slice(0,Math.min(252,navs.length))
  const hi=Math.max(...yr),lo=Math.min(...yr)
  const rangePct=hi===lo?50:Math.max(0,Math.min(100,(cur-lo)/(hi-lo)*100))
  const drawdownFrom52=(cur-hi)/hi*100
  const signal=fromAvg<=-dipPct?SIG.dip:fromAvg<=-(dipPct/2)?SIG.watch:fromAvg>=dipPct?SIG.run:SIG.neutral
  const spark=raw.slice(0,60).reverse().map((d,i)=>({i,nav:parseFloat(d.nav),date:d.date}))
  const chart=raw.slice(0,365).reverse().map((d,i)=>({i,nav:parseFloat(d.nav),date:d.date}))
  return{cur,avg,fromAvg,hi,lo,rangePct,drawdownFrom52,signal,spark,chart,
    r1d:ret(1),r1w:ret(5),r1m:ret(21),r3m:ret(63),r1y:ret(252)}
}

function Tip({payload}){
  if(!payload?.length)return null
  return(
    <div style={{background:'var(--bg)',border:'0.5px solid var(--border-strong)',borderRadius:6,padding:'4px 9px',fontSize:11}}>
      <div style={{color:'var(--text-secondary)',fontSize:9}}>{payload[0].payload.date}</div>
      <div style={{fontWeight:500}}>{fmtINR(payload[0].value)}</div>
    </div>
  )
}

const CONV_COLORS={
  high:  {bg:'#EAF3DE',color:'#3B6D11',label:'High conviction buy'},
  medium:{bg:'#FAEEDA',color:'#854F0B',label:'Moderate buy'},
  low:   {bg:'#F1EFE8',color:'#5F5E5A',label:'SIP only'},
  hold:  {bg:'#E6F1FB',color:'#185FA5',label:'Hold & continue'},
  avoid: {bg:'#FCEBEB',color:'#A32D2D',label:'Avoid — derisk'},
  sell:  {bg:'#FAECE7',color:'#993C1D',label:'Take profits'},
}

function VerdictPanel({verdicts,marketPE,fund}){
  if(!verdicts||!verdicts.length)return null
  return(
    <div style={{marginTop:10}}>
      <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text-secondary)',marginBottom:8}}>
        Synthesised Verdict
      </div>
      {verdicts.map(v=>{
        const cc=CONV_COLORS[v.conviction]||CONV_COLORS.hold
        const pe=marketPE[fund.index]
        const peBand=v.peBand
        return(
          <div key={v.gid} style={{marginBottom:10,border:'0.5px solid var(--border)',borderRadius:'var(--radius-md)',overflow:'hidden'}}>
            <div style={{padding:'8px 12px',background:'var(--bg-secondary)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:11,fontWeight:500}}>{v.gc.emoji} {v.gc.label} · {v.gc.yearsLeft}Y · ₹{v.gc.targetLakh}L target</div>
              <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:cc.bg,color:cc.color,fontWeight:500}}>{cc.label}</span>
            </div>
            <div style={{padding:'10px 12px',background:cc.bg}}>
              <div style={{fontSize:12,fontWeight:500,color:cc.color,marginBottom:4}}>→ {v.action}</div>
              <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.6}}>{v.detail}</div>
            </div>
            {pe&&peBand&&(
              <div style={{padding:'6px 12px',background:'var(--bg)',borderTop:'0.5px solid var(--border)',display:'flex',gap:8,alignItems:'center'}}>
                <span style={{fontSize:10,padding:'1px 7px',borderRadius:99,background:peBand.bg,color:peBand.color,fontWeight:500}}>
                  {PE_BANDS[fund.index]?.label} P/E: {pe.toFixed(1)} · {peBand.label}
                </span>
                <span style={{fontSize:10,color:'var(--text-secondary)'}}>{peBand.advice}</span>
              </div>
            )}
            {v.drawdownFrom52!=null&&(
              <div style={{padding:'4px 12px',background:'var(--bg)',borderTop:'0.5px solid var(--border)',fontSize:10,color:v.drawdownFrom52<-20?'#A32D2D':v.drawdownFrom52<-10?'#854F0B':'var(--text-tertiary)'}}>
                52W drawdown: {v.drawdownFrom52.toFixed(1)}% from high · Current: {fmtINR(v.m?.cur||0)} · 52W high: {fmtINR(v.gc?.hi||0)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Card({fund,status,m,data,isSel,avgDays,dipPct,goalsConfig,marketPE,onSelect,onRetry}){
  const cs=CAT[fund.category]||CAT['Multi Cap']
  const bs='0.5px solid var(--border)'
  const verdicts=useMemo(()=>synthesise(fund,m,goalsConfig,marketPE,avgDays,dipPct),[fund,m,goalsConfig,marketPE,avgDays,dipPct])

  // Attach m to verdicts for drawdown display
  const verdictsWithM=verdicts?.map(v=>({...v,m}))

  return(
    <div onClick={()=>status==='done'&&onSelect()}
      style={{background:'var(--bg)',borderRadius:'var(--radius-lg)',padding:'1rem',
        border:isSel?'1.5px solid var(--text-primary)':bs,
        cursor:status==='done'?'pointer':'default',
        transition:'border-color .15s',
        boxShadow:isSel?'0 0 0 3px rgba(0,0,0,0.06)':'none'}}>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:cs.bg,color:cs.text,fontWeight:500}}>{fund.category}</span>
          <div style={{fontSize:13,fontWeight:500,marginTop:5,lineHeight:1.3}}>{fund.name}</div>
          <div style={{fontSize:10,color:'var(--text-secondary)',marginTop:2}}>
            {[...new Set([...fund.goals,...Object.entries(goalsConfig).filter(([gid,gc])=>gc.funds?.[fund.id]>0).map(([gid])=>gid)])].map(g=>goalsConfig[g]?`${goalsConfig[g].emoji} ${goalsConfig[g].yearsLeft}Y`:g).join(' · ')}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
          {m&&<span style={{padding:'3px 9px',borderRadius:99,fontSize:10,fontWeight:500,background:m.signal.bg,color:m.signal.color}}>{m.signal.label}</span>}
          {m&&fund.index&&marketPE[fund.index]&&(()=>{const pb=peLabel(marketPE[fund.index],fund.index);return pb?<span style={{padding:'2px 7px',borderRadius:99,fontSize:9,fontWeight:500,background:pb.bg,color:pb.color}}>{PE_BANDS[fund.index]?.label} {pb.label}</span>:null})()}
        </div>
      </div>

      {status==='loading'&&<div style={{textAlign:'center',padding:'1.5rem 0',fontSize:11,color:'var(--text-secondary)'}}>Fetching NAV data…</div>}
      {status==='error'&&(
        <div style={{textAlign:'center',padding:'1rem 0'}}>
          <div style={{fontSize:11,color:'#E24B4A',marginBottom:6}}>Could not load fund</div>
          <button onClick={e=>{e.stopPropagation();onRetry()}} style={{fontSize:11,padding:'3px 10px',border:bs,borderRadius:99,background:'transparent',color:'var(--text-secondary)'}}>Retry</button>
        </div>
      )}

      {status==='done'&&m&&(
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
            <span style={{fontSize:20,fontWeight:600,letterSpacing:'-.02em'}}>{fmtINR(m.cur)}</span>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:12,fontWeight:500,color:pctClr(m.r1d)}}>{fmtPct(m.r1d)} 1D</div>
              {m.drawdownFrom52<-10&&<div style={{fontSize:10,color:m.drawdownFrom52<-20?'#A32D2D':'#854F0B'}}>{m.drawdownFrom52.toFixed(0)}% off 52W high</div>}
            </div>
          </div>

          <div style={{height:52,marginBottom:6}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={m.spark}>
                <Line type="monotone" dataKey="nav" stroke={m.signal.color} strokeWidth={1.5} dot={false}/>
                <Tooltip content={<Tip/>}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4,borderTop:bs,paddingTop:8}}>
            {[['1M',m.r1m],[avgDays+'d avg',m.fromAvg],['1Y',m.r1y]].map(([l,v])=>(
              <div key={l}>
                <div style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'.04em'}}>{l}</div>
                <div style={{fontSize:11,fontWeight:500,marginTop:2,color:pctClr(v)}}>{fmtPct(v)}</div>
              </div>
            ))}
          </div>

          <div style={{marginTop:8}}>
            <div style={{height:3,background:'var(--bg-secondary)',borderRadius:2,overflow:'hidden'}}>
              <div style={{height:'100%',width:m.rangePct+'%',background:m.signal.color,borderRadius:2}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'var(--text-tertiary)',marginTop:3}}>
              <span>{fmtINR(m.lo)}</span>
              <span style={{color:'var(--text-secondary)'}}>{m.rangePct.toFixed(0)}% of 52W</span>
              <span>{fmtINR(m.hi)}</span>
            </div>
          </div>

          {!isSel&&verdicts?.length>0&&(
            <div style={{marginTop:8,padding:'7px 10px',background:CONV_COLORS[verdicts[0].conviction]?.bg||'var(--bg-secondary)',borderRadius:'var(--radius-md)'}}>
              <div style={{fontSize:10,fontWeight:500,color:CONV_COLORS[verdicts[0].conviction]?.color||'var(--text-secondary)'}}>
                → {verdicts[0].action}
              </div>
            </div>
          )}
          {!isSel&&<div style={{fontSize:9,color:'var(--text-tertiary)',marginTop:6,textAlign:'center'}}>tap for full analysis →</div>}

          {isSel&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:bs}}>
              <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text-secondary)',marginBottom:8}}>Full Returns</div>
              <div style={{display:'flex',gap:4,marginBottom:12}}>
                {[['1D',m.r1d],['1W',m.r1w],['1M',m.r1m],['3M',m.r3m],['1Y',m.r1y]].map(([l,v])=>(
                  <div key={l} style={{flex:1,textAlign:'center',padding:'6px 2px',background:'var(--bg-secondary)',borderRadius:'var(--radius-md)'}}>
                    <div style={{fontSize:9,color:'var(--text-secondary)'}}>{l}</div>
                    <div style={{fontSize:11,fontWeight:500,marginTop:2,color:pctClr(v)}}>{fmtPct(v)}</div>
                  </div>
                ))}
              </div>
              <div style={{height:80,marginBottom:12}}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={m.chart}>
                    <Line type="monotone" dataKey="nav" stroke={m.signal.color} strokeWidth={1.5} dot={false}/>
                    <Tooltip content={<Tip/>}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <VerdictPanel verdicts={verdictsWithM} marketPE={marketPE} fund={fund}/>
              {data&&<div style={{fontSize:9,color:'var(--text-tertiary)',lineHeight:1.5,marginTop:8}}>Matched: {data.schemeName} · Code: {data.schemeCode}</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function App(){
  const[fd,setFd]=useState({})
  const[st,setSt]=useState({})
  const[avgDays,setAvgDays]=useState(30)
  const[dipPct,setDipPct]=useState(5)
  const[goal,setGoal]=useState('all')
  const[sel,setSel]=useState(null)
  const[rulesOpen,setRulesOpen]=useState(false)
  const[goalsOpen,setGoalsOpen]=useState(false)
  const[goalsConfig,setGoalsConfig]=useState(()=>loadConfig())
  const[lumpSum,setLumpSum]=useState(()=>loadLumpSum())
  const[marketPE,setMarketPE]=useState({})
  // SW-3: healthMap is populated by GoalDashboard and passed to DipPrioritisation.
  // This lets the conviction scorer know which goals are on-track/off-track
  // without duplicating the health computation logic here.
  const[healthMap,setHealthMap]=useState({})
  const[peStatus,setPeStatus]=useState('idle')

  // Persist config to localStorage whenever it changes
  useEffect(()=>saveConfig(goalsConfig),[goalsConfig])
  // SW-3: Persist lump sum to localStorage so it survives page reloads
  useEffect(()=>saveLumpSum(lumpSum),[lumpSum])

  const updateGoalField=(gid,field,val)=>setGoalsConfig(p=>({...p,[gid]:{...p[gid],[field]:['yearsLeft','targetLakh'].includes(field)?Number(val):val}}))
  const updateFundSIP=(gid,fid,val)=>setGoalsConfig(p=>({...p,[gid]:{...p[gid],funds:{...p[gid].funds,[fid]:Number(val)}}}))
  const updateSIPDate=(gid,fid,val)=>setGoalsConfig(p=>({...p,[gid]:{...p[gid],sipDates:{...p[gid].sipDates,[fid]:Number(val)}}}))

  // Fetch market P/E from NSE with fallback to hardcoded recent values
  const fetchMarketPE=useCallback(async()=>{
    setPeStatus('loading')
    try{
      // Try fetching Nifty P/E data from NSE India
      const r=await fetch('https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050',{
        headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'},
        signal:AbortSignal.timeout(5000)
      })
      if(r.ok){
        const d=await r.json()
        const pe=d?.data?.[0]?.pe
        if(pe){
          // NSE only gives Nifty 50; estimate others from historical ratio
          setMarketPE({largecap:parseFloat(pe),midcap:parseFloat(pe)*1.45,smallcap:parseFloat(pe)*1.6})
          setPeStatus('live')
          return
        }
      }
    }catch{}
    // Fallback: recent approximate values (updated periodically)
    // As of April 2026 — update these quarterly
    setMarketPE({largecap:22.5,midcap:32.8,smallcap:30.2})
    setPeStatus('fallback')
  },[])

  useEffect(()=>{fetchMarketPE()},[fetchMarketPE])

  const loadFund=useCallback(async fund=>{
    setSt(p=>({...p,[fund.id]:'loading'}))
    try{
      const sr=await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(fund.searchQ)}`)
      const results=await sr.json()
      const match=results.find(r=>{const n=r.schemeName.toLowerCase();return n.includes('direct')&&n.includes('growth')&&!n.includes('dividend')})||results[0]
      if(!match)throw new Error('not found')
      const nr=await fetch(`https://api.mfapi.in/mf/${match.schemeCode}`)
      const nj=await nr.json()
      setFd(p=>({...p,[fund.id]:{schemeCode:match.schemeCode,schemeName:match.schemeName,rawData:nj.data}}))
      setSt(p=>({...p,[fund.id]:'done'}))
    }catch{setSt(p=>({...p,[fund.id]:'error'}))}
  },[])

  useEffect(()=>{FUNDS.forEach((f,i)=>setTimeout(()=>loadFund(f),i*300))},[loadFund])

  const metrics=useMemo(()=>{
    const m={}
    FUNDS.forEach(f=>{
      if(!fd[f.id])return
      const base=computeMetrics(fd[f.id].rawData,avgDays,dipPct)
      if(base&&f.category==='Arbitrage')base.signal=SIG.stable
      m[f.id]=base
    })
    return m
  },[fd,avgDays,dipPct])

  // For new goals, fund-to-goal mapping is in goalsConfig[gid].funds (keys are fund IDs).
  // For legacy goals, mapping is in FUNDS[].goals. Check both directions.
  const fundBelongsToGoal=(fund,gid)=>{
    if(fund.goals.includes(gid))return true
    const gc=goalsConfig[gid]
    return gc?.funds?.[fund.id]!==undefined && gc.funds[fund.id]>0
  }
  const visible=goal==='all'?FUNDS:FUNDS.filter(f=>fundBelongsToGoal(f,goal))
  const done=FUNDS.filter(f=>st[f.id]==='done')
  const sigCount=done.reduce((acc,f)=>{const s=metrics[f.id]?.signal;if(s)acc[s.id]=(acc[s.id]||0)+1;return acc},{})
  const bs='0.5px solid var(--border)'

  return(
    <div style={{minHeight:'100vh',background:'var(--bg-tertiary)'}}>
      <nav style={{background:'var(--bg)',borderBottom:bs,padding:'0 1.5rem',position:'sticky',top:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'space-between',height:52}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:18}}>📊</span>
          <div><span style={{fontSize:14,fontWeight:600}}>Signal Watch</span><span style={{fontSize:10,color:'var(--text-secondary)',marginLeft:6}}>Project Artha</span></div>
        </div>
        <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
          {peStatus==='live'&&<span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:'#EAF3DE',color:'#3B6D11'}}>P/E live</span>}
          {peStatus==='fallback'&&<span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:'#FAEEDA',color:'#854F0B'}}>P/E est.</span>}
          {Object.entries(sigCount).map(([id,count])=>{const s=SIG[id];if(!s||!count)return null;return<span key={id} style={{padding:'2px 9px',borderRadius:99,fontSize:11,fontWeight:500,background:s.bg,color:s.color}}>{count} {s.label}</span>})}
          {done.length<FUNDS.length&&<span style={{fontSize:11,color:'var(--text-secondary)'}}>Loading {done.length}/{FUNDS.length}…</span>}
        </div>
      </nav>

      <header style={{background:'var(--bg)',borderBottom:bs,padding:'1.25rem 1.5rem 1rem'}}>
        <div style={{maxWidth:960,margin:'0 auto'}}>
          <div style={{fontSize:10,color:'var(--text-secondary)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:4}}>
            {new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
          </div>
          <h1 style={{fontSize:26,fontWeight:600,letterSpacing:'-.02em',marginBottom:10}}>Portfolio Signals</h1>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {Object.entries(goalsConfig).map(([id,g])=>(
              <span key={id} style={{padding:'3px 11px',background:'var(--bg-secondary)',borderRadius:99,fontSize:12,color:'var(--text-secondary)'}}>
                {g.emoji} {g.label} · <b style={{fontWeight:500}}>{g.yearsLeft}Y</b> · ₹{g.targetLakh}L
              </span>
            ))}
            {Object.entries(marketPE).length>0&&(
              <span style={{padding:'3px 11px',background:'var(--bg-secondary)',borderRadius:99,fontSize:12,color:'var(--text-secondary)'}}>
                Nifty50 P/E: <b style={{fontWeight:500,color:marketPE.largecap<20?'#3B6D11':marketPE.largecap<28?'#854F0B':'#A32D2D'}}>{marketPE.largecap?.toFixed(1)}</b>
                {' '}· SC250 P/E: <b style={{fontWeight:500,color:marketPE.smallcap<25?'#3B6D11':marketPE.smallcap<35?'#854F0B':'#A32D2D'}}>{marketPE.smallcap?.toFixed(1)}</b>
              </span>
            )}
          </div>
        </div>
      </header>

      <main style={{maxWidth:960,margin:'0 auto',padding:'1.25rem 1.5rem'}}>
        <div style={{display:'flex',gap:0,borderBottom:bs,marginBottom:14}}>
          {[{id:'all',label:'All Funds',n:FUNDS.length},...Object.entries(goalsConfig).map(([gid,g])=>({id:gid,label:g.label,n:FUNDS.filter(f=>fundBelongsToGoal(f,gid)).length}))].map(t=>(
            <button key={t.id} onClick={()=>{setGoal(t.id);setSel(null)}}
              style={{padding:'7px 14px',border:'none',background:'none',fontSize:13,color:goal===t.id?'var(--text-primary)':'var(--text-secondary)',fontWeight:goal===t.id?500:400,borderBottom:goal===t.id?'2px solid var(--text-primary)':'2px solid transparent',marginBottom:-0.5,cursor:'pointer'}}>
              {t.label} <span style={{fontSize:10,opacity:.55}}>({t.n})</span>
            </button>
          ))}
        </div>

        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
          <button onClick={()=>{setGoalsOpen(!goalsOpen);setRulesOpen(false)}}
            style={{display:'flex',alignItems:'center',gap:6,padding:'5px 13px',border:'0.5px solid var(--border-strong)',borderRadius:99,background:goalsOpen?'var(--text-primary)':'var(--bg)',fontSize:12,color:goalsOpen?'var(--bg)':'var(--text-secondary)'}}>
            🎯 Goals & SIPs {goalsOpen?'▲':'▼'}
          </button>
          <button onClick={()=>{setRulesOpen(!rulesOpen);setGoalsOpen(false)}}
            style={{display:'flex',alignItems:'center',gap:6,padding:'5px 13px',border:'0.5px solid var(--border-strong)',borderRadius:99,background:rulesOpen?'var(--text-primary)':'var(--bg)',fontSize:12,color:rulesOpen?'var(--bg)':'var(--text-secondary)'}}>
            ⚙ Rules · {avgDays}d avg · {dipPct}% dip {rulesOpen?'▲':'▼'}
          </button>
          <button onClick={fetchMarketPE}
            style={{display:'flex',alignItems:'center',gap:6,padding:'5px 13px',border:'0.5px solid var(--border-strong)',borderRadius:99,background:'var(--bg)',fontSize:12,color:'var(--text-secondary)'}}>
            ↻ Refresh P/E
          </button>
          {/* SW-3: Lump sum input — user enters available amount to deploy across Buy Dip signals.
              Persisted in localStorage so it survives page reloads. When non-zero, the
              DipPrioritisation component appears below with ranked allocation suggestions. */}
          <div style={{display:'flex',alignItems:'center',gap:4,padding:'3px 4px 3px 11px',border:'0.5px solid var(--border-strong)',borderRadius:99,background:lumpSum>0?'var(--bg-secondary)':'var(--bg)'}}>
            <span style={{fontSize:11,color:'var(--text-secondary)'}}>💰 Lump sum ₹</span>
            <input type="number" min="0" step="5000" value={lumpSum||''} placeholder="0"
              onChange={e=>setLumpSum(Math.max(0,parseInt(e.target.value)||0))}
              style={{width:72,padding:'3px 6px',border:'none',borderRadius:99,fontSize:12,fontWeight:500,background:'transparent',color:'var(--text-primary)',outline:'none',textAlign:'right'}}/>
            {lumpSum>0&&<button onClick={()=>setLumpSum(0)} style={{border:'none',background:'none',fontSize:11,color:'var(--text-tertiary)',cursor:'pointer',padding:'0 4px'}}>✕</button>}
          </div>
        </div>

        {goalsOpen&&(
          <div style={{marginBottom:14,padding:'1.1rem 1.25rem',background:'var(--bg)',borderRadius:'var(--radius-lg)',border:bs}}>
            <div style={{fontSize:11,fontWeight:500,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text-secondary)',marginBottom:12}}>Goals, Targets & SIP Amounts</div>
            {Object.entries(goalsConfig).map(([gid,g])=>(
              <div key={gid} style={{marginBottom:16,paddingBottom:16,borderBottom:bs}}>
                <div style={{fontSize:13,fontWeight:500,marginBottom:10}}>{g.emoji} {g.label}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  <div>
                    <div style={{fontSize:10,color:'var(--text-secondary)',marginBottom:4}}>Years remaining</div>
                    <input type="number" min="1" max="40" value={g.yearsLeft} onChange={e=>updateGoalField(gid,'yearsLeft',e.target.value)}
                      style={{width:'100%',padding:'5px 8px',border:bs,borderRadius:'var(--radius-md)',fontSize:13,fontWeight:500,background:'var(--bg)',color:'var(--text-primary)'}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:'var(--text-secondary)',marginBottom:4}}>Target corpus (₹ Lakh)</div>
                    <input type="number" min="1" value={g.targetLakh} onChange={e=>updateGoalField(gid,'targetLakh',e.target.value)}
                      style={{width:'100%',padding:'5px 8px',border:bs,borderRadius:'var(--radius-md)',fontSize:13,fontWeight:500,background:'var(--bg)',color:'var(--text-primary)'}}/>
                  </div>
                </div>
                <div style={{fontSize:10,fontWeight:500,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>SIP amounts & dates for this goal</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {FUNDS.filter(f=>f.goals.includes(gid)).map(f=>(
                    <div key={f.id} style={{padding:'8px 10px',background:'var(--bg-secondary)',borderRadius:'var(--radius-md)'}}>
                      <div style={{fontSize:11,fontWeight:500,marginBottom:6}}>{f.name}</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                        <div>
                          <div style={{fontSize:9,color:'var(--text-secondary)',marginBottom:3}}>Monthly SIP (₹)</div>
                          <input type="number" min="0" step="500" value={g.funds?.[f.id]||0} onChange={e=>updateFundSIP(gid,f.id,e.target.value)}
                            style={{width:'100%',padding:'4px 6px',border:bs,borderRadius:'var(--radius-md)',fontSize:12,background:'var(--bg)',color:'var(--text-primary)'}}/>
                        </div>
                        <div>
                          <div style={{fontSize:9,color:'var(--text-secondary)',marginBottom:3}}>SIP date</div>
                          <input type="number" min="1" max="28" value={g.sipDates?.[f.id]||1} onChange={e=>updateSIPDate(gid,f.id,e.target.value)}
                            style={{width:'100%',padding:'4px 6px',border:bs,borderRadius:'var(--radius-md)',fontSize:12,background:'var(--bg)',color:'var(--text-primary)'}}/>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{fontSize:10,color:'var(--text-tertiary)'}}>All changes auto-saved to your browser. Clear browser data to reset.</div>
          </div>
        )}

        {rulesOpen&&(
          <div style={{marginBottom:14,padding:'1.1rem 1.25rem',background:'var(--bg)',borderRadius:'var(--radius-lg)',border:bs}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.25rem'}}>
              <div>
                <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--text-secondary)',fontWeight:500,marginBottom:8}}>Rolling Avg Period</div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {[7,14,30,60,90].map(d=>(
                    <button key={d} onClick={()=>setAvgDays(d)}
                      style={{padding:'4px 11px',borderRadius:99,border:'0.5px solid var(--border-strong)',background:avgDays===d?'var(--text-primary)':'transparent',color:avgDays===d?'var(--bg)':'var(--text-secondary)',fontSize:12}}>{d}d</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--text-secondary)',fontWeight:500,marginBottom:8}}>Dip Alert Threshold</div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {[3,5,7,10,15].map(d=>(
                    <button key={d} onClick={()=>setDipPct(d)}
                      style={{padding:'4px 11px',borderRadius:99,border:'0.5px solid var(--border-strong)',background:dipPct===d?'#E24B4A':'transparent',color:dipPct===d?'white':'var(--text-secondary)',fontSize:12}}>{d}%</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{marginTop:12,padding:'8px 12px',background:'var(--bg-secondary)',borderRadius:'var(--radius-md)',fontSize:11,color:'var(--text-secondary)',lineHeight:1.7}}>
              🔴 <b style={{fontWeight:500}}>Buy Dip</b> = NAV &gt; {dipPct}% below {avgDays}d avg &nbsp;·&nbsp;
              🟡 <b style={{fontWeight:500}}>Watch</b> = {(dipPct/2).toFixed(1)}–{dipPct}% below &nbsp;·&nbsp;
              🟢 <b style={{fontWeight:500}}>Strong Run</b> = &gt; {dipPct}% above avg
            </div>
          </div>
        )}

        {/* SW-3: Dip Prioritisation panel — appears when user has entered a lump sum.
            Ranks all Buy Dip fund–goal pairs by conviction score and suggests allocation.
            Positioned above fund cards so the user sees the recommendation first. */}
        <DipPrioritisation
          lumpSum={lumpSum}
          funds={FUNDS}
          metrics={metrics}
          goalsConfig={goalsConfig}
          marketPE={marketPE}
          healthMap={healthMap}
        />

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12}}>
          {visible.map(fund=>(
            <Card key={fund.id} fund={fund} status={st[fund.id]||'loading'} m={metrics[fund.id]} data={fd[fund.id]}
              isSel={sel===fund.id} avgDays={avgDays} dipPct={dipPct} goalsConfig={goalsConfig} marketPE={marketPE}
              onSelect={()=>setSel(sel===fund.id?null:fund.id)} onRetry={()=>loadFund(fund)}/>
          ))}
        </div>

        <GoalDashboard goalsConfig={goalsConfig} funds={FUNDS} onUpdateGoalsConfig={setGoalsConfig} onHealthUpdate={setHealthMap} />
      </main>

      <footer style={{padding:'1rem 1.5rem',marginTop:'1rem',borderTop:bs,textAlign:'center',fontSize:10,color:'var(--text-tertiary)',lineHeight:1.7}}>
        Data: mfapi.in · P/E: NSE India ({peStatus==='live'?'live':'estimated'}) · Informational only — not financial advice · Project Artha v3.0
      </footer>
    </div>
  )
}
