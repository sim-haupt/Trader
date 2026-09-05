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

  if (/^https?:\/\//i.test(imageUrl)) {
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

  async uploadImage({ file, tags, notes }) {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("tags", JSON.stringify(tags || []));
    formData.append("notes", notes || "");

    const response = await api.post("/trade-reviews", formData);

    return response.data.data;
  },

  async deleteImage(id) {
    const response = await api.delete(`/trade-reviews/${id}`);
    return response.data.data;
  }
};

export default tradeReviewService;
