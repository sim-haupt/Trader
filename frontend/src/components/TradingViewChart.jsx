import { useMemo } from "react";

function buildTradingViewSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();

  if (!normalized) {
    return "";
  }

  if (normalized.includes(":")) {
    return normalized;
  }

  // Default to NASDAQ for US equities. Users can still open the symbol on TradingView
  // if a ticker lives on a different venue.
  return `NASDAQ:${normalized}`;
}

function buildIframeSrc(symbol) {
  const tradingViewSymbol = buildTradingViewSymbol(symbol);
  const params = new URLSearchParams({
    symbol: tradingViewSymbol,
    interval: "1",
    symboledit: "1",
    saveimage: "1",
    toolbarbg: "#12192b",
    theme: "dark",
    style: "1",
    timezone: "America/New_York",
    studies: "[]",
    withdateranges: "1",
    hide_top_toolbar: "0",
    hide_legend: "0",
    hide_side_toolbar: "0",
    allow_symbol_change: "1"
  });

  return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
}

function TradingViewChart({ symbol }) {
  const normalizedSymbol = useMemo(() => buildTradingViewSymbol(symbol), [symbol]);
  const iframeSrc = useMemo(() => buildIframeSrc(symbol), [symbol]);
  const publicSymbolUrl = useMemo(() => {
    const plainSymbol = String(symbol || "").trim().toUpperCase();
    return plainSymbol ? `https://www.tradingview.com/symbols/${plainSymbol}/` : "";
  }, [symbol]);

  if (!symbol) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-950/30 text-sm text-mist">
        No symbol available for chart context.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[16px] border border-[#e5e7eb42] bg-[#0f1420] shadow-[0_24px_50px_rgba(0,0,0,0.28)]">
        <iframe
          key={normalizedSymbol}
          title={`${symbol} 1 minute chart`}
          src={iframeSrc}
          className="h-[620px] w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowTransparency
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#e5e7eb42] bg-white/[0.03] px-4 py-3 text-sm">
        <p className="text-mist">
          Embedded TradingView chart in New York market time. Exact fill markers remain listed in the
          executions table below.
        </p>
        <a
          href={publicSymbolUrl}
          target="_blank"
          rel="noreferrer"
          className="ui-button px-4 py-2 font-medium text-white transition hover:text-white"
        >
          Open On TradingView
        </a>
      </div>
    </div>
  );
}

export default TradingViewChart;
