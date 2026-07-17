# Advanced Reports

The Advanced Reports tab is implemented as a client-side analytics layer plus presentation components under the existing Reports page.

## Source Fields

Core metrics use the existing `Trade` fields:

- `entryDate`, `exitDate`
- `symbol`
- `side`
- `quantity`
- `grossPnl`
- `netPnl`
- `commissions`
- `fees`
- `strategy` / frontend `setup`
- `tags`
- optional future-compatible fields such as `plannedInitialRisk`, `mfe`, `mae`, `exitReason`, `entryReason`, `orderType`, `marketCondition`, and `ruleCompliance`

The current schema does not store planned initial risk, intratrade high/low excursion history, intended execution prices, spread costs, borrow fees, or explicit rule-compliance classifications. Metrics requiring those fields are shown as unavailable instead of estimated.

## P&L, Fees, And Commissions

Net metrics use the existing frontend P&L utility:

- If `grossPnl` exists, net P&L is `grossPnl - commissions - fees`.
- If only `netPnl` exists, that stored value is used.
- Missing commissions or fees are treated as zero.
- Gross-only metrics use `grossPnl`.

Trading-cost drag uses recorded commissions and fees. Spread, borrow, and slippage costs are listed as unavailable unless future trade records provide source fields.

## Long, Short, And Partial Exits

Advanced Reports relies on the app's stored trade-level P&L, so long/short normalization and partial-exit aggregation remain consistent with the import and trade-entry pipeline. Execution rows are not independently revalued in Advanced Reports to avoid double-counting scaled fills.

## Breakeven Trades

Breakeven trades are trades with net P&L equal to zero. They are counted separately from winners and losers and reset losing-streak calculations.

## R-Multiple Derivation

R metrics are calculated only when a reliable planned initial risk field exists:

`net trade result / planned initial risk`

Accepted field names are `plannedInitialRisk`, `plannedRisk`, `initialRisk`, or `riskAmount`. Zero, missing, negative, or malformed risk values make the trade unavailable for R metrics. Realized losses are never used to infer planned risk.

## Formulas

- Net expectancy: `(win rate x average winning trade) - (loss rate x absolute average losing trade)`
- Profit factor: `gross profit / absolute gross loss`
- Payoff ratio: `average winning trade / absolute average losing trade`
- Trading-cost drag: `total recorded trading costs / gross trading profit`
- Edge ratio: `average MFE / absolute average MAE`
- MFE capture: `realized net profit / MFE`, calculated for profitable trades with positive MFE
- Profit giveback: `MFE - realized net result`
- Peak-to-close session giveback: `peak intraday cumulative closed-trade net P&L - final session net P&L`
- Drawdown: decline from a previous cumulative closed-trade equity peak

Tail-loss percentiles use the nearest-rank method on absolute losing-trade magnitudes.

## Session And Timezone Logic

Market sessions use `America/New_York`. Time-of-day buckets are based on the regular US equity session:

- Market open to +5 minutes
- +5 to +15 minutes
- +15 to +30 minutes
- +30 to +60 minutes
- Midday
- Final trading hour
- Outside regular session

Weekly reports use ISO-style Monday week starts based on the market-day key. Monthly reports use the market month. Deposits, withdrawals, transfers, and open positions are not included in drawdown.

## Known Limitations

- MFE, MAE, edge ratio, MFE capture, profit giveback, and winner MAE require recorded excursions or intratrade price history.
- Slippage requires intended, signal, decision, or expected execution prices.
- Rule compliance and discipline cost require a trade-level compliance category.
- Time to MFE and time to maximum loss require intratrade history.
- R-based metrics require planned initial risk.
- Advanced Reports currently runs client-side with memoized React calculations, matching the existing Reports architecture.
