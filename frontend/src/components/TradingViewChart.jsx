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
    timezone: "Europe/Berlin",
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
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#12192b]">
        <iframe
          key={normalizedSymbol}
          title={`${symbol} 1 minute chart`}
          src={iframeSrc}
          className="h-[420px] w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowTransparency
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
        <p className="text-mist">
          If the symbol does not render correctly, it may be listed on a different exchange than the
          default <span className="text-white">{normalizedSymbol}</span>.
        </p>
        <a
          href={publicSymbolUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-white/15 px-4 py-2 font-medium text-white transition hover:border-mint hover:text-mint"
        >
          Open On TradingView
        </a>
      </div>
    </div>
  );
}

export default TradingViewChart;
