import { monteCarlo } from "./tradeSimulation.js";

self.onmessage = ({ data: { sample, options } }) => {
  try {
    const A = monteCarlo(sample, options);
    const B = monteCarlo(sample, { ...options, size: options.compareSize });
    self.postMessage({ A, B });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
