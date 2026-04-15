import{useState,useEffect,useMemo,useCallback}from'react'
import{LineChart,Line,ResponsiveContainer,Tooltip}from'recharts'

const FUNDS=[
  {id:'niscf', name:'Nippon India Small Cap',     searchQ:'Nippon India Small Cap',      goals:['retirement','education'],category:'Small Cap'},
  {id:'hdfcsc',name:'HDFC Small Cap',             searchQ:'HDFC Small Cap Fund',         goals:['retirement','education'],category:'Small Cap'},
  {id:'hdfcmd',name:'HDFC Mid-Cap Opportunities', searchQ:'HDFC Mid Cap Fund',   goals:['retirement','education'],category:'Mid Cap'},
  {id:'nimcap',name:'Nippon India MultiCap',       searchQ:'Nippon India Multi Cap',      goals:['retirement'],           category:'Multi Cap'},
  {id:'hdfcfc',name:'HDFC Flexi Cap',             searchQ:'HDFC Flexi Cap Fund',         goals:['retirement','education'],category:'Flexi Cap'},
  {id:'mirae', name:'Mirae Large & Midcap',       searchQ:'Mirae Asset Large',           goals:['retirement','education'],category:'Large & Mid Cap'},
  {id:'sbiarb',name:'SBI Arbitrage Opps',          searchQ:'SBI Arbitrage Opportunities', goals:['education'],            category:'Arbitrage'},
  {id:'sbisc', name:'SBI Small Cap',              searchQ:'SBI Small Cap Fund',          goals:['retirement','education'],category:'Small Cap'},
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

const DEFAULT_GOALS={
  retirement:{label:'Retirement',yearsLeft:22,targetLakh:500,emoji:'🎯'},
  education: {label:'Kids Education',yearsLeft:12,targetLakh:75,emoji:'🎓'},
}

const fmtINR=n=>`₹${parseFloat(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmtPct=(n,d=2)=>n==null?'--':(n>=0?'+':'')+parseFloat(n).toFixed(d)+'%'
const pctClr=n=>n==null?'var(--text-secondary)':n>=0?'#3B6D11':'#A32D2D'

function goalContext(yearsLeft){
  if(yearsLeft>15)return{
    horizon:'Long term',color:'#3B6D11',bg:'#EAF3DE',
    dip:`Strong buy signal. With ${yearsLeft}Y remaining every dip is an opportunity. Top up SIP or add a lump sum without hesitation.`,
    run:`Continue SIP as planned. Strong momentum is fine at this horizon — stay invested.`,
    watch:`Worth monitoring. If it crosses the dip threshold, add more.`,
    neutral:`Stay fully invested. Continue SIP. Time is your biggest asset.`,
    note:`${yearsLeft}Y horizon — stay 100% in equity. Use every correction.`,
    noteColor:'#3B6D11',noteBg:'#EAF3DE',
  }
  if(yearsLeft>10)return{
    horizon:'Long term',color:'#3B6D11',bg:'#EAF3DE',
    dip:`Good buying opportunity. ${yearsLeft}Y is plenty of time to recover. Consider topping up SIP this month.`,
    run:`Continue SIP. In the next 2–3 years, start thinking about a gradual large-cap tilt.`,
    watch:`Monitor closely. A further dip is worth adding to.`,
    neutral:`Stay invested. Continue SIP. Begin planning your glide path for the last 5 years.`,
    note:`${yearsLeft}Y horizon — equity appropriate. Start glide-path planning around Year 5.`,
    noteColor:'#3B6D11',noteBg:'#EAF3DE',
  }
  if(yearsLeft>5)return{
    horizon:'Medium term',color:'#854F0B',bg:'#FAEEDA',
    dip:`Buying opportunity, but be selective. With ${yearsLeft}Y left, begin shifting 20–30% of this fund toward large cap or hybrid over the next 1–2 years.`,
    run:`Good time to book 15–20% profits and move them to a large-cap or hybrid fund as part of your glide path.`,
    watch:`Be cautious. Use this as a prompt to review your allocation — you should be derisking gradually now.`,
    neutral:`Begin glide path now. Target moving 10–15% per year into large cap or hybrid funds.`,
    note:`${yearsLeft}Y horizon — start derisking. Target 60% equity, 40% hybrid/debt by Year 3.`,
    noteColor:'#854F0B',noteBg:'#FAEEDA',
  }
  if(yearsLeft>2)return{
    horizon:'Short term',color:'#A32D2D',bg:'#FCEBEB',
    dip:`Do NOT add to small/mid cap. Capital preservation is the priority now. Consider switching this fund to a large-cap or debt fund instead.`,
    run:`Book partial profits now and move to debt or arbitrage funds. Do not let greed delay your derisking.`,
    watch:`Treat this as a sell signal, not a buy. Move at least 30–40% to safer instruments.`,
    neutral:`Accelerate derisking immediately. With ${yearsLeft}Y left you should have max 30–40% in equity.`,
    note:`${yearsLeft}Y horizon — capital preservation priority. Max 40% equity. Move rest to debt/arbitrage.`,
    noteColor:'#A32D2D',noteBg:'#FCEBEB',
  }
  return{
    horizon:'Imminent',color:'#A32D2D',bg:'#FCEBEB',
    dip:`Goal is imminent — do not take any equity risk. Move everything to liquid or debt funds now.`,
    run:`Book all profits immediately and move to a liquid fund. The goal is too close to risk a correction.`,
    watch:`Exit this position. Move to liquid fund immediately.`,
    neutral:`Exit equity completely. Move to liquid or ultra-short debt fund now.`,
    note:`${yearsLeft}Y to goal — EXIT equity. Move 100% to liquid/debt funds immediately.`,
    noteColor:'#A32D2D',noteBg:'#FCEBEB',
  }
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
  const signal=fromAvg<=-dipPct?SIG.dip:fromAvg<=-(dipPct/2)?SIG.watch:fromAvg>=dipPct?SIG.run:SIG.neutral
  const spark=raw.slice(0,60).reverse().map((d,i)=>({i,nav:parseFloat(d.nav),date:d.date}))
  const chart=raw.slice(0,365).reverse().map((d,i)=>({i,nav:parseFloat(d.nav),date:d.date}))
  return{cur,avg,fromAvg,hi,lo,rangePct,signal,spark,chart,
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

function GoalAdvice({fund,m,goalsConfig,avgDays,dipPct}){
  if(!m)return null
  const relevantGoals=fund.goals.filter(g=>goalsConfig[g])
  if(!relevantGoals.length)return null
  return(
    <div style={{marginTop:10}}>
      <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text-secondary)',marginBottom:8}}>
        Goal-Aware Advice
      </div>
      {relevantGoals.map(gid=>{
        const gc=goalsConfig[gid]
        const ctx=goalContext(gc.yearsLeft)
        const advice=fund.category==='Arbitrage'
          ?'Arbitrage fund — use as a parking instrument for near-term goal corpus. Low risk, predictable ~7% returns.'
          :m.signal.id==='dip'?ctx.dip
          :m.signal.id==='watch'?ctx.watch
          :m.signal.id==='run'?ctx.run
          :ctx.neutral
        return(
          <div key={gid} style={{marginBottom:8,padding:'10px 12px',background:ctx.bg,borderRadius:'var(--radius-md)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <div style={{fontSize:11,fontWeight:500,color:ctx.color}}>
                {gc.emoji} {gc.label}
              </div>
              <div style={{display:'flex',gap:6}}>
                <span style={{fontSize:10,padding:'1px 7px',borderRadius:99,background:'rgba(0,0,0,0.06)',color:ctx.color,fontWeight:500}}>
                  {gc.yearsLeft}Y left
                </span>
                <span style={{fontSize:10,padding:'1px 7px',borderRadius:99,background:'rgba(0,0,0,0.06)',color:ctx.color,fontWeight:500}}>
                  Target ₹{gc.targetLakh}L
                </span>
              </div>
            </div>
            <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.65}}>{advice}</div>
            <div style={{marginTop:6,fontSize:10,fontStyle:'italic',color:ctx.color,borderTop:'0.5px solid rgba(0,0,0,0.08)',paddingTop:5}}>
              {ctx.note}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Card({fund,status,m,data,isSel,avgDays,dipPct,goalsConfig,onSelect,onRetry}){
  const cs=CAT[fund.category]||CAT['Multi Cap']
  const bs='0.5px solid var(--border)'
  return(
    <div
      onClick={()=>status==='done'&&onSelect()}
      style={{background:'var(--bg)',borderRadius:'var(--radius-lg)',padding:'1rem',
        border:isSel?'1.5px solid var(--text-primary)':bs,
        cursor:status==='done'?'pointer':'default',
        transition:'border-color .15s',
        boxShadow:isSel?'0 0 0 3px rgba(0,0,0,0.06)':'none'}}
    >
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:cs.bg,color:cs.text,fontWeight:500}}>
            {fund.category}
          </span>
          <div style={{fontSize:13,fontWeight:500,marginTop:5,lineHeight:1.3}}>{fund.name}</div>
          <div style={{fontSize:10,color:'var(--text-secondary)',marginTop:2}}>
            {fund.goals.map(g=>goalsConfig[g]?`${goalsConfig[g].emoji} ${goalsConfig[g].yearsLeft}Y`:g).join(' · ')}
          </div>
        </div>
        {m&&(
          <span style={{marginLeft:8,flexShrink:0,padding:'3px 9px',borderRadius:99,fontSize:10,fontWeight:500,background:m.signal.bg,color:m.signal.color}}>
            {m.signal.label}
          </span>
        )}
      </div>

      {status==='loading'&&<div style={{textAlign:'center',padding:'1.5rem 0',fontSize:11,color:'var(--text-secondary)'}}>Fetching NAV data…</div>}
      {status==='error'&&(
        <div style={{textAlign:'center',padding:'1rem 0'}}>
          <div style={{fontSize:11,color:'#E24B4A',marginBottom:6}}>Could not load fund</div>
          <button onClick={e=>{e.stopPropagation();onRetry()}}
            style={{fontSize:11,padding:'3px 10px',border:bs,borderRadius:99,background:'transparent',color:'var(--text-secondary)'}}>
            Retry
          </button>
        </div>
      )}

      {status==='done'&&m&&(
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
            <span style={{fontSize:20,fontWeight:600,letterSpacing:'-.02em'}}>{fmtINR(m.cur)}</span>
            <span style={{fontSize:12,fontWeight:500,color:pctClr(m.r1d)}}>{fmtPct(m.r1d)} 1D</span>
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

          {!isSel&&<div style={{fontSize:9,color:'var(--text-tertiary)',marginTop:8,textAlign:'center'}}>tap for detail →</div>}

          {isSel&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:bs}}>
              <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--text-secondary)',marginBottom:8}}>
                Full Returns
              </div>
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

              <GoalAdvice fund={fund} m={m} goalsConfig={goalsConfig} avgDays={avgDays} dipPct={dipPct}/>

              {data&&(
                <div style={{fontSize:9,color:'var(--text-tertiary)',lineHeight:1.5,marginTop:8}}>
                  Matched: {data.schemeName} · Code: {data.schemeCode}
                </div>
              )}
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
  const[goalsConfig,setGoalsConfig]=useState(DEFAULT_GOALS)

  const updateGoal=(gid,field,val)=>{
    setGoalsConfig(p=>({...p,[gid]:{...p[gid],[field]:field==='yearsLeft'||field==='targetLakh'?Number(val):val}}))
  }

  const loadFund=useCallback(async fund=>{
    setSt(p=>({...p,[fund.id]:'loading'}))
    try{
      const sr=await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(fund.searchQ)}`)
      const results=await sr.json()
      const match=results.find(r=>{
        const n=r.schemeName.toLowerCase()
        return n.includes('direct')&&n.includes('growth')&&!n.includes('dividend')
      })||results[0]
      if(!match)throw new Error('not found')
      const nr=await fetch(`https://api.mfapi.in/mf/${match.schemeCode}`)
      const nj=await nr.json()
      setFd(p=>({...p,[fund.id]:{schemeCode:match.schemeCode,schemeName:match.schemeName,rawData:nj.data}}))
      setSt(p=>({...p,[fund.id]:'done'}))
    }catch{
      setSt(p=>({...p,[fund.id]:'error'}))
    }
  },[])

  useEffect(()=>{
    FUNDS.forEach((f,i)=>setTimeout(()=>loadFund(f),i*300))
  },[loadFund])

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

  const visible=goal==='all'?FUNDS:FUNDS.filter(f=>f.goals.includes(goal))
  const done=FUNDS.filter(f=>st[f.id]==='done')
  const sigCount=done.reduce((acc,f)=>{
    const s=metrics[f.id]?.signal
    if(s)acc[s.id]=(acc[s.id]||0)+1
    return acc
  },{})

  const bs='0.5px solid var(--border)'

  return(
    <div style={{minHeight:'100vh',background:'var(--bg-tertiary)'}}>
      <nav style={{background:'var(--bg)',borderBottom:bs,padding:'0 1.5rem',position:'sticky',top:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'space-between',height:52}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:18}}>📊</span>
          <div>
            <span style={{fontSize:14,fontWeight:600}}>Signal Watch</span>
            <span style={{fontSize:10,color:'var(--text-secondary)',marginLeft:6}}>Project Artha</span>
          </div>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          {Object.entries(sigCount).map(([id,count])=>{
            const s=SIG[id]
            if(!s||!count)return null
            return<span key={id} style={{padding:'2px 9px',borderRadius:99,fontSize:11,fontWeight:500,background:s.bg,color:s.color}}>{count} {s.label}</span>
          })}
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
                {g.emoji} {g.label} <b style={{fontWeight:500}}>{g.yearsLeft}Y</b> · ₹{g.targetLakh}L target
              </span>
            ))}
          </div>
        </div>
      </header>

      <main style={{maxWidth:960,margin:'0 auto',padding:'1.25rem 1.5rem'}}>
        <div style={{display:'flex',gap:0,borderBottom:bs,marginBottom:14}}>
          {[
            {id:'all',       label:'All Funds',       n:FUNDS.length},
            {id:'retirement',label:'Retirement',       n:FUNDS.filter(f=>f.goals.includes('retirement')).length},
            {id:'education', label:'Kids Education',   n:FUNDS.filter(f=>f.goals.includes('education')).length},
          ].map(t=>(
            <button key={t.id} onClick={()=>{setGoal(t.id);setSel(null)}}
              style={{padding:'7px 14px',border:'none',background:'none',fontSize:13,
                color:goal===t.id?'var(--text-primary)':'var(--text-secondary)',
                fontWeight:goal===t.id?500:400,
                borderBottom:goal===t.id?'2px solid var(--text-primary)':'2px solid transparent',
                marginBottom:-0.5,cursor:'pointer'}}>
              {t.label} <span style={{fontSize:10,opacity:.55}}>({t.n})</span>
            </button>
          ))}
        </div>

        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
          <button onClick={()=>{setGoalsOpen(!goalsOpen);setRulesOpen(false)}}
            style={{display:'flex',alignItems:'center',gap:6,padding:'5px 13px',border:'0.5px solid var(--border-strong)',borderRadius:99,background:goalsOpen?'var(--text-primary)':'var(--bg)',fontSize:12,color:goalsOpen?'var(--bg)':'var(--text-secondary)'}}>
            🎯 Goals {goalsOpen?'▲':'▼'}
          </button>
          <button onClick={()=>{setRulesOpen(!rulesOpen);setGoalsOpen(false)}}
            style={{display:'flex',alignItems:'center',gap:6,padding:'5px 13px',border:'0.5px solid var(--border-strong)',borderRadius:99,background:rulesOpen?'var(--text-primary)':'var(--bg)',fontSize:12,color:rulesOpen?'var(--bg)':'var(--text-secondary)'}}>
            ⚙ Rules · {avgDays}d avg · {dipPct}% threshold {rulesOpen?'▲':'▼'}
          </button>
        </div>

        {goalsOpen&&(
          <div style={{marginBottom:14,padding:'1.1rem 1.25rem',background:'var(--bg)',borderRadius:'var(--radius-lg)',border:bs}}>
            <div style={{fontSize:11,fontWeight:500,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text-secondary)',marginBottom:12}}>
              Configure Your Goals
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              {Object.entries(goalsConfig).map(([gid,g])=>(
                <div key={gid} style={{padding:'12px 14px',background:'var(--bg-secondary)',borderRadius:'var(--radius-md)'}}>
                  <div style={{fontSize:12,fontWeight:500,marginBottom:10}}>{g.emoji} {g.label}</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <div>
                      <div style={{fontSize:10,color:'var(--text-secondary)',marginBottom:4}}>Years remaining</div>
                      <input
                        type="number" min="1" max="40" value={g.yearsLeft}
                        onChange={e=>updateGoal(gid,'yearsLeft',e.target.value)}
                        style={{width:'100%',padding:'5px 8px',border:bs,borderRadius:'var(--radius-md)',fontSize:13,fontWeight:500,background:'var(--bg)',color:'var(--text-primary)'}}
                      />
                    </div>
                    <div>
                      <div style={{fontSize:10,color:'var(--text-secondary)',marginBottom:4}}>Target corpus (₹ Lakh)</div>
                      <input
                        type="number" min="1" value={g.targetLakh}
                        onChange={e=>updateGoal(gid,'targetLakh',e.target.value)}
                        style={{width:'100%',padding:'5px 8px',border:bs,borderRadius:'var(--radius-md)',fontSize:13,fontWeight:500,background:'var(--bg)',color:'var(--text-primary)'}}
                      />
                    </div>
                  </div>
                  <div style={{marginTop:8,fontSize:10,padding:'5px 8px',borderRadius:'var(--radius-md)',
                    background:goalContext(g.yearsLeft).bg,color:goalContext(g.yearsLeft).color}}>
                    {goalContext(g.yearsLeft).note}
                  </div>
                </div>
              ))}
            </div>
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
                      style={{padding:'4px 11px',borderRadius:99,border:'0.5px solid var(--border-strong)',
                        background:avgDays===d?'var(--text-primary)':'transparent',
                        color:avgDays===d?'var(--bg)':'var(--text-secondary)',fontSize:12}}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--text-secondary)',fontWeight:500,marginBottom:8}}>Dip Alert Threshold</div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {[3,5,7,10,15].map(d=>(
                    <button key={d} onClick={()=>setDipPct(d)}
                      style={{padding:'4px 11px',borderRadius:99,border:'0.5px solid var(--border-strong)',
                        background:dipPct===d?'#E24B4A':'transparent',
                        color:dipPct===d?'white':'var(--text-secondary)',fontSize:12}}>
                      {d}%
                    </button>
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

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12}}>
          {visible.map(fund=>(
            <Card
              key={fund.id}
              fund={fund}
              status={st[fund.id]||'loading'}
              m={metrics[fund.id]}
              data={fd[fund.id]}
              isSel={sel===fund.id}
              avgDays={avgDays}
              dipPct={dipPct}
              goalsConfig={goalsConfig}
              onSelect={()=>setSel(sel===fund.id?null:fund.id)}
              onRetry={()=>loadFund(fund)}
            />
          ))}
        </div>
      </main>

      <footer style={{padding:'1rem 1.5rem',marginTop:'1rem',borderTop:bs,textAlign:'center',fontSize:10,color:'var(--text-tertiary)',lineHeight:1.7}}>
        Data: mfapi.in (public, free) · NAV updated post-market close · Informational only — not financial advice · Project Artha v1.0
      </footer>
    </div>
  )
}
