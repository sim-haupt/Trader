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
const CROSSHAIR_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CHART_TZ,
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

function formatChartTick(time) {
  const date = new Date(Number(time) * 1000);
  const hhmm = TIME_TICK_FORMATTER.format(date);

  if (hhmm === "04:00" || hhmm === "09:30" || hhmm === "16:00" || hhmm === "20:00") {
    return `${DAY_TICK_FORMATTER.format(date)} ${hhmm}`;
  }

  return hhmm;
}

function formatCrosshairTime(time) {
  return CROSSHAIR_TIME_FORMATTER.format(new Date(Number(time) * 1000));
}

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

function buildMinuteTimeline(rawBars, dayStamp) {
  if (!dayStamp) {
    return { candleBars: [], actualBars: [], sessionStart: null, sessionEnd: null };
  }

  const actualBars = [...(Array.isArray(rawBars) ? rawBars : [])]
    .filter(
      (bar) =>
        Number.isFinite(bar.time) &&
        Number.isFinite(bar.open) &&
        Number.isFinite(bar.high) &&
        Number.isFinite(bar.low) &&
        Number.isFinite(bar.close)
    )
    .sort((left, right) => left.time - right.time);

  const sessionStart = getEasternTimestamp(dayStamp, 4, 0, 0);
  const sessionEnd = getEasternTimestamp(dayStamp, 20, 0, 0);
  const actualBarMap = new Map(actualBars.map((bar) => [bar.time, bar]));
  const candleBars = [];

  for (let time = sessionStart; time <= sessionEnd; time += 60) {
    candleBars.push(actualBarMap.get(time) ?? { time });
  }

  return {
    candleBars,
    actualBars,
    sessionStart,
    sessionEnd
  };
}

function getSessionShades(dayStamp) {
  if (!dayStamp) {
    return [];
  }

  return [
    {
      start: getEasternTimestamp(dayStamp, 4, 0),
      end: getEasternTimestamp(dayStamp, 9, 30),
      background: "rgba(245,158,11,0.08)"
    },
    {
      start: getEasternTimestamp(dayStamp, 16, 0),
      end: getEasternTimestamp(dayStamp, 20, 0),
      background: "rgba(59,130,246,0.07)"
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

function padSeriesToTimeline(series, timelineBars) {
  const seriesMap = new Map(series.map((point) => [point.time, point]));

  return timelineBars.map((bar) => seriesMap.get(bar.time) ?? { time: bar.time });
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
    const snappedTime = marker.time ?? Math.floor(exactTime / 60) * 60;
    const barTime = nearestBarTime(bars, snappedTime) ?? firstBarTime;
    const x =
      chart.timeScale().timeToCoordinate(exactTime) ??
      chart.timeScale().timeToCoordinate(snappedTime) ??
      (barTime != null ? chart.timeScale().timeToCoordinate(barTime) : null);
    const y = candleSeries.priceToCoordinate(marker.price);

    if (
      x == null ||
      y == null ||
      (firstBarTime && snappedTime < firstBarTime) ||
      (lastBarTime && snappedTime > lastBarTime)
    ) {
      continue;
    }

    const stackKey = `${marker.shape}:${snappedTime}`;
    const stackIndex = markerStacks.get(stackKey) ?? 0;
    markerStacks.set(stackKey, stackIndex + 1);

    const direction = marker.shape === "arrowUp" ? 1 : -1;
    const yOffset = stackIndex * 16 * direction;
    const markerTop = y + yOffset;

    const markerWrap = document.createElement("div");
    markerWrap.className = "absolute z-20";
    markerWrap.style.left = `${x}px`;
    markerWrap.style.top = `${markerTop}px`;
    markerWrap.style.transform = "translate(-50%, -50%)";
    markerWrap.style.pointerEvents = "auto";

    const pin = document.createElement("div");
    pin.className = "absolute";
    pin.style.left = "0";
    pin.style.top = "0";
    pin.style.width = "0";
    pin.style.height = "0";
    pin.style.transform = "translate(-50%, -50%)";
    pin.style.filter = "drop-shadow(0 4px 10px rgba(0,0,0,0.45))";
    pin.style.cursor = "pointer";

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
      "absolute whitespace-nowrap rounded-[6px] border px-2.5 py-1 text-[10px] font-semibold tracking-[0.03em] backdrop-blur";
    label.style.left = "12px";
    label.style.top = `${marker.shape === "arrowUp" ? -24 : 6}px`;
    label.style.color = marker.color;
    label.style.background = "rgba(11,15,23,0.94)";
    label.style.borderColor = `${marker.color}66`;
    label.style.boxShadow = "0 8px 24px rgba(0,0,0,0.28)";
    label.style.opacity = "0";
    label.style.visibility = "hidden";
    label.style.transition = "opacity 120ms ease";
    label.style.pointerEvents = "none";
    label.textContent = marker.text;

    markerWrap.addEventListener("mouseenter", () => {
      label.style.opacity = "1";
      label.style.visibility = "visible";
    });

    markerWrap.addEventListener("mouseleave", () => {
      label.style.opacity = "0";
      label.style.visibility = "hidden";
    });

    markerWrap.appendChild(pin);
    markerWrap.appendChild(label);
    fragment.appendChild(markerWrap);
  }

  overlayEl.appendChild(fragment);
}

function PremiumChart({
  title,
  subtitle,
  candleBars,
  actualBars,
  markers,
  dayStamp,
  sessionStart,
  sessionEnd
}) {
  const mainRef = useRef(null);
  const macdRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!mainRef.current || !macdRef.current || !overlayRef.current || !candleBars.length) {
      return undefined;
    }

    const ema9Data = calculateEmaSeries(actualBars, 9);
    const ema20Data = calculateEmaSeries(actualBars, 20);
    const vwapData = calculateVwapSeries(actualBars);
    const macdData = calculateMacdSeries(actualBars);

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
        tickMarkFormatter: formatChartTick
      },
      localization: {
        locale: "en-US",
        timeFormatter: formatCrosshairTime
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

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: "#3dff9a",
      downColor: "#ff5f7a",
      borderVisible: false,
      wickUpColor: "#3dff9a",
      wickDownColor: "#ff5f7a",
      priceLineVisible: false,
      lastValueVisible: true
    });
    candleSeries.setData(candleBars);

    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "volume" }
    });
    volumeSeries.setData(buildVolumeData(actualBars));

    const ema9Series = mainChart.addSeries(LineSeries, {
      color: "#22d3ee",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    ema9Series.setData(ema9Data);

    const ema20Series = mainChart.addSeries(LineSeries, {
      color: "#8b5cf6",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: true
    });
    ema20Series.setData(ema20Data);

    const vwapSeries = mainChart.addSeries(LineSeries, {
      color: "#ffd84d",
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: true
    });
    vwapSeries.setData(vwapData);

    mainChart.priceScale("volume").applyOptions({
      scaleMargins: {
        top: 0.77,
        bottom: 0.02
      }
    });

    const macdChart = createChart(macdRef.current, {
      ...chartOptions,
      width: macdRef.current.clientWidth,
      height: 180,
      rightPriceScale: {
        borderColor: "rgba(229,231,235,0.14)",
        scaleMargins: {
          top: 0.12,
          bottom: 0.12
        }
      }
    });

    const paddedMacdHistogram = padSeriesToTimeline(macdData.histogram, candleBars);
    const paddedMacdLine = padSeriesToTimeline(macdData.macdLine, candleBars);
    const paddedSignalLine = padSeriesToTimeline(macdData.signalLine, candleBars);

    const macdHistogramSeries = macdChart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: true
    });
    macdHistogramSeries.setData(paddedMacdHistogram);

    const macdLineSeries = macdChart.addSeries(LineSeries, {
      color: "#60a5fa",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    macdLineSeries.setData(paddedMacdLine);

    const signalLineSeries = macdChart.addSeries(LineSeries, {
      color: "#fb923c",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });
    signalLineSeries.setData(paddedSignalLine);
    const refreshOverlay = () =>
      renderOverlay({
        overlayEl: overlayRef.current,
        chart: mainChart,
        candleSeries,
        bars: candleBars,
        markers,
        dayStamp
      });

    let isSyncingRange = false;

    const syncMacdRange = (range) => {
      if (range && !isSyncingRange) {
        isSyncingRange = true;
        macdChart.timeScale().setVisibleRange(range);
        isSyncingRange = false;
      }
    };

    const syncMainRange = (range) => {
      if (range && !isSyncingRange) {
        isSyncingRange = true;
        mainChart.timeScale().setVisibleRange(range);
        isSyncingRange = false;
      }
    };

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(refreshOverlay);
    mainChart.timeScale().subscribeVisibleTimeRangeChange(syncMacdRange);
    macdChart.timeScale().subscribeVisibleTimeRangeChange(syncMainRange);

    const first = sessionStart ?? candleBars[0]?.time;
    const last = sessionEnd ?? candleBars[candleBars.length - 1]?.time;
    if (first && last) {
      mainChart.timeScale().setVisibleRange({ from: first, to: last });
      macdChart.timeScale().setVisibleRange({ from: first, to: last });
    } else {
      mainChart.timeScale().fitContent();
      macdChart.timeScale().fitContent();
    }

    refreshOverlay();
    const rafId = requestAnimationFrame(refreshOverlay);

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
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(refreshOverlay);
      mainChart.timeScale().unsubscribeVisibleTimeRangeChange(syncMacdRange);
      macdChart.timeScale().unsubscribeVisibleTimeRangeChange(syncMainRange);
      mainChart.remove();
      macdChart.remove();
    };
  }, [actualBars, candleBars, markers, dayStamp, sessionEnd, sessionStart]);

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

      <div className="rounded-[6px] border border-[var(--line)] bg-black p-2">
        <div className="relative overflow-hidden rounded-[6px] border border-[var(--line)] bg-black">
          <div ref={mainRef} />
          <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10" />
        </div>
      </div>

      <div className="rounded-[6px] border border-[var(--line)] bg-black p-2">
        <div className="relative overflow-hidden rounded-[6px] border border-[var(--line)] bg-black">
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

  const timeline = useMemo(
    () => buildMinuteTimeline(response?.bars || [], range.dayStamp),
    [response?.bars, range.dayStamp]
  );

  if (loading) {
    return (
      <LoadingState
        label="Loading market data..."
        className="min-h-[420px] rounded-[6px] border border-[var(--line)] bg-black"
      />
    );
  }

  if (error) {
    return (
      <div className="rounded-[6px] border border-[var(--line)] bg-black p-5 text-sm text-mist">
        {error}
      </div>
    );
  }

  if (!timeline.actualBars.length) {
    return (
      <div className="rounded-[6px] border border-[var(--line)] bg-black p-5 text-sm text-mist">
        No market bars were returned for this trade window.
      </div>
    );
  }

  return (
    <PremiumChart
      title="Execution Review"
      candleBars={timeline.candleBars}
      actualBars={timeline.actualBars}
      markers={markers}
      dayStamp={range.dayStamp}
      sessionStart={timeline.sessionStart}
      sessionEnd={timeline.sessionEnd}
    />
  );
}

export default TradeReviewCharts;
