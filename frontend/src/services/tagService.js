import api from "./api";
import {
  clearPersistentCacheGroup,
  readPersistentCache,
  removePersistentCache,
  writePersistentCache
} from "../utils/persistentCache";

let tagCache = null;
let tagRequest = null;
const TAG_TTL_MS = 5 * 60_000;

export function clearTagCache() {
  tagCache = null;
  tagRequest = null;
  clearPersistentCacheGroup("tag");
}

const tagService = {
  peekTags() {
    if (tagCache) {
      return tagCache;
    }

    tagCache = readPersistentCache("tag:list", TAG_TTL_MS);
    return tagCache;
  },

  async getTags(options = {}) {
    const cached = this.peekTags();

    if (cached && !options.forceRefresh) {
      return cached;
    }

    if (!options.forceRefresh && tagRequest) {
      return tagRequest;
    }

    if (options.forceRefresh) {
      removePersistentCache("tag:list");
    }

    tagRequest = api
      .get("/tags")
      .then((response) => {
        tagCache = response.data.data ?? [];
        writePersistentCache("tag:list", tagCache);
        return tagCache;
      })
      .finally(() => {
        tagRequest = null;
      });

    return tagRequest;
  },

  async createTag(name) {
    const response = await api.post("/tags", { name });
    clearTagCache();
    return response.data.data;
  },

  async deleteTag(id) {
    const response = await api.delete(`/tags/${id}`);
    clearTagCache();
    return response.data.data;
  },

  async deleteTags(ids) {
    await Promise.all(ids.map((id) => api.delete(`/tags/${id}`)));
    clearTagCache();
  }
};

export default tagService;
