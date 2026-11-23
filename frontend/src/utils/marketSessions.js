const PREMARKET_START = 240;
const PREMARKET = [
  [540, "Premarket 09:00–09:30"],
  [480, "Premarket 08:00–09:00"],
  [420, "Premarket 07:00–08:00"],
  [PREMARKET_START, "Premarket 04:00–07:00"]
];

const REGULAR_OPEN = 570;
const REGULAR_CLOSE = 960;

export function isPremarketMinute(minutes) {
  return minutes >= PREMARKET_START && minutes < REGULAR_OPEN;
}

export const DASHBOARD_SESSIONS = [
  "Premarket", "Open", "Midday", "Power Hour", "After Hours", "Overnight"
];

export function getSessionBucket(minutes, detailed = false) {
  if (minutes < PREMARKET_START || minutes >= 1200) return "Overnight";
  if (isPremarketMinute(minutes)) {
    return detailed ? PREMARKET.find(([start]) => minutes >= start)[1] : "Premarket";
  }
  if (minutes < 575 && detailed) return "Market open to +5m";
  if (minutes < 585 && detailed) return "+5m to +15m";
  if (minutes < 600 && detailed) return "+15m to +30m";
  if (minutes < 630 && detailed) return "+30m to +60m";
  if (minutes < 660) return detailed ? "+60m to +90m" : "Open";
  if (minutes < 900) return "Midday";
  if (minutes < REGULAR_CLOSE) return detailed ? "Final trading hour" : "Power Hour";
  return "After Hours";
}


export function getMarketSession(minutes) {
  if (minutes >= REGULAR_OPEN && minutes < REGULAR_CLOSE) return "Regular";
  if (isPremarketMinute(minutes)) return "Premarket";
  if (minutes >= REGULAR_CLOSE && minutes < 1200) return "After hours";
  return "Overnight";
}
