(function initPortalImageUpload(root) {
  "use strict";

  const DIRECT_UPLOAD_MAX_BYTES = 900 * 1024;
  const FALLBACK_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
  const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
  const MAX_DIMENSION = 1600;
  const JPEG_QUALITY = 0.82;

  function fitWithin(width, height, maxDimension = MAX_DIMENSION) {
    const safeWidth = Math.max(1, Number(width) || 1);
    const safeHeight = Math.max(1, Number(height) || 1);
    const safeMax = Math.max(1, Number(maxDimension) || MAX_DIMENSION);
    const scale = Math.min(1, safeMax / Math.max(safeWidth, safeHeight));
    return {
      width: Math.max(1, Math.round(safeWidth * scale)),
      height: Math.max(1, Math.round(safeHeight * scale)),
    };
  }

  function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Kunne ikke lese bildet."));
      reader.readAsDataURL(blob);
    });
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Nettleseren kunne ikke åpne bildet for komprimering."));
      };
      image.src = objectUrl;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Kunne ikke komprimere bildet.")),
        "image/jpeg",
        JPEG_QUALITY
      );
    });
  }

  async function compressImage(file) {
    const image = await loadImage(file);
    const size = fitWithin(image.naturalWidth || image.width, image.naturalHeight || image.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Kunne ikke klargjøre bildet.");
    context.drawImage(image, 0, 0, size.width, size.height);
    return canvasToBlob(canvas);
  }

  async function prepare(file) {
    if (!file) throw new Error("Velg et bilde først.");
    if (file.size > MAX_SOURCE_BYTES) {
      throw new Error("Bildet er for stort. Velg et bilde under ca. 20 MB.");
    }

    if (file.size <= DIRECT_UPLOAD_MAX_BYTES) {
      return {
        imageData: await readAsDataUrl(file),
        compressed: false,
        originalBytes: file.size,
        uploadBytes: file.size,
      };
    }

    try {
      const compressedBlob = await compressImage(file);
      const useOriginal = file.size <= FALLBACK_UPLOAD_MAX_BYTES && compressedBlob.size >= file.size;
      const uploadBlob = useOriginal ? file : compressedBlob;
      return {
        imageData: await readAsDataUrl(uploadBlob),
        compressed: uploadBlob !== file,
        originalBytes: file.size,
        uploadBytes: uploadBlob.size,
      };
    } catch (error) {
      if (file.size <= FALLBACK_UPLOAD_MAX_BYTES) {
        return {
          imageData: await readAsDataUrl(file),
          compressed: false,
          originalBytes: file.size,
          uploadBytes: file.size,
        };
      }
      throw new Error("Bildet er for stort til direkte opplasting og kunne ikke komprimeres på telefonen. Prøv et mindre bilde.");
    }
  }

  const api = {
    prepare,
    fitWithin,
    MAX_DIMENSION,
    MAX_SOURCE_BYTES,
    FALLBACK_UPLOAD_MAX_BYTES,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SorgulenPortalImageUpload = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
