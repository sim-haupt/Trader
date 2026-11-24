import api from "./api";

const root = "/analysis";
const reviews = `${root}/entry-reviews`;
const premarket = `${root}/premarket`;
const unwrap = (response) => response.data.data;

export default {
  getRiskProfile() { return api.get(`${root}/risk-profile`).then(unwrap); },
  saveSimulation(settings) { return api.put(`${root}/risk-profile/simulation`, settings).then(unwrap); },
  saveRiskProfile(settings) { return api.put(`${root}/risk-profile`, settings).then(unwrap); },
  saveBehavior(id, behavior) { return api.put(`${root}/trades/${id}/behavior`, behavior).then(unwrap); },
  getReplay(id, step, signal) { return api.get(`${root}/trades/${id}/replay`, { params: { step }, signal }).then(unwrap); },
  saveOriginalRisk(id, values) { return api.put(`${root}/trades/${id}/original-risk`, values).then(unwrap); },
  saveReplayNotes(id, notes) { return api.put(`${root}/trades/${id}/replay-notes`, { notes }).then(unwrap); },
  getSimulationPaths(ids) { return api.post(`${root}/simulation/paths`, { ids }).then(unwrap); },
  refreshTrade(id) { return api.post(`${root}/trades/${id}/refresh`).then(unwrap); },
  refreshTrades(ids) { return api.post(`${root}/trades/refresh`, { ids }).then(unwrap); },
  saveTradePlan(id, data) { return api.put(`${root}/trades/${id}/plan`, data).then(unwrap); },
  getQueue(params) { return api.get(reviews, { params }).then(unwrap); },
  getEntry(id) { return api.get(`${reviews}/${id}`).then(unwrap); },
  saveGrade(id, data) { return api.post(`${reviews}/${id}`, data).then(unwrap); },
  getOutcome(id) { return api.get(`${reviews}/${id}/outcome`).then(unwrap); },
  saveReflection(id, notes) { return api.patch(`${reviews}/${id}/reflection`, { notes }).then(unwrap); },
  getMovers(day, signal) { return api.get(`${premarket}/movers`, { params: { day }, signal }).then(unwrap); },
  collectMovers(day, signal) { return api.post(`${premarket}/movers`, { day }, { signal }).then(unwrap); },
  getPremarket(params) { return api.get(premarket, { params }).then(unwrap); },
  saveScan(data) { return api.put(`${premarket}/scan`, data).then(unwrap); },
  capture(data) { return api.post(`${premarket}/snapshot`, data).then(unwrap); },
  getRecaps(params) { return api.get(`${premarket}/recaps`, { params }).then(unwrap); },
  getEntryContext(params) { return api.get(`${premarket}/entry-context`, { params }).then(unwrap); }
};
