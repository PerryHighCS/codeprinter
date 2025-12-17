// PDF save functionality - lazy loaded
const MAX_IMAGE_WIDTH = 1600;
const MAX_IMAGE_HEIGHT = 1600;

export async function createPdfSaver() {
  const { jsPDF } = await import('jspdf');
  
  async function compressDataUrl(dataUrl, { maxWidth = MAX_IMAGE_WIDTH, maxHeight = MAX_IMAGE_HEIGHT, outputType = 'image/png' } = {}) {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const scale = Math.min(maxWidth / width, maxHeight / height);
            width = Math.floor(width * scale);
            height = Math.floor(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL(outputType));
        };
        img.onerror = () => {
          console.warn('Failed to load image for compression; rejection passed to caller');
          reject(new Error('Image load failed during compression'));
        };
        img.src = dataUrl;
      } catch (err) {
        console.warn('compressDataUrl encountered an unexpected error, rejecting', err);
        reject(err);
      }
    });
  }

  function encodeForPdf(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  return {
    jsPDF,
    compressDataUrl,
    encodeForPdf
  };
}
