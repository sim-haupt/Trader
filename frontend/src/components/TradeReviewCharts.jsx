import TradingViewChart from "./TradingViewChart";

function TradeReviewCharts({ trade }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="ui-title text-lg text-phosphor">TradingView Review</h3>
          <p className="mt-1 text-sm text-mist">
            Embedded 1-minute TradingView chart for quick visual context on the trade.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="ui-chip">1m</span>
          <span className="ui-chip">NYSE / NASDAQ</span>
          <span className="ui-chip">NY Time</span>
        </div>
      </div>

      <TradingViewChart symbol={trade.symbol} />
    </div>
  );
}

export default TradeReviewCharts;
