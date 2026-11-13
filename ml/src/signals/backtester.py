"""Backtesting de estrategias basadas en señales BUY/HOLD/SELL frente a Buy & Hold.

Reglas (ver CLAUDE.md):
- Capital inicial: 10.000€ (normalizado para comparar entre activos)
- Comisión: 0.1% por lado, sin apalancamiento ni posiciones cortas
- Benchmark: Buy & Hold del mismo activo en el mismo periodo
"""

import numpy as np
import pandas as pd

COMMISSION_RATE = 0.001
TRADING_DAYS_PER_YEAR = 252


def run_backtest(ticker: str, signals_history: pd.DataFrame, prices: pd.DataFrame, initial_capital: float = 10_000.0) -> dict:
    """signals_history: DataFrame indexado por fecha con columna `action` (BUY/HOLD/SELL).
    prices: DataFrame indexado por fecha con columna `close`.
    """
    aligned = prices[["close"]].join(signals_history[["action"]], how="left")
    aligned["action"] = aligned["action"].ffill().fillna("HOLD")

    strategy_curve, trades = _simulate_strategy(aligned, initial_capital)
    benchmark_curve = _simulate_buy_and_hold(aligned["close"], initial_capital)

    return {
        "ticker": ticker,
        "initial_capital": initial_capital,
        "equity_curve": [
            {"date": date.isoformat(), "value": round(float(strat), 2), "benchmark": round(float(bench), 2)}
            for date, strat, bench in zip(strategy_curve.index, strategy_curve.values, benchmark_curve.values)
        ],
        "strategy": _summarize(strategy_curve, trades),
        "benchmark": _summarize(benchmark_curve, trades=None),
    }


def _simulate_strategy(df: pd.DataFrame, initial_capital: float) -> tuple[pd.Series, list[dict]]:
    cash = initial_capital
    shares = 0.0
    entry_price = None
    entry_cost = None
    entry_date = None

    equity_values: list[float] = []
    trades: list[dict] = []

    for date, row in df.iterrows():
        price = float(row["close"])
        action = row["action"]

        if action == "BUY" and shares == 0:
            entry_cost = cash
            shares = (cash * (1 - COMMISSION_RATE)) / price
            entry_price = price
            entry_date = date
            cash = 0.0
        elif action == "SELL" and shares > 0:
            proceeds = shares * price * (1 - COMMISSION_RATE)
            trades.append({
                "entry_date": entry_date.isoformat(),
                "exit_date": date.isoformat(),
                "entry_price": round(entry_price, 4),
                "exit_price": round(price, 4),
                "pnl": round(proceeds - entry_cost, 2),
                "pnl_pct": round(proceeds / entry_cost - 1, 4),
            })
            cash = proceeds
            shares = 0.0
            entry_price = entry_cost = entry_date = None

        equity_values.append(cash + shares * price)

    return pd.Series(equity_values, index=df.index, name="equity"), trades


def _simulate_buy_and_hold(close: pd.Series, initial_capital: float) -> pd.Series:
    first_price = float(close.iloc[0])
    shares = (initial_capital * (1 - COMMISSION_RATE)) / first_price
    return (shares * close).rename("benchmark")


def _summarize(equity_curve: pd.Series, trades: list[dict] | None) -> dict:
    returns = equity_curve.pct_change().dropna()
    total_return = float(equity_curve.iloc[-1] / equity_curve.iloc[0] - 1)

    summary = {
        "total_return": round(total_return, 4),
        "sharpe_ratio": _sharpe(returns),
        "sortino_ratio": _sortino(returns),
        "max_drawdown": _max_drawdown(equity_curve),
    }

    if trades is not None:
        summary["hit_rate"] = _hit_rate(trades)
        summary["profit_factor"] = _profit_factor(trades)
        summary["n_trades"] = len(trades)
        summary["trades"] = trades

    return summary


def _sharpe(returns: pd.Series) -> float | None:
    if returns.empty or returns.std() == 0:
        return None
    return round(float(returns.mean() / returns.std() * np.sqrt(TRADING_DAYS_PER_YEAR)), 4)


def _sortino(returns: pd.Series) -> float | None:
    downside = returns[returns < 0]
    if returns.empty or downside.std() == 0:
        return None
    return round(float(returns.mean() / downside.std() * np.sqrt(TRADING_DAYS_PER_YEAR)), 4)


def _max_drawdown(equity_curve: pd.Series) -> float:
    running_max = equity_curve.cummax()
    drawdown = equity_curve / running_max - 1
    return round(float(drawdown.min()), 4)


def _hit_rate(trades: list[dict]) -> float | None:
    if not trades:
        return None
    winners = sum(1 for t in trades if t["pnl"] > 0)
    return round(winners / len(trades), 4)


def _profit_factor(trades: list[dict]) -> float | None:
    gains = sum(t["pnl"] for t in trades if t["pnl"] > 0)
    losses = abs(sum(t["pnl"] for t in trades if t["pnl"] < 0))
    if losses == 0:
        return None
    return round(gains / losses, 4)
