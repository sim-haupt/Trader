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
  calculateVwapSeries,
  toChartUnixSeconds
} from "../utils/chartIndicators";

function buildDayRange(anchorDate) {
  const parsedTimestamp = toChartUnixSeconds(anchorDate);
  const start = parsedTimestamp ? new Date(parsedTimestamp * 1000) : new Date(anchorDate);
  start.setHours(4, 0, 0, 0);
  const end = parsedTimestamp ? new Date(parsedTimestamp * 1000) : new Date(anchorDate);
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
        background: { type: ColorType.Solid, color: "#050907" },
        textColor: "#b8ffd9",
        attributionLogo: true
      },
      grid: {
        vertLines: { color: "rgba(114,243,198,0.08)" },
        horzLines: { color: "rgba(114,243,198,0.08)" }
      },
      rightPriceScale: {
        borderColor: "rgba(114,243,198,0.14)"
      },
      timeScale: {
        borderColor: "rgba(114,243,198,0.14)",
        timeVisible: true,
        secondsVisible: true
      },
      crosshair: {
        vertLine: { color: "rgba(114,243,198,0.22)" },
        horzLine: { color: "rgba(114,243,198,0.22)" }
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
      color: "#72f3c6",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    ema9Series.setData(calculateEmaSeries(bars, 9));

    const ema20Series = mainChart.addSeries(LineSeries, {
      color: "#a8ffd8",
      lineWidth: 2,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    ema20Series.setData(calculateEmaSeries(bars, 20));

    const vwapSeries = mainChart.addSeries(LineSeries, {
      color: "#5ea389",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    vwapSeries.setData(calculateVwapSeries(bars));

    function renderExecutionOverlay() {
      if (!overlayRef.current) {
        return;
      }

      overlayRef.current.innerHTML = "";
      const barTimes = new Set(bars.map((bar) => bar.time));

      for (const marker of markers) {
        const snappedTime = barTimes.has(marker.time)
          ? marker.time
          : Math.max(
              ...bars
                .map((bar) => bar.time)
                .filter((time) => time <= (marker.rawTime || marker.time))
            );
        const x = Number.isFinite(snappedTime)
          ? mainChart.timeScale().timeToCoordinate(snappedTime)
          : null;
        const y = candleSeries.priceToCoordinate(marker.price);

        if (x == null || y == null) {
          continue;
        }

        const markerNode = document.createElement("div");
        markerNode.className =
          "absolute -translate-x-1/2 -translate-y-1/2 border-2 shadow-[0_0_0_4px_rgba(5,9,7,0.92)]";
        markerNode.style.left = `${x}px`;
        markerNode.style.top = `${y}px`;
        markerNode.style.width = "14px";
        markerNode.style.height = "14px";
        markerNode.style.borderColor = marker.color;
        markerNode.style.backgroundColor = "#050907";

        const labelNode = document.createElement("div");
        labelNode.className = "absolute whitespace-nowrap border px-2 py-1 text-[10px] font-semibold";
        labelNode.style.left = `${x + 12}px`;
        labelNode.style.top = `${y - 16}px`;
        labelNode.style.color = marker.color;
        labelNode.style.backgroundColor = "rgba(5,9,7,0.94)";
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
      color: "#a8ffd8",
      lineWidth: 2,
      priceLineVisible: false
    });
    macdLineSeries.setData(macdLine);

    const signalLineSeries = macdChart.addSeries(LineSeries, {
      color: "#72f3c6",
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
          <h3 className="ui-title text-lg text-phosphor">{title}</h3>
          <p className="mt-1 text-sm text-mist">{subtitle}</p>
        </div>
        <div className="ui-chip">
          EMA 9 · EMA 20 · VWAP · MACD · ETH
        </div>
      </div>

      <div className="relative overflow-hidden border-2 border-mint/20 bg-black/70">
        <div ref={mainRef} />
        <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10" />
      </div>
      <div ref={macdRef} className="overflow-hidden border-2 border-mint/20 bg-black/70" />
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
      <div className="flex h-[360px] items-center justify-center border-2 border-mint/20 bg-black/40 text-sm text-mist">
        Loading market data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-2 border-coral/30 bg-coral/10 p-5 text-sm text-coral">
        {error}
      </div>
    );
  }

  if (!minuteBars.length) {
    return (
      <div className="border-2 border-mint/20 bg-black/40 p-5 text-sm text-mist">
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
