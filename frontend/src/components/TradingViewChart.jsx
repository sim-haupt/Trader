import { useEffect, useMemo, useRef } from "react";

function TradingViewChart({ symbol }) {
  const containerRef = useRef(null);
  const widgetId = useMemo(
    () => `tradingview_${String(symbol || "symbol").replace(/[^a-z0-9]/gi, "_").toLowerCase()}`,
    [symbol]
  );

  useEffect(() => {
    if (!containerRef.current || !symbol) {
      return undefined;
    }

    containerRef.current.innerHTML = `<div id="${widgetId}" class="h-full w-full"></div>`;

    // The public TradingView widget script builds the interactive chart client-side.
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "1",
      timezone: "Europe/Berlin",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "#12192b",
      gridColor: "rgba(255, 255, 255, 0.08)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: true,
      details: true,
      studies: ["Volume@tv-basicstudies"],
      withdateranges: true,
      container_id: widgetId
    });

    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [symbol, widgetId]);

  if (!symbol) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-950/30 text-sm text-mist">
        No symbol available for chart context.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#12192b]">
      <div ref={containerRef} className="h-[420px] w-full" />
    </div>
  );
}

export default TradingViewChart;
