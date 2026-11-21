self.onmessage = async (
  e: MessageEvent<{
    file: Blob;
    zoom: number;
    x: number;
    y: number;
    size: number;
  }>,
) => {
  try {
    const { file, zoom, x, y, size } = e.data;
    const image = await createImageBitmap(file);
    try {
      if (image.width * image.height > 50000000)
        throw Error("Image dimensions are too large.");
      const side = Math.min(image.width, image.height) / zoom;
      const canvas = new OffscreenCanvas(
        Math.min(size, Math.floor(side)),
        Math.min(size, Math.floor(side)),
      );
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Canvas unavailable.");
      ctx.drawImage(
        image,
        (image.width - side) * x,
        (image.height - side) * y,
        side,
        side,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const blob = await canvas.convertToBlob({
        type: "image/webp",
        quality: 0.8,
      });
      if (blob.type !== "image/webp" || blob.size > 1048576)
        throw Error("Could not create a WebP under 1 MB.");
      self.postMessage(blob);
    } finally {
      image.close();
    }
  } catch (e) {
    self.postMessage((e as Error).message);
  }
};
