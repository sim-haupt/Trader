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

const CHART_GREEN = "#00d084";
const CHART_RED = "#ff4d5e";
const BUY_MARKER_GREEN = "#39ff14";
const SELL_MARKER_RED = "#ff1f3d";
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
  if (!anchorDate) {
    return { from: "", to: "", dayStamp: "" };
  }

  const dayStamp = getEasternDayStamp(anchorDate);

  if (!dayStamp) {
    const fallback = new Date(anchorDate);
    const fallbackIso = Number.isNaN(fallback.getTime()) ? "" : fallback.toISOString();
    return { from: fallbackIso, to: fallbackIso, dayStamp: "" };
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
    color: bar.close >= bar.open ? "rgba(8,153,129,0.42)" : "rgba(242,54,69,0.38)"
  }));
}

function padSeriesToTimeline(series, timelineBars) {
  const seriesMap = new Map(series.map((point) => [point.time, point]));

  return timelineBars.map((bar) => seriesMap.get(bar.time) ?? { time: bar.time });
}

function getChartHeights(width) {
  if (width < 640) {
    return {
      main: 420,
      macd: 130
    };
  }

  if (width < 1024) {
    return {
      main: 520,
      macd: 160
    };
  }

  return {
    main: 620,
    macd: 180
  };
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

function getInitialLogicalRange(bars, markers) {
  if (!bars.length) {
    return null;
  }

  const markerTimes = markers
    .map((marker) => marker.rawTime || marker.time)
    .filter((time) => Number.isFinite(time));

  if (!markerTimes.length) {
    return {
      from: Math.max(0, bars.length - 180),
      to: bars.length - 1
    };
  }

  const markerIndexes = markerTimes.map((time) => {
    let closestIndex = 0;
    let closestDistance = Infinity;

    bars.forEach((bar, index) => {
      const distance = Math.abs(Number(bar.time) - time);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return closestIndex;
  });

  const minIndex = Math.min(...markerIndexes);
  const maxIndex = Math.max(...markerIndexes);
  const padding = Math.max(35, Math.round((maxIndex - minIndex + 1) * 0.65));

  return {
    from: Math.max(0, minIndex - padding),
    to: Math.min(bars.length - 1, maxIndex + padding)
  };
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

    const isBuy = marker.shape === "arrowUp";
    const direction = isBuy ? 1 : -1;
    const yOffset = stackIndex * 7 * direction;
    const markerTop = y + yOffset;
    const markerColor = isBuy ? BUY_MARKER_GREEN : SELL_MARKER_RED;

    const markerWrap = document.createElement("div");
    markerWrap.className = "absolute z-20";
    markerWrap.style.left = `${x}px`;
    markerWrap.style.top = `${markerTop}px`;
    markerWrap.style.transform = "translate(-50%, -50%)";
    markerWrap.style.pointerEvents = "none";

    const line = document.createElement("div");
    line.className = "absolute rounded-full";
    line.style.left = "-18px";
    line.style.top = "0";
    line.style.width = "36px";
    line.style.height = "3px";
    line.style.transform = "translateY(-50%)";
    line.style.background = markerColor;
    line.style.boxShadow = `0 0 0 1px rgba(5,5,5,0.92), 0 0 12px ${markerColor}99`;
    line.style.pointerEvents = "none";

    const endCap = document.createElement("div");
    endCap.className = "absolute rounded-full";
    endCap.style.left = isBuy ? "-22px" : "18px";
    endCap.style.top = "0";
    endCap.style.width = "7px";
    endCap.style.height = "7px";
    endCap.style.transform = "translate(-50%, -50%)";
    endCap.style.background = markerColor;
    endCap.style.boxShadow = `0 0 10px ${markerColor}`;
    endCap.style.pointerEvents = "none";

    const sideLabel = document.createElement("div");
    sideLabel.className = "absolute text-[9px] font-black";
    sideLabel.style.left = isBuy ? "-32px" : "26px";
    sideLabel.style.top = "0";
    sideLabel.style.transform = "translateY(-50%)";
    sideLabel.style.color = markerColor;
    sideLabel.style.textShadow = "0 1px 4px rgba(0,0,0,0.88)";
    sideLabel.style.pointerEvents = "none";
    sideLabel.textContent = isBuy ? "B" : "S";

    const label = document.createElement("div");
    label.className =
      "absolute whitespace-nowrap rounded-[6px] border px-2.5 py-1 text-[10px] font-semibold tracking-[0.03em] backdrop-blur";
    label.style.left = "24px";
    label.style.top = `${isBuy ? -30 : 10}px`;
    label.style.color = markerColor;
    label.style.background = "rgba(5,5,5,0.94)";
    label.style.borderColor = `${markerColor}88`;
    label.style.boxShadow = `0 8px 24px rgba(0,0,0,0.32), 0 0 18px ${markerColor}22`;
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

    markerWrap.appendChild(line);
    markerWrap.appendChild(endCap);
    markerWrap.appendChild(sideLabel);
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
  dayStamp
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
        background: { type: ColorType.Solid, color: "#050505" },
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
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
        rightBarStaysOnScroll: false,
        tickMarkFormatter: formatChartTick
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false
      },
      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: false
        },
        mouseWheel: true,
        pinch: true
      },
      localization: {
        locale: "en-US",
        timeFormatter: formatCrosshairTime
      },
      crosshair: {
        vertLine: {
          color: "rgba(125,211,252,0.28)",
          labelBackgroundColor: "#1f1f1f"
        },
        horzLine: {
          color: "rgba(125,211,252,0.28)",
          labelBackgroundColor: "#1f1f1f"
        }
      }
    };

    const mainChart = createChart(mainRef.current, {
      ...chartOptions,
      width: mainRef.current.clientWidth,
      height: getChartHeights(mainRef.current.clientWidth).main
    });

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: CHART_GREEN,
      downColor: CHART_RED,
      borderVisible: false,
      wickUpColor: CHART_GREEN,
      wickDownColor: CHART_RED,
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
      handleScroll: false,
      handleScale: false,
      width: macdRef.current.clientWidth,
      height: getChartHeights(macdRef.current.clientWidth).macd,
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

    const syncMacdLogicalRange = (range) => {
      if (range) {
        macdChart.timeScale().setVisibleLogicalRange(range);
      }
    };

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(refreshOverlay);
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(syncMacdLogicalRange);

    const initialLogicalRange = getInitialLogicalRange(candleBars, markers);
    if (initialLogicalRange) {
      mainChart.timeScale().setVisibleLogicalRange(initialLogicalRange);
      macdChart.timeScale().setVisibleLogicalRange(initialLogicalRange);
    } else {
      mainChart.timeScale().fitContent();
      macdChart.timeScale().fitContent();
    }

    refreshOverlay();
    const rafId = requestAnimationFrame(refreshOverlay);

    const resizeObserver = new ResizeObserver(() => {
      if (mainRef.current) {
        const heights = getChartHeights(mainRef.current.clientWidth);
        mainChart.applyOptions({ width: mainRef.current.clientWidth, height: heights.main });
      }
      if (macdRef.current) {
        const heights = getChartHeights(macdRef.current.clientWidth);
        macdChart.applyOptions({ width: macdRef.current.clientWidth, height: heights.macd });
      }
      refreshOverlay();
    });

    resizeObserver.observe(mainRef.current);
    resizeObserver.observe(macdRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(refreshOverlay);
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncMacdLogicalRange);
      mainChart.remove();
      macdChart.remove();
    };
  }, [actualBars, candleBars, markers, dayStamp]);

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

function TradeReviewCharts({ trade, trades, title = "Execution Review" }) {
  const chartTrades = useMemo(() => {
    if (Array.isArray(trades) && trades.length > 0) {
      return trades;
    }

    return trade ? [trade] : [];
  }, [trade, trades]);
  const anchorTrade = chartTrades[0];
  const range = buildDayRange(anchorTrade?.entryDate);
  const markers = useMemo(
    () => chartTrades.flatMap((chartTrade) => buildExecutionMarkers(chartTrade)),
    [chartTrades]
  );

  const {
    data: response,
    loading,
    error
  } = useCachedAsyncResource({
    peek: () =>
      marketDataService.peekBars({
        symbol: anchorTrade?.symbol,
        resolution: "1m",
        from: range.from,
        to: range.to,
        includeExtended: true
      }),
    load: () =>
      marketDataService.getBars({
        symbol: anchorTrade?.symbol,
        resolution: "1m",
        from: range.from,
        to: range.to,
        includeExtended: true
      }),
    initialValue: { bars: [] },
    enabled: Boolean(anchorTrade),
    deps: [anchorTrade?.symbol, anchorTrade?.entryDate]
  });

  const timeline = useMemo(
    () => buildMinuteTimeline(response?.bars || [], range.dayStamp),
    [response?.bars, range.dayStamp]
  );

  if (!anchorTrade) {
    return (
      <div className="rounded-[6px] border border-[var(--line)] bg-black p-5 text-sm text-mist">
        No trades available for this chart.
      </div>
    );
  }

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
      title={title}
      candleBars={timeline.candleBars}
      actualBars={timeline.actualBars}
      markers={markers}
      dayStamp={range.dayStamp}
    />
  );
}

export default TradeReviewCharts;
