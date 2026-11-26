export function createImageThumbnail(source, options = {}) {
  const maxSize = options.maxSize || 520;
  const quality = options.quality || 0.72;

  return new Promise((resolve) => {
    if (!source) {
      resolve("");
      return;
    }

    const image = new Image();
    const objectUrl = source instanceof File ? URL.createObjectURL(source) : "";

    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        resolve("");
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    image.onerror = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      resolve("");
    };

    image.src = objectUrl || source;
  });
}
