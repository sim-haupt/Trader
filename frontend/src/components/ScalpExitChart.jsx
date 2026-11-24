import { useEffect, useRef } from "react";
import { ColorType, LineSeries, createChart, createSeriesMarkers } from "lightweight-charts";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
});

const axisFor = (exit, seconds) => Math.floor(exit / 1000) + seconds;

export default function ScalpExitChart({ data, selected, onSelect, selectMode, showFills }) {
  const host = useRef(null);
  const chartState = useRef(null);
  const dragging = useRef(false);

  useEffect(() => {
    const chart = createChart(host.current, {
      autoSize: true, height: 245,
      layout: { background: { type: ColorType.Solid, color: "#101010" }, textColor: "#aeb0b4" },
      grid: { vertLines: { color: "#212121" }, horzLines: { color: "#212121" } },
      localization: { timeFormatter: (time) => timeFormatter.format(time * 1000) },
      timeScale: { timeVisible: true, secondsVisible: data.resolution !== "minute", borderColor: "#333",
        tickMarkFormatter: (time) => timeFormatter.format(time * 1000) }
    });
    const path = chart.addSeries(LineSeries, {
      color: "#a6c8ff", lineWidth: 1, lastValueVisible: false, priceLineVisible: false,
      crosshairMarkerVisible: false
    });
    const markersLine = chart.addSeries(LineSeries, {
      color: "transparent", lineVisible: false, pointMarkersVisible: false,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false
    });
    const markers = createSeriesMarkers(markersLine, []);
    const samples = data.points.map(({ seconds, price }) => ({
      time: axisFor(data.exit, seconds), ...(price != null && { value: price })
    }));
    path.setData(samples);
    chart.timeScale().fitContent();
    chartState.current = { chart, markersLine, markers, first: samples[0].time, last: samples.at(-1).time };
    return () => {
      chart.remove();
      chartState.current = null;
    };
  }, [data]);

  useEffect(() => {
    chartState.current?.chart.applyOptions({ handleScroll: !selectMode });
  }, [data, selectMode]);

  useEffect(() => {
    const state = chartState.current;
    if (!state) return;
    const marks = [{ time: data.exit, price: data.exitPrice, text: "Actual", color: "#f0f0f0", shape: "square" }];
    const entry = data.fills[0];
    if (entry) marks.push({ ...entry, text: "Entry", color: "#34e0a1", shape: "arrowUp" });
    if (showFills) data.fills.slice(1, -1).forEach((fill) => marks.push({ ...fill,
      text: "", color: "#aeb0b4", shape: fill.shares > 0 ? "arrowUp" : "arrowDown" }));
    if (selected?.seconds && selected.price != null && selected.net != null) {
      marks.push({ time: selected.time, price: selected.price, text: "What-if", color: "#ffd67a", shape: "circle" });
    }
    const ordered = marks.map((mark) => ({ ...mark, time: axisFor(data.exit, Math.round((mark.time - data.exit) / 1000)) }))
      .filter(({ time }) => time >= state.first && time <= state.last).sort((a, b) => a.time - b.time);
    const byTime = new Map(ordered.map(({ time, price }) => [time, { time, value: price }]));
    state.markersLine.setData([...byTime.values()]);
    state.markers.setMarkers(ordered.map(({ time, text, color, shape }) => ({
      time, text, color, shape, position: text === "What-if" ? "belowBar" : "aboveBar"
    })));
  }, [data, selected, showFills]);

  function pick(event) {
    const axis = chartState.current?.chart.timeScale().coordinateToTime(event.clientX - host.current.getBoundingClientRect().left);
    if (typeof axis !== "number") return;
    const step = data.resolution === "minute" ? 60 : 1;
    const seconds = Math.round((axis - axisFor(data.exit, 0)) / step) * step;
    if (data.points.some((point) => point.seconds === seconds)) onSelect(seconds);
  }

  return <div ref={host} className="w-full min-w-0" aria-label="Exit price timeline" style={{ touchAction: selectMode ? "none" : undefined }}
    onPointerDown={(event) => {
      if (!selectMode || event.button !== 0) return;
      dragging.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      pick(event);
    }}
    onPointerMove={(event) => { if (dragging.current) pick(event); }}
    onPointerUp={() => { dragging.current = false; }}
    onPointerCancel={() => { dragging.current = false; }}
  />;
}
