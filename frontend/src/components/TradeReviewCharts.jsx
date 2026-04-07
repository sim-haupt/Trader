import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart
} from "lightweight-charts";
import marketDataService from "../services/marketDataService";
import {
  buildExecutionMarkers,
  calculateEmaSeries,
  calculateMacdSeries,
  calculateVwapSeries
} from "../utils/chartIndicators";

function buildDayRange(anchorDate) {
  const start = new Date(anchorDate);
  start.setHours(4, 0, 0, 0);
  const end = new Date(anchorDate);
  end.setHours(20, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString() };
}

function TimeframeChart({ title, subtitle, bars, markers }) {
  const mainRef = useRef(null);
  const macdRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!mainRef.current || !macdRef.current || !overlayRef.current || !bars.length) {
      return undefined;
    }

    const chartOptions = {
      layout: {
        background: { type: ColorType.Solid, color: "#12192b" },
        textColor: "#c9d2e3",
        attributionLogo: true
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" }
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)"
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: true
      },
      crosshair: {
        vertLine: { color: "rgba(255,255,255,0.18)" },
        horzLine: { color: "rgba(255,255,255,0.18)" }
      }
    };

    const mainChart = createChart(mainRef.current, {
      ...chartOptions,
      width: mainRef.current.clientWidth,
      height: 380
    });

    const macdChart = createChart(macdRef.current, {
      ...chartOptions,
      width: macdRef.current.clientWidth,
      height: 180
    });

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: "#14cba8",
      downColor: "#ff5a4a",
      borderVisible: false,
      wickUpColor: "#14cba8",
      wickDownColor: "#ff5a4a"
    });
    candleSeries.setData(bars);

    const ema9Series = mainChart.addSeries(LineSeries, {
      color: "#1a9cff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    ema9Series.setData(calculateEmaSeries(bars, 9));

    const ema20Series = mainChart.addSeries(LineSeries, {
      color: "#3aa7ff",
      lineWidth: 2,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    ema20Series.setData(calculateEmaSeries(bars, 20));

    const vwapSeries = mainChart.addSeries(LineSeries, {
      color: "#5bc3ff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    vwapSeries.setData(calculateVwapSeries(bars));

    createSeriesMarkers(candleSeries, []);

    function renderExecutionOverlay() {
      if (!overlayRef.current) {
        return;
      }

      overlayRef.current.innerHTML = "";

      for (const marker of markers) {
        const x = mainChart.timeScale().timeToCoordinate(marker.time);
        const y = candleSeries.priceToCoordinate(marker.price);

        if (x == null || y == null) {
          continue;
        }

        const markerNode = document.createElement("div");
        markerNode.className =
          "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-[0_0_0_4px_rgba(18,25,43,0.88)]";
        markerNode.style.left = `${x}px`;
        markerNode.style.top = `${y}px`;
        markerNode.style.width = "14px";
        markerNode.style.height = "14px";
        markerNode.style.borderColor = marker.color;
        markerNode.style.backgroundColor = "#12192b";

        const labelNode = document.createElement("div");
        labelNode.className = "absolute whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold";
        labelNode.style.left = `${x + 12}px`;
        labelNode.style.top = `${y - 16}px`;
        labelNode.style.color = marker.color;
        labelNode.style.backgroundColor = "rgba(18,25,43,0.92)";
        labelNode.style.border = `1px solid ${marker.color}55`;
        labelNode.textContent = marker.text;

        overlayRef.current.appendChild(markerNode);
        overlayRef.current.appendChild(labelNode);
      }
    }

    const { macdLine, signalLine, histogram } = calculateMacdSeries(bars);
    const histogramSeries = macdChart.addSeries(HistogramSeries, {
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
      priceLineVisible: false
    });
    histogramSeries.setData(histogram);

    const macdLineSeries = macdChart.addSeries(LineSeries, {
      color: "#ff8f1f",
      lineWidth: 2,
      priceLineVisible: false
    });
    macdLineSeries.setData(macdLine);

    const signalLineSeries = macdChart.addSeries(LineSeries, {
      color: "#2d8cff",
      lineWidth: 2,
      priceLineVisible: false
    });
    signalLineSeries.setData(signalLine);

    const handleMainRange = (range) => macdChart.timeScale().setVisibleLogicalRange(range);
    const handleMacdRange = (range) => mainChart.timeScale().setVisibleLogicalRange(range);
    const handleOverlayRefresh = () => renderExecutionOverlay();

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(handleMainRange);
    macdChart.timeScale().subscribeVisibleLogicalRangeChange(handleMacdRange);
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(handleOverlayRefresh);

    mainChart.timeScale().fitContent();
    renderExecutionOverlay();

    const resizeObserver = new ResizeObserver(() => {
      if (mainRef.current) {
        mainChart.applyOptions({ width: mainRef.current.clientWidth });
      }
      if (macdRef.current) {
        macdChart.applyOptions({ width: macdRef.current.clientWidth });
      }
      renderExecutionOverlay();
    });

    resizeObserver.observe(mainRef.current);
    resizeObserver.observe(macdRef.current);

    return () => {
      resizeObserver.disconnect();
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(handleOverlayRefresh);
      mainChart.remove();
      macdChart.remove();
    };
  }, [bars, markers]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-mist">{subtitle}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.25em] text-mint">
          EMA 9 · EMA 20 · VWAP · MACD · ETH
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#12192b]">
        <div ref={mainRef} />
        <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10" />
      </div>
      <div ref={macdRef} className="overflow-hidden rounded-3xl border border-white/10 bg-[#12192b]" />
    </div>
  );
}

function TradeReviewCharts({ trade }) {
  const [minuteBars, setMinuteBars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const markers = useMemo(() => buildExecutionMarkers(trade), [trade]);

  useEffect(() => {
    let active = true;

    async function loadBars() {
      setLoading(true);
      setError("");

      try {
        const dayRange = buildDayRange(trade.entryDate);
        const minuteResponse = await marketDataService.getBars({
          symbol: trade.symbol,
          resolution: "1m",
          from: dayRange.from,
          to: dayRange.to,
          includeExtended: true
        });

        if (active) {
          setMinuteBars(minuteResponse.bars || []);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadBars();

    return () => {
      active = false;
    };
  }, [trade]);

  if (loading) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-3xl border border-white/10 bg-slate-950/30 text-sm text-mist">
        Loading market data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-coral/20 bg-coral/10 p-5 text-sm text-coral">
        {error}
      </div>
    );
  }

  if (!minuteBars.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-950/30 p-5 text-sm text-mist">
        No market bars were returned for this trade window.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {minuteBars.length > 0 && (
        <TimeframeChart
          title="1 Minute Review"
          subtitle="Full-session context with extended hours included by default."
          bars={minuteBars}
          markers={markers}
        />
      )}
    </div>
  );
}

export default TradeReviewCharts;
