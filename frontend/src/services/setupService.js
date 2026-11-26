import strategyService, { clearStrategyCache } from "./strategyService";
import api from "./api";
import { createImageThumbnail } from "../utils/imageThumbnail";

export const MAX_SETUP_IMAGES = 8;
export const MAX_SETUP_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_SETUP_UPLOAD_BYTES = 24 * 1024 * 1024;

export function clearSetupCache() {
  clearStrategyCache();
}

const setupService = {
  async getLibrary(signal) {
    const response = await api.get("/setups", { signal });
    return response.data.data;
  },

  async getImage(id, signal) {
    const response = await api.get(`/setups/images/${id}`, { responseType: "blob", signal });
    return response.data;
  },

  async saveDetails({ id, name, grade, notes, shareSize, files, removedImageIds, imageOrder }) {
    const thumbnails = await Promise.all(files.map((file) =>
      createImageThumbnail(file, { maxSize: 180 })
    ));
    if (thumbnails.some((thumbnail) => !thumbnail)) {
      throw new Error("One of the selected images could not be opened.");
    }

    const form = new FormData();
    form.append("grade", grade);
    form.append("notes", notes);
    form.append("shareSize", shareSize);
    form.append("thumbnails", JSON.stringify(thumbnails));
    for (const file of files) form.append("images", file);

    if (id) {
      form.append("imageOrder", JSON.stringify(imageOrder));
      for (const imageId of removedImageIds) form.append("removeImageIds", imageId);
      const response = await api.patch(`/setups/${id}`, form);
      return response.data.data;
    }

    form.append("name", name);
    const response = await api.post("/setups", form);
    clearSetupCache();
    return response.data.data;
  },

  peekSetups() {
    return strategyService.peekStrategies();
  },

  getSetups(options = {}) {
    return strategyService.getStrategies(options);
  },

  createSetup(name) {
    return strategyService.createStrategy(name);
  },

  deleteSetup(id) {
    return strategyService.deleteStrategy(id);
  },

  deleteSetups(ids) {
    return strategyService.deleteStrategies(ids);
  }
};

export default setupService;
