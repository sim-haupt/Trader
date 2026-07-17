export const ADVANCED_METRIC_DEFINITIONS = {
  netExpectancy: {
    key: "netExpectancy",
    displayName: "Net expectancy",
    shortTooltip:
      "Net expectancy estimates the average amount earned or lost per trade after trading costs.",
    formula:
      "(win rate x average winning trade) - (loss rate x absolute average losing trade).",
    interpretation:
      "Positive expectancy suggests that the selected group of trades has historically produced an edge.",
    limitations: "Small samples may be unreliable. R expectancy requires planned initial risk.",
    requiredFields: ["netPnl or grossPnl plus commissions and fees"],
    format: "currency"
  },
  rollingExpectancy: {
    key: "rollingExpectancy",
    displayName: "Rolling expectancy",
    shortTooltip:
      "Rolling expectancy shows how average trade performance changes over a fixed number of recent trades.",
    formula: "Expectancy calculated over the last N chronological trades.",
    interpretation: "Use it to spot whether an edge is improving, weakening, or stable.",
    limitations: "No line is shown until the selected rolling window has enough trades.",
    requiredFields: ["entryDate", "netPnl or grossPnl"],
    format: "currency"
  },
  expectancyBySetup: {
    key: "expectancyBySetup",
    displayName: "Expectancy by setup",
    shortTooltip:
      "Expectancy by setup identifies which trade setups have historically produced the strongest or weakest average result.",
    formula: "Each setup is grouped and summarized with win rate, average win, average loss, expectancy, and profit factor.",
    interpretation: "Compare expectancy with sample size before deciding a setup has an edge.",
    limitations: "Unclassified trades are grouped separately.",
    requiredFields: ["setup or strategy", "netPnl or grossPnl"],
    format: "table"
  },
  expectancyByTimeOfDay: {
    key: "expectancyByTimeOfDay",
    displayName: "Expectancy by time of day",
    shortTooltip:
      "Expectancy by time of day shows when trading performance is strongest or weakest.",
    formula: "Trades are bucketed relative to the regular US equity session open in America/New_York.",
    interpretation: "Can reveal periods where momentum, liquidity, or decision quality differs.",
    limitations: "This app does not currently store per-symbol exchange calendars, so US equity session buckets are used.",
    requiredFields: ["entryDate", "netPnl or grossPnl"],
    format: "table"
  },
  medianTradeResult: {
    key: "medianTradeResult",
    displayName: "Median trade result",
    shortTooltip:
      "The median trade is the middle result after trades are ordered from worst to best.",
    formula: "Median of net P&L values and, when available, median of R multiples.",
    interpretation: "Less affected by unusually large winners or losses than the average.",
    limitations: "R values require planned initial risk.",
    requiredFields: ["netPnl or grossPnl"],
    format: "currency"
  },
  mfeMae: {
    key: "mfeMae",
    displayName: "MFE and MAE",
    shortTooltip:
      "Maximum favorable/adverse excursion describes the largest unrealized gain or loss reached while a trade was open.",
    formula: "Uses recorded MFE/MAE fields when present.",
    interpretation: "Helps evaluate entry quality, stop placement, and exit efficiency.",
    limitations: "Requires intratrade high/low data or execution-level price history. This schema does not currently store it.",
    requiredFields: ["mfe", "mae or intratrade price history"],
    format: "currency"
  },
  tradingCostDrag: {
    key: "tradingCostDrag",
    displayName: "Trading-cost drag",
    shortTooltip:
      "Trading-cost drag shows how much gross trading performance is consumed by commissions, fees, spread, and slippage.",
    formula: "Total available costs divided by gross trading profit.",
    interpretation: "Especially important for high-frequency scalp strategies.",
    limitations: "Spread and slippage costs are unavailable unless recorded on trades or executions.",
    requiredFields: ["commissions", "fees", "grossPnl"],
    format: "percent"
  },
  holdingTimePerformance: {
    key: "holdingTimePerformance",
    displayName: "Holding-time performance",
    shortTooltip:
      "Holding-time performance compares results across trade durations.",
    formula: "Trades are bucketed by elapsed time from entry to exit.",
    interpretation: "Can reveal whether trades lose quality when held too long.",
    limitations: "Time to MFE and time to maximum loss require intratrade history.",
    requiredFields: ["entryDate", "exitDate", "netPnl or grossPnl"],
    format: "table"
  },
  profitFactor: {
    key: "profitFactor",
    displayName: "Profit factor",
    shortTooltip:
      "Profit factor compares total gross profits with total gross losses.",
    formula: "Gross profit divided by absolute gross loss.",
    interpretation: "Values above 1 indicate gross profits exceeded gross losses.",
    limitations: "Periods with no losses are labeled explicitly instead of showing infinity.",
    requiredFields: ["grossPnl"],
    format: "ratio"
  },
  payoffRatio: {
    key: "payoffRatio",
    displayName: "Payoff ratio",
    shortTooltip:
      "Payoff ratio compares the average winning trade with the average losing trade.",
    formula: "Average winning trade divided by absolute average losing trade.",
    interpretation: "Interpret together with win rate and expectancy.",
    limitations: "Unavailable when there are no winning or no losing trades.",
    requiredFields: ["netPnl or grossPnl"],
    format: "ratio"
  },
  sessionGiveback: {
    key: "sessionGiveback",
    displayName: "Peak-to-close session giveback",
    shortTooltip:
      "Peak-to-close giveback measures how much intraday profit was lost before the trading session ended.",
    formula: "Peak intraday cumulative closed-trade net P&L minus final session net P&L.",
    interpretation: "Can reveal overtrading or weak session-level stopping decisions.",
    limitations: "Uses closed-trade results only, not intratrade equity.",
    requiredFields: ["entryDate", "netPnl or grossPnl"],
    format: "currency"
  },
  tradeNumberPerformance: {
    key: "tradeNumberPerformance",
    displayName: "Performance by trade number",
    shortTooltip:
      "Performance by trade number shows whether results improve or deteriorate later in the session.",
    formula: "Trade sequence resets by session and is grouped into 1-3, 4-6, 7-10, and 11+.",
    interpretation: "Can help identify behavioral patterns such as later-session deterioration.",
    limitations: "Session sequence uses market-date grouping.",
    requiredFields: ["entryDate", "netPnl or grossPnl"],
    format: "table"
  },
  performanceAfterLosses: {
    key: "performanceAfterLosses",
    displayName: "Performance after losses",
    shortTooltip:
      "Performance after losses measures how trading behavior changes after negative outcomes.",
    formula: "Each trade is classified by the loss streak immediately before entry.",
    interpretation: "A deterioration is presented as a behavioral pattern, not a psychological diagnosis.",
    limitations: "Breakeven trades reset streaks.",
    requiredFields: ["entryDate", "netPnl or grossPnl"],
    format: "table"
  },
  ruleCompliance: {
    key: "ruleCompliance",
    displayName: "Rule compliance",
    shortTooltip:
      "Rule-compliance performance compares results from trades that followed the trading plan with trades that included deviations.",
    formula: "Groups trades by a recorded compliance classification.",
    interpretation: "Accuracy depends on consistent and honest classification.",
    limitations: "No dedicated compliance field exists in the current trade schema.",
    requiredFields: ["ruleCompliance or complianceCategory"],
    format: "table"
  },
  tailLoss: {
    key: "tailLoss",
    displayName: "Tail-loss analysis",
    shortTooltip:
      "Tail-loss analysis focuses on unusually large losses that may have a disproportionate impact on total performance.",
    formula: "Losing trades are sorted from smallest to largest result; nearest-rank percentiles are used.",
    interpretation: "Helps distinguish normal strategy losses from rare, high-impact events.",
    limitations: "Planned-risk exceedance requires planned initial risk.",
    requiredFields: ["netPnl or grossPnl"],
    format: "currency"
  },
  drawdown: {
    key: "drawdown",
    displayName: "Drawdown",
    shortTooltip:
      "Drawdown measures the decline from a previous equity peak.",
    formula: "Calculated from chronological cumulative closed-trade net P&L.",
    interpretation: "Maximum drawdown is the largest peak-to-trough decline in the selected period.",
    limitations: "Deposits, withdrawals, transfers, and open positions are not included.",
    requiredFields: ["entryDate", "netPnl or grossPnl"],
    format: "currency"
  },
  losingStreaks: {
    key: "losingStreaks",
    displayName: "Losing streaks",
    shortTooltip:
      "A losing streak is a sequence of consecutive losing trades.",
    formula: "Consecutive negative net results are counted; breakeven trades reset streaks.",
    interpretation: "Helps evaluate whether observed runs are normal and what happens afterward.",
    limitations: "Small datasets can make streak distributions noisy.",
    requiredFields: ["entryDate", "netPnl or grossPnl"],
    format: "count"
  },
  setupContribution: {
    key: "setupContribution",
    displayName: "Setup contribution",
    shortTooltip:
      "Setup contribution shows how much each setup contributes to total profits, losses, and trading activity.",
    formula: "Trades are grouped by setup and summed for net P&L, gross profit, gross loss, net R, and count.",
    interpretation: "A setup may have positive expectancy but contribute little if traded infrequently.",
    limitations: "R contribution requires planned initial risk.",
    requiredFields: ["setup or strategy", "netPnl or grossPnl"],
    format: "table"
  },
  concentration: {
    key: "concentration",
    displayName: "Concentration metrics",
    shortTooltip:
      "Concentration metrics show whether results depend heavily on a small number of trades, setups, or symbols.",
    formula: "Top trade, setup, symbol, and volume shares are compared with totals.",
    interpretation: "High concentration can make performance less stable.",
    limitations: "Percentages are not meaningful when the denominator is zero.",
    requiredFields: ["symbol", "setup or strategy", "quantity", "netPnl or grossPnl"],
    format: "percent"
  },
  conditionalExplorer: {
    key: "conditionalExplorer",
    displayName: "Conditional-performance explorer",
    shortTooltip:
      "The conditional-performance explorer compares trading results across one selected factor.",
    formula: "Groups trades by the selected available field and calculates common performance metrics.",
    interpretation: "Patterns from small groups may not be statistically reliable.",
    limitations: "Unavailable dimensions are omitted or marked unclassified.",
    requiredFields: ["selected dimension", "netPnl or grossPnl"],
    format: "table"
  }
};

export function getAdvancedMetricDefinition(key) {
  return ADVANCED_METRIC_DEFINITIONS[key] || {
    key,
    displayName: key,
    shortTooltip: "Metric definition unavailable.",
    formula: "",
    interpretation: "",
    limitations: "",
    requiredFields: [],
    format: "text"
  };
}
