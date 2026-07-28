#!/usr/bin/env python3
"""
FINRA Margin Statistics Auto-Updater
------------------------------------
Automates fetching the latest FINRA margin statistics and S&P 500 closing prices,
then regenerates `data.js` for the GitHub Pages dashboard.

Triggered monthly via GitHub Actions (.github/workflows/update-finra-margin.yml)
or manually via: python3 update_data.py
"""

import os
import re
import json
import urllib.request
import sys

# Optional yfinance import for fetching S&P 500 price
try:
    import yfinance as yf
except ImportError:
    yf = None

FINRA_URL = "https://www.finra.org/investors/learn-to-invest/advanced-investing/margin-statistics"
DATA_JS_PATH = os.path.join(os.path.dirname(__file__), "data.js")

def fetch_finra_page():
    """Fetch HTML content from FINRA Margin Statistics page."""
    req = urllib.request.Request(
        FINRA_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"⚠️ Error fetching FINRA page: {e}")
        return None

def parse_finra_html(html):
    """Extract margin statistics rows from FINRA HTML tables."""
    if not html:
        return []

    # Match table rows containing Year-Month and numeric data
    # Pattern looks for date like "Jan 2024" or "2024-01" or table cells
    rows = []
    
    # Simple regex parsing for HTML table cells
    tr_pattern = re.compile(r'<tr[^>]*>(.*?)</tr>', re.DOTALL | re.IGNORECASE)
    td_pattern = re.compile(r'<td[^>]*>(.*?)</td>', re.DOTALL | re.IGNORECASE)
    clean_tags = re.compile(r'<[^>]+>')

    month_map = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    }

    for tr in tr_pattern.findall(html):
        tds = td_pattern.findall(tr)
        cleaned = [clean_tags.sub('', td).strip().replace('&nbsp;', ' ') for td in tds]
        if len(cleaned) >= 4:
            raw_date = cleaned[0]
            # Try parsing date formats like "January 2024", "Jan 2024", "2024-01"
            date_str = None
            date_match = re.search(r'([A-Za-z]{3,9})\s*(\d{4})', raw_date)
            if date_match:
                m_name = date_match.group(1).lower()[:3]
                year = date_match.group(2)
                if m_name in month_map:
                    date_str = f"{year}-{month_map[m_name]}"

            if not date_str:
                iso_match = re.search(r'(\d{4})[-/](\d{1,2})', raw_date)
                if iso_match:
                    date_str = f"{iso_match.group(1)}-{int(iso_match.group(2)):02d}"

            if date_str:
                def clean_num(val):
                    v = re.sub(r'[^\d]', '', val)
                    return int(v) if v else None

                margin_debt = clean_num(cleaned[1])
                free_cash = clean_num(cleaned[2])
                credit_margin = clean_num(cleaned[3])

                if margin_debt and free_cash and credit_margin:
                    rows.append({
                        'date': date_str,
                        'marginDebt': margin_debt,
                        'freeCreditCash': free_cash,
                        'creditMargin': credit_margin
                    })

    return rows

def fetch_sp500_price(date_str):
    """Fetch approximate S&P 500 closing price for a YYYY-MM date."""
    if not yf:
        return None
    try:
        year, month = date_str.split('-')
        start_date = f"{year}-{month}-01"
        # Next month
        m_int = int(month)
        y_int = int(year)
        if m_int == 12:
            end_date = f"{y_int + 1}-01-07"
        else:
            end_date = f"{y_int}-{m_int + 1:02d}-07"

        ticker = yf.Ticker("^GSPC")
        df = ticker.history(start=start_date, end=end_date)
        if not df.empty:
            last_close = int(round(df['Close'].iloc[-1]))
            return last_close
    except Exception as e:
        print(f"⚠️ Could not fetch S&P 500 for {date_str}: {e}")
    return None

def load_existing_data():
    """Load existing FINRA_MARGIN_DATA from data.js using robust regex."""
    if not os.path.exists(DATA_JS_PATH):
        return []
    with open(DATA_JS_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    results = []
    # Match object literals like { date: '1997-01', marginDebt: 113200, ... }
    obj_pattern = re.compile(r'\{\s*date:\s*[\'"]([^\'"]+)[\'"]\s*,\s*marginDebt:\s*(\d+)\s*,\s*freeCreditCash:\s*(\d+)\s*,\s*creditMargin:\s*(\d+)(?:[^}]*?sp500:\s*(\d+))?\s*\}')
    
    for match in obj_pattern.findall(content):
        date_str, margin_debt, free_cash, credit_margin, sp500_val = match
        item = {
            'date': date_str,
            'marginDebt': int(margin_debt),
            'freeCreditCash': int(free_cash),
            'creditMargin': int(credit_margin),
            'netCredit': int(free_cash) + int(credit_margin) - int(margin_debt)
        }
        if sp500_val:
            item['sp500'] = int(sp500_val)
        results.append(item)
    return results

def save_data(data_list):
    """Save sorted FINRA_MARGIN_DATA list back to data.js."""
    # Deduplicate and sort by date
    seen = {}
    for item in data_list:
        seen[item['date']] = item

    sorted_dates = sorted(seen.keys())
    final_list = [seen[d] for d in sorted_dates]

    # Pre-compute netCredit
    for item in final_list:
        item['netCredit'] = item['freeCreditCash'] + item['creditMargin'] - item['marginDebt']

    js_lines = [
        "/**",
        " * FINRA Margin Statistics - Historical Data with S&P 500",
        " * ",
        " * Data Source: FINRA Margin Statistics & S&P 500 Index",
        " * Updated automatically via GitHub Actions (.github/workflows/update-finra-margin.yml)",
        " */",
        "",
        "const FINRA_MARGIN_DATA = ["
    ]

    for d in final_list:
        sp = f", sp500: {d['sp500']}" if 'sp500' in d and d['sp500'] else ""
        line = f"    {{ date: '{d['date']}', marginDebt: {d['marginDebt']}, freeCreditCash: {d['freeCreditCash']}, creditMargin: {d['creditMargin']}{sp} }},"
        js_lines.append(line)

    js_lines.extend([
        "];",
        "",
        "// Pre-compute net credit balance for each data point",
        "FINRA_MARGIN_DATA.forEach(d => {",
        "    d.netCredit = d.freeCreditCash + d.creditMargin - d.marginDebt;",
        "});",
        ""
    ])

    with open(DATA_JS_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(js_lines))

    print(f"✅ Successfully updated `data.js` with {len(final_list)} monthly data points (latest: {sorted_dates[-1]}).")

def main():
    print("🔄 Checking for FINRA Margin Statistics updates...")
    existing = load_existing_data()
    print(f"Currently have {len(existing)} historical records.")

    html = fetch_finra_page()
    new_rows = parse_finra_html(html)

    if new_rows:
        print(f"Parsed {len(new_rows)} rows from FINRA website.")
        existing_dates = {item['date'] for item in existing}
        added_count = 0

        for row in new_rows:
            if row['date'] not in existing_dates:
                print(f"✨ Found new month data: {row['date']}")
                sp_price = fetch_sp500_price(row['date'])
                if sp_price:
                    row['sp500'] = sp_price
                existing.append(row)
                added_count += 1

        if added_count > 0:
            save_data(existing)
        else:
            print("ℹ️ Data is already up to date. No new monthly rows found.")
    else:
        print("ℹ️ FINRA page structure not updated or network blocked. Keeping existing data.")
        # Ensure file formatting is clean
        if existing:
            save_data(existing)

if __name__ == "__main__":
    main()
