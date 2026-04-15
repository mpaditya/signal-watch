import requests, os, statistics
from datetime import datetime

FUNDS = [
    {"id":"niscf", "name":"Nippon India Small Cap",     "search":"Nippon India Small Cap",      "goals":["Retirement 22Y","Education 12Y"], "alert":True},
    {"id":"hdfcsc","name":"HDFC Small Cap",             "search":"HDFC Small Cap Fund",         "goals":["Retirement 22Y","Education 12Y"], "alert":True},
    {"id":"hdfcmd","name":"HDFC Mid-Cap Opportunities", "search":"HDFC Mid Cap Fund",           "goals":["Retirement 22Y","Education 12Y"], "alert":True},
    {"id":"nimcap","name":"Nippon India MultiCap",       "search":"Nippon India Multi Cap",      "goals":["Retirement 22Y"],                "alert":True},
    {"id":"hdfcfc","name":"HDFC Flexi Cap",             "search":"HDFC Flexi Cap Fund",         "goals":["Retirement 22Y","Education 12Y"], "alert":True},
    {"id":"mirae", "name":"Mirae Large & Midcap",       "search":"Mirae Asset Large",           "goals":["Retirement 22Y","Education 12Y"], "alert":True},
    {"id":"sbiarb","name":"SBI Arbitrage Opps",          "search":"SBI Arbitrage Opportunities", "goals":["Education 12Y"],                 "alert":False},
    {"id":"sbisc", "name":"SBI Small Cap",              "search":"SBI Small Cap Fund",          "goals":["Retirement 22Y","Education 12Y"], "alert":True},
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

def compute(navs):
    if not navs or len(navs) < 5: return None
    vals = [float(d['nav']) for d in navs]
    cur  = vals[0]
    avg  = statistics.mean(vals[:min(AVG_DAYS, len(vals))])
    from_avg = (cur - avg) / avg * 100
    ret_1m = (cur - vals[min(21,len(vals)-1)]) / vals[min(21,len(vals)-1)] * 100
    ret_1y = (cur - vals[min(252,len(vals)-1)]) / vals[min(252,len(vals)-1)] * 100 if len(vals)>252 else None
    if   from_avg <= -DIP_PCT:       signal = "BUY DIP 🔴"
    elif from_avg <= -(DIP_PCT/2):   signal = "WATCH 🟡"
    elif from_avg >=  DIP_PCT:       signal = "STRONG RUN 🟢"
    else:                             signal = "NEUTRAL ⚪"
    return {"cur":cur,"avg":avg,"from_avg":from_avg,"signal":signal,"ret_1m":ret_1m,"ret_1y":ret_1y}

def send_email(subject, html_body):
    api_key = os.environ["RESEND_API_KEY"]
    to_addr = os.environ["ALERT_EMAIL"]
    resp = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"from": "Signal Watch <onboarding@resend.dev>", "to": [to_addr], "subject": subject, "html": html_body}
    )
    print(f"Resend response: {resp.status_code} {resp.text}")
    if resp.status_code not in (200, 201):
        raise Exception(f"Email failed: {resp.text}")

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
        # Only trigger alerts for funds with alert:True
        if f["alert"] and ("DIP" in m["signal"] or "WATCH" in m["signal"]):
            alerts.append({**f, **m})

    today = datetime.now().strftime("%-d %B %Y")  # e.g. "15 April 2026"

    # Build fund table rows
    rows = ""
    for r in results:
        if r.get("error"):
            rows += f'''<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #eee">
                    <b>{r["name"]}</b><br>
                    <small style="color:#999">{", ".join(r["goals"])}</small>
                </td>
                <td colspan="5" style="padding:8px 12px;color:#E24B4A;border-bottom:1px solid #eee">Could not load</td>
            </tr>'''
            continue

        sig_color = "#A32D2D" if "DIP" in r["signal"] else "#854F0B" if "WATCH" in r["signal"] else "#3B6D11" if "RUN" in r["signal"] else "#5F5E5A"
        avg_color = "#3B6D11" if r["from_avg"] >= 0 else "#A32D2D"
        r1m_color = "#3B6D11" if r["ret_1m"] >= 0 else "#A32D2D"
        r1y_str   = f'{r["ret_1y"]:+.1f}%' if r.get("ret_1y") is not None else "—"
        r1y_color = "#3B6D11" if r.get("ret_1y") and r["ret_1y"] >= 0 else "#A32D2D"
        alert_off = "" if r["alert"] else ' <span style="font-size:10px;color:#aaa">(alerts off)</span>'

        rows += f'''<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee">
                <b>{r["name"]}</b>{alert_off}<br>
                <small style="color:#999">{", ".join(r["goals"])}</small>
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600">&#8377;{r["cur"]:.2f}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;color:{avg_color}">{r["from_avg"]:+.1f}%</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;color:{r1m_color}">{r["ret_1m"]:+.1f}%</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;color:{r1y_color}">{r1y_str}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;color:{sig_color}">{r["signal"]}</td>
        </tr>'''

    # Alert action items section
    alert_section = ""
    if alerts:
        items = "".join(
            f'<li style="margin:6px 0"><b>{a["name"]}</b> — {a["signal"]} &nbsp;·&nbsp; {a["from_avg"]:+.1f}% vs {AVG_DAYS}d avg &nbsp;·&nbsp; <span style="color:#666">{", ".join(a["goals"])}</span></li>'
            for a in alerts
        )
        alert_section = f'''<div style="background:#FFF8ED;border-left:4px solid #BA7517;padding:14px 16px;margin-bottom:24px;border-radius:4px">
            <b style="color:#854F0B;font-size:14px">⚠ Action items for today</b>
            <ul style="margin:10px 0 0;padding-left:20px;font-size:13px">{items}</ul>
        </div>'''

    # Alert-off note
    muted = [f["name"] for f in FUNDS if not f["alert"]]
    muted_note = f'<p style="font-size:11px;color:#aaa;margin-top:4px">Alerts muted for: {", ".join(muted)} — shown in table for reference only.</p>' if muted else ""

    html = f"""<div style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px;color:#1a1a18">
      <div style="border-bottom:2px solid #1a1a18;padding-bottom:14px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:baseline">
        <div>
          <span style="font-size:22px;font-weight:600">Signal Watch</span>
          <span style="font-size:13px;color:#888;margin-left:10px">Project Artha</span>
        </div>
        <span style="font-size:13px;color:#888">{today}</span>
      </div>
      {alert_section}
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f5f4f0">
          <th style="padding:8px 12px;text-align:left;font-weight:500;color:#555">Fund</th>
          <th style="padding:8px 12px;text-align:left;font-weight:500;color:#555">NAV</th>
          <th style="padding:8px 12px;text-align:left;font-weight:500;color:#555">vs {AVG_DAYS}d avg</th>
          <th style="padding:8px 12px;text-align:left;font-weight:500;color:#555">1M</th>
          <th style="padding:8px 12px;text-align:left;font-weight:500;color:#555">1Y</th>
          <th style="padding:8px 12px;text-align:left;font-weight:500;color:#555">Signal</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
      {muted_note}
      <p style="font-size:11px;color:#bbb;margin-top:20px;border-top:1px solid #eee;padding-top:14px">
        mfapi.in &nbsp;·&nbsp; Dip threshold: {DIP_PCT}% &nbsp;·&nbsp; Avg period: {AVG_DAYS}d &nbsp;·&nbsp; Informational only — not financial advice
      </p>
    </div>"""

    # Clean plain-text subject — no HTML entities
    if alerts:
        subject = f"⚠ Signal Watch — {len(alerts)} fund(s) need attention · {today}"
    else:
        subject = f"✅ Signal Watch — All Clear · {today}"

    send_email(subject, html)
    print(f"Done: {subject}")

if __name__ == "__main__":
    main()
