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

Blind entry reviews can supply planned initial risk, an intended first-fill price, and market-data estimates for excursions and entry spread. Reports show unavailable values when the required inputs are missing.

## P&L, Fees, And Commissions

Net metrics use the existing frontend P&L utility:

- If `grossPnl` exists, net P&L is `grossPnl - commissions - fees`.
- If only `netPnl` exists, that stored value is used.
- Missing commissions or fees are treated as zero.
- Gross-only metrics use `grossPnl`.

Trading-cost drag uses recorded commissions and fees. Entry spread and slippage are reported separately per share for covered reviews. They are not added to recorded commissions or fees. Borrow fees and missing quote or plan references continue to require source data.

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

Market sessions use `America/New_York`. Premarket runs from 04:00 through 09:29 ET and uses 04:00–07:00, 07:00–08:00, 08:00–09:00, and 09:00–09:30 buckets in Advanced Reports. The regular open starts at 09:30. After-hours and overnight trades have their own buckets.

Weekly reports use ISO-style Monday week starts based on the market-day key. Monthly reports use the market month. Deposits, withdrawals, transfers, and open positions are not included in drawdown.

## Known Limitations

- Excursions use the high and low of completed minute bars during the trade and actual position size and cash flows. Bars that straddle executions are skipped when price ordering is ambiguous. Reported round trips with hidden scale-ins or scale-outs have no estimate.
- Entry slippage compares the first actual fill with the original intended price, with positive values indicating adverse execution. Entry spread uses a SIP quote from the minute before the actual fill. Post-entry moves use the latest completed close within one minute of each horizon.
- Rule compliance and discipline cost require a trade-level compliance category.
- Time to MFE and maximum adverse excursion are available only for covered bars with known execution timing.
- R-based metrics require planned initial risk.
- Advanced Reports currently runs client-side with memoized React calculations, matching the existing Reports architecture.


## Blind Entry Review

Apply [the additive database migration](../prisma/manual/20261123_add_premarket_analysis.sql) before deploying the updated API, then run `npm run prisma:generate`. The review queue uses the current Live or Simulator account and preserves the first submitted grade. Legacy round trips with a known averaged entry show a time marker with no pre-reveal price.

## Performance Intelligence

Apply both additive SQL migrations in order before deploying the API. The second migration [moves saved outcome data into TradeAnalysis](../prisma/manual/20261123_extend_trade_analysis.sql) and preserves the original blind grade and planning fields. Prisma needs to be regenerated with `npm run prisma:generate`.

Open **Reports → Advanced** for one net performance table grouped by setup, tag, or setup plus tags. It uses the global Reports filters. Tag groups can overlap and are never summed to produce aggregate P&L. **Trading windows** shows the New York time-of-day heatmap, with 5-, 15-, 30-, and 60-minute intervals. Cells show sample sizes and link to the trades. An observed leading window requires at least 20 trades over 10 sessions. Execution and holding time and Market conditions are available below the table.

**Performance after a streak** groups the next entry after one, two, or three or more realized wins or losses. Streaks reset each New York trading day and a breakeven or unknown result breaks the streak. Only outcomes closed strictly before the next entry count. Report filters apply to the next trade, while the streak uses the account history available to Reports.

**Performance after the day opens** classifies the first one or two entries of each New York trading day by their net results. It summarizes later trades only when they were entered after the qualifying opening trades had closed. The editable large-loss threshold defaults to $100 net. Opening categories can overlap.

Use **Collect historical data** in an individual trade or **Collect next 5 trades** under Market conditions. Collected data is reconstructed historical evidence. It uses Alpaca SIP intraday bars, completed daily bars, pre-fill bid/ask quotes where entitled, and pre-entry Alpaca news. News categories use a headline-based rule on the latest eligible article. Older or edited news can be absent. The setup candidate uses completed minute bars, EMA alignment, VWAP, and price structure. You can apply the candidate to an existing setup through the normal setup workflow. A manually chosen setup stays in place until explicitly changed.

### Calculations and coverage

- **Gross expectancy** averages trades with recorded gross P&L. Net expectancy uses recorded net outcomes or gross less recorded costs. The gross-to-net difference uses trades with both results. Unpriced open positions are excluded from realized analysis.
- **Holding efficiency** divides aggregate net P&L by aggregate positive recorded position minutes. Trades with missing or zero-length intervals are excluded from this calculation.
- **Drawdown** uses cumulative realized trade outcomes in close order. Elapsed recovery spans the prior peak to the next matching or higher equity value. The R drawdown uses its own cumulative curve of trades with original planned risk. The unannualized session risk ratios divide average realized session P&L by its sample standard deviation or downside deviation around zero. They use covered trading sessions, without a capital or annualization assumption.
- **Profit capture** is realized net P&L divided by gross MFE for profitable trades with positive MFE. It is uncapped. Values above 150% are flagged for review since minute bars can miss actual fill prices or price extremes.
- **Entry efficiency** scores where the first actual fill lies in the price range from the next five minutes of completed bars. **Exit efficiency** uses the final actual fill and the preceding five minutes of completed bars held. For longs, a low entry and high exit score higher. The direction is reversed for shorts. Scores are bounded to 0–100%, and flat or missing ranges yield no estimate. MFE/MAE chart labels mark the known candle price and time when an excursion was measured.
- **Slippage** is signed per share, with positive values adverse. The original intended price and the pre-fill SIP midpoint are separate references. The plan comparison uses the first actual entry and final actual exit. Stop slippage requires an explicitly identified imported exit fill and a recorded stop price. Historical quote comparisons use a qualifying quote from the prior minute.
- **Market snapshot** uses completed data at the first fill. Premarket gap uses the last available split-adjusted premarket close before entry or the cash open, compared with the prior regular close. Relative volume uses prior sessions at the same local clock time and requires five baseline sessions. VWAP, EMA, RSI and MACD use the current session's completed minute bars. SMA and ATR use completed prior daily bars. SPY direction compares its latest eligible minute close to its prior session close. The benchmark volatility regime compares the average normalized true range of the latest 14 completed daily sessions against the preceding baseline.
- **Factor association** uses session averages of each covered factor and net P&L. At least 20 sessions and nonconstant variability are needed. Two-sided Fisher-transform p-values are approximate, with Holm adjustment across factors tested for the current filter. Session observations can still exhibit serial dependence. Results are exploratory, including ranked time windows and segmented factor bands.
- **Routing and regulatory cost breakdowns** use imported Journal statements for covered dates. They remain separate from the trade-level fees. Counts of actual executions use imported fills; fill records alone cannot identify how many original orders, cancels, or rejects occurred.

Historical float is displayed when already present on the trade. Point-in-time float and market capitalization require a historical reference-data source. Missing original plans and missing historical news, quotes, or bars cannot be reconstructed from realized fills.

## Risk, discipline, replay, and simulation

Apply [the risk, behavior, and simulation migration](../prisma/manual/20261123_add_risk_behavior_simulation.sql) after the two analytics migrations, then regenerate Prisma. Risk settings and saved simulation assumptions are scoped to the user and the active Live or Simulator account. Observations and replay notes attach to the existing trade analysis. Replay screenshots appear under **Gallery** with a replay timestamp and trade reference.

In **Reports → Risk & simulation**, configure the daily loss and profit stops, daily and weekly committed-risk limits, per-trade risk, daily loss-streak limit, custom trading rules, and behavioral tags. The dashboard is journal-based. It applies the current limits to the filtered history, including the selected setup, ticker, and session, so omitted trades and carry-in positions can change the results.

- **Risk and exposure.** New risk is the sum of original planned risk on entries in each New York session or week. For trades without a dollar plan, the first actual fill and the correct-side original stop can provide an initial-risk estimate. Peak overlap tracks remaining known initial risk until each position closes, without assuming later stop edits, scale changes, or unobserved positions. The original plan comes from the existing entry review. Trade Detail can fill in missing original stop and dollar risk references on an already graded trade. Existing grades and recorded plan values are preserved. Actual first-fill stop risk, gross MAE, and realized P&L are distinct values. Sizing variability is sample standard deviation divided by mean. Expectancy in R uses the original dollar plan only.
- **Historical limits.** Session loss is the worst cumulative realized net P&L below zero, in exit order. Threshold and streak rules affect later entries using realized outcomes known at that time. A daily loss or profit stop remains reached for the rest of that New York session. Overlapping trades that were already open still close normally. Fees and filter scope follow the reported trade data. Missing risk is excluded from exposure totals and counted separately.
- **Discipline.** Optional trade observations are self-reported. The score divides followed assessments by the sum of followed and violated assessments, with equal weight per assessed rule. Unassessed rules, emotions, trade quality, and P&L do not enter the score. Behavior cohorts overlap, and their outcomes are descriptive. Existing trade notes remain available from the observation form.
- **Replay.** Trade Detail links to an isolated replay that returns completed candles and observed executions through the selected clock time. The view reuses the candlestick chart, EMA, VWAP, MACD, execution markers, and observed MFE/MAE logic. The window extends to 48 hours from the entry minute, subject to available data. Historical indicators are recomputed from the visible chart window. Missing candles are never interpolated. Stop and target lines require recorded original plan prices.
- **What-if.** The rescaling mode changes recorded P&L proportionally to position size. Fixed-risk sizing requires original planned risk. Commission and routing overrides are round-trip per share and require recorded gross results unless price-path or assumed outcomes supply gross P&L. The assumed-outcome model uses a seeded Bernoulli outcome with a fixed payoff and loss measured in R. Omitted assumptions require a covered empirical value. Results compare the entire selected history, the eligible actual subset, and the hypothetical subset.
- **Price paths.** The app evaluates the most recent 30 dated closed trades in the filter, up to 48 hours per trade, using actual single entry and exit fills. Only the original holding window is considered. Unsupported or incomplete paths and ambiguous stop/target touches are identified explicitly. Stop gaps use the observed opening price. Targets use the requested target price. Threshold effects become available when their candle closes, except a time-based exit recorded at its deadline using the last completed close. These are OHLC approximations with no order-book or fill-probability model.
- **Monte Carlo.** A seeded bootstrap samples complete realized session blocks with replacement and preserves trade order within blocks. Scenario A and B use the same seed. Equity bands and terminal metrics use fifth, median, and 95th percentiles. Ruin is a configured equity-floor crossing after a simulated close. Drawdown uses the peak-to-trough equity decline in dollars. Wilson intervals describe finite-trial uncertainty for event probabilities. They do not quantify changes in the future return distribution. Historical results do not guarantee future performance.


## Exit performance analytics

Open **Reports → Advanced → Exit performance analytics**. The report starts automatically and checks every dated trade in the active account while the report is open. Completed results are saved and reused. The report filters control which trades are summarized. New trades and updated executions are picked up when the trade list refreshes or the report reopens. Unsupported data is shown separately from work in progress.

- **Entries.** The report compares the first entry with observed prices at 30 seconds, including open trades when historical prices are available. A trade print or completed second bar must be less than five seconds old at the comparison time. The entry midpoint comparison requires a recorded first fill and a valid quote less than two seconds before it. Positive midpoint cost is adverse. Price comparisons based on reported entry prices are counted separately in the entry finding.
- **Exits.** Earlier and later comparisons use the existing partial-fill ledger and retain recorded fees. Fresh quotes take priority, using the bid for long exits and ask for short covers. Trade prints and completed bars supply price estimates when available. Minute bars support whole-minute offsets only. Median profit giveback compares the observed while-held gross peak through 48 hours with realized gross P&L. The post-exit percentage measures movement in the original trade direction at 30 seconds.
- **Conclusions.** A timing finding needs at least 20 prices at the same offset, a positive median change, and at least 60% of comparable trades improved. Each offset shows its own coverage. These are historical comparisons with no order-book, fill probability, or market-impact model.
