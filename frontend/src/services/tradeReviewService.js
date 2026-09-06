import api from "./api";

function getAssetOrigin() {
  const baseUrl = api.defaults.baseURL || "";

  if (!baseUrl) {
    return "";
  }

  try {
    const url = new URL(baseUrl, window.location.origin);
    url.pathname = url.pathname.replace(/\/api\/?$/, "");
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch {
    return baseUrl.replace(/\/api\/?$/, "");
  }
}

export function getTradeReviewImageUrl(imageUrl) {
  if (!imageUrl) {
    return "";
  }

  if (/^(https?:|data:)/i.test(imageUrl)) {
    return imageUrl;
  }

  return `${getAssetOrigin()}${imageUrl}`;
}

const tradeReviewService = {
  async getImages(filters = {}) {
    const params = new URLSearchParams();

    (filters.tags || []).forEach((tag) => {
      params.append("tag", tag);
    });

    const response = await api.get(`/trade-reviews${params.toString() ? `?${params.toString()}` : ""}`);
    return response.data.data ?? [];
  },

  async getTags() {
    const response = await api.get("/trade-reviews/tags");
    return response.data.data ?? [];
  },

  async getImage(id) {
    const response = await api.get(`/trade-reviews/${id}`);
    return response.data.data;
  },

  async uploadImages({ files, tags, notes, thumbnails }) {
    const formData = new FormData();
    (files || []).forEach((file) => {
      formData.append("images", file);
    });
    formData.append("tags", JSON.stringify(tags || []));
    formData.append("notes", notes || "");
    if (thumbnails?.length) {
      formData.append("thumbnails", JSON.stringify(thumbnails));
    }

    const response = await api.post("/trade-reviews", formData);

    return response.data.data;
  },

  async updateImage(id, { tags, notes, thumbnail }) {
    const response = await api.put(`/trade-reviews/${id}`, {
      tags: tags || [],
      notes: notes || "",
      ...(thumbnail ? { thumbnail } : {})
    });

    return response.data.data;
  },

  async deleteImage(id) {
    const response = await api.delete(`/trade-reviews/${id}`);
    return response.data.data;
  }
};

export default tradeReviewService;
