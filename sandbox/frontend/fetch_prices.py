#!/usr/bin/env python3
"""
Fetch GOOG prices at specific timestamps using Yahoo Finance.

Each message gets two prices:
  - price:      current display price (what the stock is at right now)
  - tradePrice: execution price if you trade (= price during market hours,
                = next regular open during pre/post market)
Settlement: closing price of last trading day on/before that date.

Updates messages.json in place.
"""

import json
import sys
from datetime import datetime, timedelta, time as dtime
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    import yfinance as yf
    import pandas as pd
except ImportError:
    print("pip install yfinance pandas")
    sys.exit(1)

ET = ZoneInfo("America/New_York")
DIR = Path(__file__).parent


def is_market_hours(dt: datetime) -> bool:
    if dt.weekday() >= 5:
        return False
    return dtime(9, 30) <= dt.time() < dtime(16, 0)


def next_weekday(d):
    d += timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def lookup_current_price(dt, hourly_ext):
    """Current display price: candle close at or before dt (incl. pre/post)."""
    idx_tz = hourly_ext.index.tz
    target = pd.Timestamp(dt).tz_convert(idx_tz)
    candidates = hourly_ext[hourly_ext.index <= target]
    if candidates.empty:
        return 0.0, "NOT FOUND"
    row = candidates.iloc[-1]
    label = "ext" if not is_market_hours(dt) else "mkt"
    return round(float(row["Close"]), 2), f"{label} {row.name.strftime('%m-%d %H:%M')} close"


def lookup_trade_price(dt, hourly_reg):
    """Trade execution price: during market = same candle; outside = next open."""
    idx_tz = hourly_reg.index.tz

    if is_market_hours(dt):
        target = pd.Timestamp(dt).tz_convert(idx_tz)
        candidates = hourly_reg[hourly_reg.index <= target]
        if candidates.empty:
            return 0.0, "NOT FOUND"
        row = candidates.iloc[-1]
        return round(float(row["Close"]), 2), f"mkt {row.name.strftime('%m-%d %H:%M')} close"

    # Non-market: next regular session open
    if dt.weekday() < 5 and dt.time() < dtime(9, 30):
        open_date = dt.date()
    else:
        open_date = next_weekday(dt.date())

    day_start = pd.Timestamp(datetime.combine(open_date, dtime(0, 0)), tz=idx_tz)
    day_end = day_start + timedelta(days=1)
    day_candles = hourly_reg[(hourly_reg.index >= day_start) & (hourly_reg.index < day_end)]

    if not day_candles.empty:
        row = day_candles.iloc[0]
        return round(float(row["Open"]), 2), f"next open {row.name.strftime('%m-%d %H:%M')}"

    return 0.0, "NOT FOUND"


def lookup_settlement(dt, daily):
    """Closing price on or before settlement date."""
    idx_tz = daily.index.tz
    target = pd.Timestamp(dt.date(), tz=idx_tz) + timedelta(days=1)
    candidates = daily[daily.index < target]
    if candidates.empty:
        return 0.0, "NOT FOUND"
    row = candidates.iloc[-1]
    return round(float(row["Close"]), 2), f"close {row.name.strftime('%Y-%m-%d')}"


def main():
    path = DIR / "messages.json"

    with open(path) as f:
        data = json.load(f)

    ticker = data["ticker"]
    msgs = data["messages"]
    settle = data["settlement"]

    dts = []
    for m in msgs:
        dt = datetime.strptime(f"{m['date']} {m['time']}", "%Y-%m-%d %H:%M").replace(tzinfo=ET)
        dts.append(dt)
    settle_dt = datetime.strptime(settle["date"], "%Y-%m-%d").replace(tzinfo=ET)

    start = (min(dts) - timedelta(days=7)).strftime("%Y-%m-%d")
    end = (settle_dt + timedelta(days=7)).strftime("%Y-%m-%d")
    print(f"Downloading {ticker} ({start} → {end})...")

    stk = yf.Ticker(ticker)
    hourly_ext = stk.history(start=start, end=end, interval="1h", auto_adjust=False, prepost=True)
    hourly_reg = stk.history(start=start, end=end, interval="1h", auto_adjust=False, prepost=False)
    daily = stk.history(start=start, end=end, interval="1d", auto_adjust=False)

    if hourly_ext.empty or hourly_reg.empty or daily.empty:
        print("ERROR: no data returned")
        sys.exit(1)
    print(f"  {len(hourly_ext)} ext candles, {len(hourly_reg)} reg candles, {len(daily)} daily\n")

    print(f"{'Date':<12} {'Time':<6} {'Mkt':<4} {'Price':>8} {'Trade':>8}  {'Price Source':<28} {'Trade Source'}")
    print("-" * 100)

    for i, m in enumerate(msgs):
        dt = dts[i]
        price, p_src = lookup_current_price(dt, hourly_ext)
        trade, t_src = lookup_trade_price(dt, hourly_reg)
        mkt = "Y" if is_market_hours(dt) else "N"
        same = " =" if price == trade else ""

        m["price"] = price
        m["tradePrice"] = trade

        print(f"{m['date']:<12} {m['time']:<6} {mkt:<4} ${price:>7.2f} ${trade:>7.2f}{same}  {p_src:<28} {t_src}")

    # Settlement
    price_s, src_s = lookup_settlement(settle_dt, daily)
    settle["price"] = price_s
    print(f"{settle['date']:<12} {'close':<6} {'S':<4} ${price_s:>7.2f} ${price_s:>7.2f} =  {src_s}")

    # Update initialPrice to match first message
    data["initialPrice"] = msgs[0]["price"]

    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"\nUpdated {path.name}")


if __name__ == "__main__":
    main()
