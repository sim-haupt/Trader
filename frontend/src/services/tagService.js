import api from "./api";

let tagCache = null;

function clearTagCache() {
  tagCache = null;
}

const tagService = {
  peekTags() {
    return tagCache;
  },

  async getTags(options = {}) {
    if (tagCache && !options.forceRefresh) {
      return tagCache;
    }

    const response = await api.get("/tags");
    tagCache = response.data.data ?? [];
    return tagCache;
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
  }
};

export default tagService;
