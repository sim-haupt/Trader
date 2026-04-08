import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart
} from "lightweight-charts";
import marketDataService from "../services/marketDataService";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import {
  buildExecutionMarkers,
  calculateEmaSeries,
  calculateMacdSeries,
  calculateVwapSeries,
  toChartUnixSeconds
} from "../utils/chartIndicators";
import LoadingState from "./ui/LoadingState";

function buildDayRange(anchorDate) {
  const parsedTimestamp = toChartUnixSeconds(anchorDate);
  const start = parsedTimestamp ? new Date(parsedTimestamp * 1000) : new Date(anchorDate);
  start.setHours(4, 0, 0, 0);
  const end = parsedTimestamp ? new Date(parsedTimestamp * 1000) : new Date(anchorDate);
  end.setHours(20, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString() };
}

function formatSessionBoundary(anchorTime, hour, minute = 0) {
  const date = new Date(anchorTime * 1000);
  date.setHours(hour, minute, 0, 0);
  return Math.floor(date.getTime() / 1000);
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
        background: { type: ColorType.Solid, color: "#0b0f17" },
        textColor: "#c7cfdd",
        attributionLogo: true
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.06)" }
      },
      rightPriceScale: {
        borderColor: "rgba(229,231,235,0.14)"
      },
      timeScale: {
        borderColor: "rgba(229,231,235,0.14)",
        timeVisible: true,
        secondsVisible: true
      },
      crosshair: {
        vertLine: { color: "rgba(124,211,255,0.28)" },
        horzLine: { color: "rgba(124,211,255,0.28)" }
      }
    };

    const mainChart = createChart(mainRef.current, {
      ...chartOptions,
      width: mainRef.current.clientWidth,
      height: 500
    });

    const macdChart = createChart(macdRef.current, {
      ...chartOptions,
      width: macdRef.current.clientWidth,
      height: 180
    });

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceLineVisible: false
    });
    candleSeries.setData(bars);

    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: "volume"
      }
    });
    volumeSeries.setData(
      bars.map((bar) => ({
        time: bar.time,
        value: bar.volume,
        color: bar.close >= bar.open ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.42)"
      }))
    );
    mainChart.priceScale("volume").applyOptions({
      scaleMargins: {
        top: 0.74,
        bottom: 0
      }
    });

    const ema9Series = mainChart.addSeries(LineSeries, {
      color: "#60a5fa",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    ema9Series.setData(calculateEmaSeries(bars, 9));

    const ema20Series = mainChart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    ema20Series.setData(calculateEmaSeries(bars, 20));

    const vwapSeries = mainChart.addSeries(LineSeries, {
      color: "#38bdf8",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    vwapSeries.setData(calculateVwapSeries(bars));

    const executionAnchorSeries = mainChart.addSeries(LineSeries, {
      color: "rgba(0,0,0,0)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    executionAnchorSeries.setData(
      markers
        .map((marker) => ({
          time: marker.rawTime || marker.time,
          value: marker.price
        }))
        .sort((left, right) => left.time - right.time)
    );

    const firstBarTime = bars[0]?.time ?? null;
    const lastBarTime = bars[bars.length - 1]?.time ?? null;

    function renderExecutionOverlay() {
      if (!overlayRef.current) {
        return;
      }

      overlayRef.current.innerHTML = "";

      const sessionBlocks = [
        {
          start: formatSessionBoundary(firstBarTime || Date.now() / 1000, 4, 0),
          end: formatSessionBoundary(firstBarTime || Date.now() / 1000, 9, 30),
          color: "rgba(245, 158, 11, 0.10)"
        },
        {
          start: formatSessionBoundary(firstBarTime || Date.now() / 1000, 16, 0),
          end: formatSessionBoundary(firstBarTime || Date.now() / 1000, 20, 0),
          color: "rgba(59, 130, 246, 0.08)"
        }
      ];

      for (const block of sessionBlocks) {
        const x1 = mainChart.timeScale().timeToCoordinate(block.start);
        const x2 = mainChart.timeScale().timeToCoordinate(block.end);

        if (x1 == null || x2 == null) {
          continue;
        }

        const shadeNode = document.createElement("div");
        shadeNode.className = "absolute inset-y-0";
        shadeNode.style.left = `${Math.min(x1, x2)}px`;
        shadeNode.style.width = `${Math.abs(x2 - x1)}px`;
        shadeNode.style.background = block.color;
        overlayRef.current.appendChild(shadeNode);
      }

      for (const marker of markers) {
        const exactTime = marker.rawTime || marker.time;
        const fallbackTime =
          bars
            .map((bar) => bar.time)
            .filter((time) => time <= exactTime)
            .slice(-1)[0] ?? firstBarTime;
        const x =
          mainChart.timeScale().timeToCoordinate(exactTime) ??
          mainChart.timeScale().timeToCoordinate(fallbackTime);
        const y = candleSeries.priceToCoordinate(marker.price);

        if (x == null || y == null) {
          continue;
        }

        const markerNode = document.createElement("div");
        markerNode.className = "absolute -translate-x-1/2 -translate-y-1/2";
        markerNode.style.left = `${x}px`;
        markerNode.style.top = `${y}px`;
        markerNode.style.width = "0";
        markerNode.style.height = "0";
        markerNode.style.borderLeft = "8px solid transparent";
        markerNode.style.borderRight = "8px solid transparent";
        if (marker.shape === "arrowUp") {
          markerNode.style.borderBottom = `14px solid ${marker.color}`;
        } else {
          markerNode.style.borderTop = `14px solid ${marker.color}`;
        }
        markerNode.style.filter = "drop-shadow(0 2px 6px rgba(0,0,0,0.45))";

        const labelNode = document.createElement("div");
        labelNode.className =
          "absolute whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-semibold backdrop-blur";
        labelNode.style.left = `${x + 12}px`;
        labelNode.style.top = `${marker.shape === "arrowUp" ? y - 22 : y + 6}px`;
        labelNode.style.color = marker.color;
        labelNode.style.backgroundColor = "rgba(11,15,23,0.92)";
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
      color: "#60a5fa",
      lineWidth: 2,
      priceLineVisible: false
    });
    macdLineSeries.setData(macdLine);

    const signalLineSeries = macdChart.addSeries(LineSeries, {
      color: "#f97316",
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

    if (firstBarTime && lastBarTime) {
      mainChart.timeScale().setVisibleRange({
        from: firstBarTime,
        to: lastBarTime
      });
    } else {
      mainChart.timeScale().fitContent();
    }
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="ui-chip">1m</span>
          <span className="ui-chip">EMA 9</span>
          <span className="ui-chip">EMA 20</span>
          <span className="ui-chip">VWAP</span>
          <span className="ui-chip">MACD</span>
          <span className="ui-chip">ETH</span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[12px] border border-[#e5e7eb42] bg-black/50">
        <div ref={mainRef} />
        <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10" />
      </div>
      <div ref={macdRef} className="overflow-hidden rounded-[12px] border border-[#e5e7eb42] bg-black/50" />
    </div>
  );
}

function TradeReviewCharts({ trade }) {
  const initialRange = buildDayRange(trade.entryDate);
  const markers = useMemo(() => buildExecutionMarkers(trade), [trade]);
  const {
    data: minuteResponse,
    loading,
    error
  } = useCachedAsyncResource({
    peek: () =>
      marketDataService.peekBars({
        symbol: trade.symbol,
        resolution: "1m",
        from: initialRange.from,
        to: initialRange.to,
        includeExtended: true
      }),
    load: () =>
      marketDataService.getBars({
        symbol: trade.symbol,
        resolution: "1m",
        from: initialRange.from,
        to: initialRange.to,
        includeExtended: true
      }),
    initialValue: { bars: [] },
    deps: [trade.symbol, trade.entryDate]
  });
  const minuteBars = minuteResponse?.bars || [];

  if (loading) {
    return (
      <LoadingState
        label="Loading market data..."
        className="min-h-[360px] rounded-[12px] border border-[#e5e7eb42] bg-black/30"
      />
    );
  }

  if (error) {
    return (
      <div className="rounded-[12px] border border-[#e5e7eb42] bg-black/30 p-5 text-sm text-mist">
        {error}
      </div>
    );
  }

  if (!minuteBars.length) {
    return (
      <div className="rounded-[12px] border border-[#e5e7eb42] bg-black/30 p-5 text-sm text-mist">
        No market bars were returned for this trade window.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {minuteBars.length > 0 && (
        <TimeframeChart
          title="Execution Review"
          subtitle="1-minute Alpaca bars with exact fill markers, volume, session shading, EMA, VWAP, and MACD."
          bars={minuteBars}
          markers={markers}
        />
      )}
    </div>
  );
}

export default TradeReviewCharts;
