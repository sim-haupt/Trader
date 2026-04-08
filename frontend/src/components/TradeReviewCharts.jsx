import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart
} from "lightweight-charts";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import marketDataService from "../services/marketDataService";
import {
  buildExecutionMarkers,
  calculateEmaSeries,
  calculateMacdSeries,
  calculateVwapSeries,
  toChartUnixSeconds
} from "../utils/chartIndicators";
import LoadingState from "./ui/LoadingState";

const CHART_TZ = "America/New_York";
const DAY_STAMP_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHART_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
const TIME_TICK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CHART_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});
const DAY_TICK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CHART_TZ,
  month: "short",
  day: "numeric"
});

function getEasternDayStamp(value) {
  const timestamp = toChartUnixSeconds(value);

  if (timestamp == null) {
    return null;
  }

  return DAY_STAMP_FORMATTER.format(new Date(timestamp * 1000));
}

function getEasternTimestamp(dayStamp, hour, minute = 0, second = 0) {
  return toChartUnixSeconds(
    `${dayStamp}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`
  );
}

function buildDayRange(anchorDate) {
  const dayStamp = getEasternDayStamp(anchorDate);

  if (!dayStamp) {
    const fallback = new Date(anchorDate);
    return { from: fallback.toISOString(), to: fallback.toISOString(), dayStamp: "" };
  }

  const fromSeconds = getEasternTimestamp(dayStamp, 4, 0, 0);
  const toSeconds = getEasternTimestamp(dayStamp, 20, 0, 0);

  return {
    dayStamp,
    from: new Date(fromSeconds * 1000).toISOString(),
    to: new Date(toSeconds * 1000).toISOString()
  };
}

function hydrateMinuteBars(rawBars) {
  if (!Array.isArray(rawBars) || rawBars.length === 0) {
    return [];
  }

  const sorted = [...rawBars]
    .filter((bar) => Number.isFinite(bar.time))
    .sort((left, right) => left.time - right.time);

  if (!sorted.length) {
    return [];
  }

  const filled = [sorted[0]];
  let previous = sorted[0];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    let pointer = previous.time + 60;

    while (pointer < current.time) {
      filled.push({
        time: pointer,
        open: previous.close,
        high: previous.close,
        low: previous.close,
        close: previous.close,
        volume: 0,
        synthetic: true
      });
      pointer += 60;
    }

    filled.push(current);
    previous = current;
  }

  return filled;
}

function getSessionShades(dayStamp) {
  if (!dayStamp) {
    return [];
  }

  return [
    {
      start: getEasternTimestamp(dayStamp, 4, 0),
      end: getEasternTimestamp(dayStamp, 9, 30),
      background: "linear-gradient(180deg, rgba(245,158,11,0.11), rgba(245,158,11,0.04))"
    },
    {
      start: getEasternTimestamp(dayStamp, 16, 0),
      end: getEasternTimestamp(dayStamp, 20, 0),
      background: "linear-gradient(180deg, rgba(59,130,246,0.10), rgba(59,130,246,0.04))"
    }
  ];
}

function buildVolumeData(bars) {
  return bars.map((bar) => ({
    time: bar.time,
    value: Number(bar.volume || 0),
    color: bar.close >= bar.open ? "rgba(34,197,94,0.42)" : "rgba(239,68,68,0.38)"
  }));
}

function nearestBarTime(bars, rawTime) {
  let match = bars[0]?.time ?? null;

  for (const bar of bars) {
    if (bar.time > rawTime) {
      break;
    }
    match = bar.time;
  }

  return match;
}

function renderOverlay({ overlayEl, chart, candleSeries, bars, markers, dayStamp }) {
  if (!overlayEl) {
    return;
  }

  overlayEl.innerHTML = "";

  const fragment = document.createDocumentFragment();
  const firstBarTime = bars[0]?.time ?? null;
  const lastBarTime = bars[bars.length - 1]?.time ?? null;

  for (const shade of getSessionShades(dayStamp)) {
    const x1 = chart.timeScale().timeToCoordinate(shade.start);
    const x2 = chart.timeScale().timeToCoordinate(shade.end);

    if (x1 == null || x2 == null) {
      continue;
    }

    const shadeNode = document.createElement("div");
    shadeNode.className = "absolute inset-y-0 pointer-events-none";
    shadeNode.style.left = `${Math.min(x1, x2)}px`;
    shadeNode.style.width = `${Math.abs(x2 - x1)}px`;
    shadeNode.style.background = shade.background;
    fragment.appendChild(shadeNode);
  }

  const markerStacks = new Map();

  for (const marker of markers) {
    const exactTime = marker.rawTime || marker.time;
    const barTime = nearestBarTime(bars, exactTime) ?? firstBarTime;
    const x =
      chart.timeScale().timeToCoordinate(exactTime) ??
      (barTime != null ? chart.timeScale().timeToCoordinate(barTime) : null);
    const y = candleSeries.priceToCoordinate(marker.price);

    if (x == null || y == null || (firstBarTime && exactTime < firstBarTime) || (lastBarTime && exactTime > lastBarTime + 60)) {
      continue;
    }

    const stackKey = `${marker.shape}:${barTime ?? exactTime}`;
    const stackIndex = markerStacks.get(stackKey) ?? 0;
    markerStacks.set(stackKey, stackIndex + 1);

    const direction = marker.shape === "arrowUp" ? 1 : -1;
    const yOffset = stackIndex * 16 * direction;
    const markerTop = y + yOffset;

    const pin = document.createElement("div");
    pin.className = "absolute pointer-events-none";
    pin.style.left = `${x}px`;
    pin.style.top = `${markerTop}px`;
    pin.style.width = "0";
    pin.style.height = "0";
    pin.style.transform = "translate(-50%, -50%)";
    pin.style.filter = "drop-shadow(0 4px 10px rgba(0,0,0,0.45))";

    if (marker.shape === "arrowUp") {
      pin.style.borderLeft = "8px solid transparent";
      pin.style.borderRight = "8px solid transparent";
      pin.style.borderBottom = `14px solid ${marker.color}`;
    } else {
      pin.style.borderLeft = "8px solid transparent";
      pin.style.borderRight = "8px solid transparent";
      pin.style.borderTop = `14px solid ${marker.color}`;
    }

    const label = document.createElement("div");
    label.className =
      "absolute pointer-events-none whitespace-nowrap rounded-md border px-2.5 py-1 text-[10px] font-semibold tracking-[0.03em] backdrop-blur";
    label.style.left = `${x + 12}px`;
    label.style.top = `${marker.shape === "arrowUp" ? markerTop - 24 : markerTop + 6}px`;
    label.style.color = marker.color;
    label.style.background = "rgba(11,15,23,0.94)";
    label.style.borderColor = `${marker.color}66`;
    label.style.boxShadow = "0 8px 24px rgba(0,0,0,0.28)";
    label.textContent = marker.text;

    fragment.appendChild(pin);
    fragment.appendChild(label);
  }

  overlayEl.appendChild(fragment);
}

function PremiumChart({ title, subtitle, bars, markers, dayStamp }) {
  const mainRef = useRef(null);
  const macdRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!mainRef.current || !macdRef.current || !overlayRef.current || !bars.length) {
      return undefined;
    }

    const chartOptions = {
      layout: {
        background: { type: ColorType.Solid, color: "#0b1018" },
        textColor: "#b9c2d0",
        attributionLogo: false
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.05)" }
      },
      rightPriceScale: {
        borderColor: "rgba(229,231,235,0.14)"
      },
      timeScale: {
        borderColor: "rgba(229,231,235,0.14)",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          const date = new Date(Number(time) * 1000);
          const hhmm = TIME_TICK_FORMATTER.format(date);

          if (hhmm === "04:00" || hhmm === "09:30" || hhmm === "16:00" || hhmm === "20:00") {
            return `${DAY_TICK_FORMATTER.format(date)} ${hhmm}`;
          }

          return hhmm;
        }
      },
      crosshair: {
        vertLine: {
          color: "rgba(125,211,252,0.28)",
          labelBackgroundColor: "#111827"
        },
        horzLine: {
          color: "rgba(125,211,252,0.28)",
          labelBackgroundColor: "#111827"
        }
      }
    };

    const mainChart = createChart(mainRef.current, {
      ...chartOptions,
      width: mainRef.current.clientWidth,
      height: 620
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
      priceLineVisible: false,
      lastValueVisible: true
    });
    candleSeries.setData(bars);

    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "volume" }
    });
    volumeSeries.setData(buildVolumeData(bars));

    mainChart.priceScale("volume").applyOptions({
      scaleMargins: {
        top: 0.77,
        bottom: 0.02
      }
    });

    const ema9 = mainChart.addSeries(LineSeries, {
      color: "#60a5fa",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    ema9.setData(calculateEmaSeries(bars, 9));

    const ema20 = mainChart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true
    });
    ema20.setData(calculateEmaSeries(bars, 20));

    const vwap = mainChart.addSeries(LineSeries, {
      color: "#38bdf8",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    vwap.setData(calculateVwapSeries(bars));

    const macd = calculateMacdSeries(bars);
    const macdHistogram = macdChart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 }
    });
    macdHistogram.setData(macd.histogram);

    const macdLine = macdChart.addSeries(LineSeries, {
      color: "#60a5fa",
      lineWidth: 2,
      priceLineVisible: false
    });
    macdLine.setData(macd.macdLine);

    const signalLine = macdChart.addSeries(LineSeries, {
      color: "#f97316",
      lineWidth: 2,
      priceLineVisible: false
    });
    signalLine.setData(macd.signalLine);

    const syncMain = (range) => macdChart.timeScale().setVisibleLogicalRange(range);
    const syncMacd = (range) => mainChart.timeScale().setVisibleLogicalRange(range);
    const refreshOverlay = () =>
      renderOverlay({
        overlayEl: overlayRef.current,
        chart: mainChart,
        candleSeries,
        bars,
        markers,
        dayStamp
      });

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(syncMain);
    macdChart.timeScale().subscribeVisibleLogicalRangeChange(syncMacd);
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(refreshOverlay);

    const first = bars[0]?.time;
    const last = bars[bars.length - 1]?.time;
    if (first && last) {
      mainChart.timeScale().setVisibleRange({ from: first, to: last });
      macdChart.timeScale().setVisibleRange({ from: first, to: last });
    } else {
      mainChart.timeScale().fitContent();
      macdChart.timeScale().fitContent();
    }

    refreshOverlay();

    const resizeObserver = new ResizeObserver(() => {
      if (mainRef.current) {
        mainChart.applyOptions({ width: mainRef.current.clientWidth });
      }
      if (macdRef.current) {
        macdChart.applyOptions({ width: macdRef.current.clientWidth });
      }
      refreshOverlay();
    });

    resizeObserver.observe(mainRef.current);
    resizeObserver.observe(macdRef.current);

    return () => {
      resizeObserver.disconnect();
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncMain);
      macdChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncMacd);
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(refreshOverlay);
      mainChart.remove();
      macdChart.remove();
    };
  }, [bars, markers, dayStamp]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="ui-title text-lg text-phosphor">{title}</h3>
          <p className="mt-1 text-sm text-mist">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {["1m", "EMA 9", "EMA 20", "VWAP", "MACD", "ETH"].map((item) => (
            <span key={item} className="ui-chip">
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-[16px] border border-[#e5e7eb42] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-2 shadow-[0_24px_50px_rgba(0,0,0,0.28)]">
        <div className="relative overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#0b1018]">
          <div ref={mainRef} />
          <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10" />
        </div>
        <div className="mt-3 overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#0b1018]">
          <div ref={macdRef} />
        </div>
      </div>
    </div>
  );
}

function TradeReviewCharts({ trade }) {
  const range = buildDayRange(trade.entryDate);
  const markers = useMemo(() => buildExecutionMarkers(trade), [trade]);
  const {
    data: response,
    loading,
    error
  } = useCachedAsyncResource({
    peek: () =>
      marketDataService.peekBars({
        symbol: trade.symbol,
        resolution: "1m",
        from: range.from,
        to: range.to,
        includeExtended: true
      }),
    load: () =>
      marketDataService.getBars({
        symbol: trade.symbol,
        resolution: "1m",
        from: range.from,
        to: range.to,
        includeExtended: true
      }),
    initialValue: { bars: [] },
    deps: [trade.symbol, trade.entryDate]
  });

  const bars = useMemo(() => hydrateMinuteBars(response?.bars || []), [response?.bars]);

  if (loading) {
    return (
      <LoadingState
        label="Loading market data..."
        className="min-h-[420px] rounded-[16px] border border-[#e5e7eb42] bg-black/30"
      />
    );
  }

  if (error) {
    return (
      <div className="rounded-[16px] border border-[#e5e7eb42] bg-black/30 p-5 text-sm text-mist">
        {error}
      </div>
    );
  }

  if (!bars.length) {
    return (
      <div className="rounded-[16px] border border-[#e5e7eb42] bg-black/30 p-5 text-sm text-mist">
        No market bars were returned for this trade window.
      </div>
    );
  }

  return (
    <PremiumChart
      title="Execution Review"
      subtitle="1-minute Alpaca bars with volume, extended-hours context, and execution markers at stored fill prices."
      bars={bars}
      markers={markers}
      dayStamp={range.dayStamp}
    />
  );
}

export default TradeReviewCharts;
