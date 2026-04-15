import requests, os, smtplib, statistics
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

FUNDS = [
    {"id":"niscf", "name":"Nippon India Small Cap",     "search":"Nippon India Small Cap",      "goals":["Retirement 22Y","Education 12Y"]},
    {"id":"hdfcsc","name":"HDFC Small Cap",             "search":"HDFC Small Cap Fund",         "goals":["Retirement 22Y","Education 12Y"]},
    {"id":"hdfcmd","name":"HDFC Mid-Cap Opportunities", "search":"HDFC Mid Cap Fund",           "goals":["Retirement 22Y","Education 12Y"]},
    {"id":"nimcap","name":"Nippon India MultiCap",       "search":"Nippon India Multi Cap",      "goals":["Retirement 22Y"]},
    {"id":"hdfcfc","name":"HDFC Flexi Cap",             "search":"HDFC Flexi Cap Fund",         "goals":["Retirement 22Y","Education 12Y"]},
    {"id":"mirae", "name":"Mirae Large & Midcap",       "search":"Mirae Asset Large",           "goals":["Retirement 22Y","Education 12Y"]},
    {"id":"sbiarb","name":"SBI Arbitrage Opps",          "search":"SBI Arbitrage Opportunities", "goals":["Education 12Y"]},
    {"id":"sbisc", "name":"SBI Small Cap",              "search":"SBI Small Cap Fund",          "goals":["Retirement 22Y","Education 12Y"]},
]

AVG_DAYS = 30
DIP_PCT  = 5

def fetch_navs(search_q):
    try:
        r = requests.get(f"https://api.mfapi.in/mf/search?q={requests.utils.quote(search_q)}", timeout=10)
        results = r.json()
        match = next((x for x in results if 'direct' in x['schemeName'].lower()
                      and 'growth' in x['schemeName'].lower()
                      and 'dividend' not in x['schemeName'].lower()), results[0] if results else None)
        if not match: return None, None
        r2 = requests.get(f"https://api.mfapi.in/mf/{match['schemeCode']}", timeout=10)
        data = r2.json()
        return match['schemeName'], data['data']
    except:
        return None, None

def compute(navs, avg_days=AVG_DAYS, dip_pct=DIP_PCT):
    if not navs or len(navs) < 5: return None
    vals = [float(d['nav']) for d in navs]
    cur  = vals[0]
    avg  = statistics.mean(vals[:min(avg_days, len(vals))])
    from_avg = (cur - avg) / avg * 100
    ret_1m = (cur - vals[min(21,len(vals)-1)]) / vals[min(21,len(vals)-1)] * 100
    ret_1y = (cur - vals[min(252,len(vals)-1)]) / vals[min(252,len(vals)-1)] * 100 if len(vals)>252 else None
    if   from_avg <= -dip_pct:       signal = "BUY DIP 🔴"
    elif from_avg <= -(dip_pct/2):   signal = "WATCH 🟡"
    elif from_avg >=  dip_pct:       signal = "STRONG RUN 🟢"
    else:                             signal = "NEUTRAL ⚪"
    return {"cur":cur,"avg":avg,"from_avg":from_avg,"signal":signal,"ret_1m":ret_1m,"ret_1y":ret_1y}

def send_email(subject, html_body):
    user = os.environ["GMAIL_USER"]
    pw   = os.environ["GMAIL_PASS"]
    to   = os.environ["ALERT_EMAIL"]
    msg  = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = user
    msg["To"]      = to
    msg.attach(MIMEText(html_body, "html"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
        s.login(user, pw)
        s.sendmail(user, to, msg.as_string())

def main():
    results, alerts = [], []
    for f in FUNDS:
        name, navs = fetch_navs(f["search"])
        m = compute(navs)
        if not m:
            results.append({**f, "error": True})
            continue
        m["matched_name"] = name
        results.append({**f, **m, "error": False})
        if "DIP" in m["signal"] or "WATCH" in m["signal"]:
            alerts.append({**f, **m})

    today = datetime.now().strftime("%d %b %Y")
    signal_counts = {}
    for r in results:
        if not r.get("error"):
            s = r["signal"]
            signal_counts[s] = signal_counts.get(s,0) + 1

    rows = ""
    for r in results:
        if r.get("error"):
            rows += f'<tr><td style="padding:8px 12px;border-bottom:1px solid #eee"><b>{r["name"]}</b><br><small style="color:#999">{", ".join(r["goals"])}</small></td><td colspan="5" style="padding:8px 12px;color:#E24B4A;border-bottom:1px solid #eee">Could not load</td></tr>'
            continue
        sig_color = "#A32D2D" if "DIP" in r["signal"] else "#854F0B" if "WATCH" in r["signal"] else "#3B6D11" if "RUN" in r["signal"] else "#5F5E5A"
        rows += f'''<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee"><b>{r["name"]}</b><br><small style="color:#999">{", ".join(r["goals"])}</small></td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600">₹{r["cur"]:.2f}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;color:{"#3B6D11" if r["from_avg"]>=0 else "#A32D2D"}">{r["from_avg"]:+.1f}%</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;color:{"#3B6D11" if r["ret_1m"]>=0 else "#A32D2D"}">{r["ret_1m"]:+.1f}%</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;color:{"#3B6D11" if r.get("ret_1y") and r["ret_1y"]>=0 else "#A32D2D"}">{f'{r["ret_1y"]:+.1f}%' if r.get("ret_1y") else "--"}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;color:{sig_color}">{r["signal"]}</td>
        </tr>'''

    alert_section = ""
    if alerts:
        alert_section = '<div style="background:#FFF3CD;border-left:4px solid #BA7517;padding:12px 16px;margin-bottom:20px;border-radius:4px"><b style="color:#854F0B">⚠ Action Items Today</b><ul style="margin:8px 0 0;padding-left:20px">'
        for a in alerts:
            alert_section += f'<li style="margin:4px 0"><b>{a["name"]}</b> — {a["signal"]} · {a["from_avg"]:+.1f}% vs {AVG_DAYS}d avg · Goals: {", ".join(a["goals"])}</li>'
        alert_section += "</ul></div>"

    html = f"""
    <div style="font-family:'DM Sans',system-ui,sans-serif;max-width:700px;margin:0 auto;padding:20px">
      <div style="border-bottom:2px solid #1a1a18;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:baseline">
        <h2 style="margin:0;font-size:20px">📊 Signal Watch · {today}</h2>
        <span style="font-size:12px;color:#888">Project Artha</span>
      </div>
      {alert_section}
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f5f4f0">
            <th style="padding:8px 12px;text-align:left;font-weight:500">Fund</th>
            <th style="padding:8px 12px;text-align:left;font-weight:500">NAV</th>
            <th style="padding:8px 12px;text-align:left;font-weight:500">vs {AVG_DAYS}d avg</th>
            <th style="padding:8px 12px;text-align:left;font-weight:500">1M</th>
            <th style="padding:8px 12px;text-align:left;font-weight:500">1Y</th>
            <th style="padding:8px 12px;text-align:left;font-weight:500">Signal</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      <p style="font-size:11px;color:#999;margin-top:20px;border-top:1px solid #eee;padding-top:12px">
        Data: mfapi.in · Dip threshold: {DIP_PCT}% · Avg period: {AVG_DAYS}d · Informational only — not financial advice
      </p>
    </div>"""

    has_alerts = bool(alerts)
    subject = f"⚠ Signal Watch Alert — {len(alerts)} fund(s) need attention · {today}" if has_alerts else f"✅ Signal Watch — All Clear · {today}"
    send_email(subject, html)
    print(f"Email sent: {subject}")

if __name__ == "__main__":
    main()
