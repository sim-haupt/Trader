import api from "./api";

const root = "/intelligence";
const data = (response) => response.data.data;

const service = {
  overview(range) { return api.post(`${root}/overview`, { range }).then(data); },
  dismiss(fingerprint) { return api.post(`${root}/dismiss`, { fingerprint }).then(data); },
  ask(body) { return api.post(`${root}/coach`, body).then(data); },
  compare(a, b) { return api.post(`${root}/compare`, { a, b }).then(data); },
  saveProfile(settings) { return api.put(`${root}/profile`, settings).then(data); },
  listReports() { return api.get(`${root}/reports`).then(data); },
  report(id) { return api.get(`${root}/reports/${id}`).then(data); },
  generate(body) { return api.post(`${root}/reports`, body).then(data); },
  async download(report, format) {
    const response = await api.get(`${root}/reports/${report.id}/export/${format}`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trading-${report.kind}-${report.fromDay}-${report.toDay}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  listGoals() { return api.get(`${root}/goals`).then(data); },
  createGoal(body) { return api.post(`${root}/goals`, body).then(data); },
  goalAction(id, action) { return api.post(`${root}/goals/${id}/${action}`).then(data); }
};

export default service;
