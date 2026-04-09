const BACKEND_BASE_URL = "https://trader-production-0a3d.up.railway.app";

export default async function handler(req, res) {
  const userId = req.query?.userId;

  if (!userId) {
    res.status(400).json({
      success: false,
      error: "userId is required"
    });
    return;
  }

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === "userId" || value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== "") {
          searchParams.append(key, String(item));
        }
      });
      continue;
    }

    searchParams.set(key, String(value));
  }

  const targetUrl = `${BACKEND_BASE_URL}/api/public/trades/widget-summary/${encodeURIComponent(userId)}${
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  }`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        Accept: "application/json"
      }
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

    if (typeof payload === "string") {
      res.status(response.status).send(payload);
      return;
    }

    res.status(response.status).json(payload);
  } catch (error) {
    res.status(502).json({
      success: false,
      error: "Failed to fetch public widget summary"
    });
  }
}
