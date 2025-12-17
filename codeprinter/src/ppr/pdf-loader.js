// PDF load functionality - lazy loaded
// Import worker URL statically so Vite can properly bundle it
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const IMAGE_LOAD_TIMEOUT_MS = 1500;
const IS_DEV_BUILD = Boolean(import.meta?.env?.DEV);

/**
 * Safe console logger that only emits during development builds.
 * Falls back gracefully if the bundler does not define import.meta.env.DEV.
 * @param {...unknown} args
 */
function logDebug(...args) {
  if (IS_DEV_BUILD) console.log(...args);
}

export async function createPdfLoader() {
  const pdfjsLib = await import('pdfjs-dist');
  
  // Initialize worker from pdfjs-dist package
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  function decodeFromPdf(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function extractImagesFromPdf(pdfArrayBuffer, { onProgress } = {}) {
    logDebug('Starting image extraction from PDF...');
    const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
    logDebug('PDF loaded, pages:', pdf.numPages);
    const images = [];
    const skippedImages = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      if (onProgress) await onProgress({ page: pageNum, totalPages: pdf.numPages });
      const page = await pdf.getPage(pageNum);
      let pageRendered = false;

      const renderPageIfNeeded = async () => {
        if (pageRendered) return;
        const viewport = page.getViewport({ scale: 1.0 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        pageRendered = true;
      };
      
      // Now get the operator list
      const operatorList = await page.getOperatorList();
      logDebug(`Page ${pageNum}: ${operatorList.fnArray.length} operators`);

      // Extract image objects
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i];
        
        // Check if this is an image paint operation
        if (op === pdfjsLib.OPS.paintImageXObject) {
          try {
            const imageName = operatorList.argsArray[i][0];
            logDebug(`Found image operator: ${imageName}`);
            
            // Wait for the object to be available (pdf.js supports callbacks on get)
            const waitForImageObject = () => {
              let timeoutId;

              const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(
                  () => reject(new Error(`Timed out waiting for image object ${imageName}`)),
                  IMAGE_LOAD_TIMEOUT_MS
                );
              });

              const objectPromise = new Promise((resolve) => {
                const onObjectReady = (obj) => resolve(obj);
                const immediate = page.objs.get(imageName, onObjectReady);
                if (immediate) {
                  onObjectReady(immediate);
                }
              }).finally(() => clearTimeout(timeoutId));

              return Promise.race([objectPromise, timeoutPromise]);
            };

            let imgData;
            try {
              imgData = await waitForImageObject();
            } catch (timeoutError) {
              if (!pageRendered) {
                try {
                  await renderPageIfNeeded();
                  imgData = await waitForImageObject();
                } catch (renderRetryError) {
                  skippedImages.push({
                    page: pageNum,
                    imageName,
                    reason: renderRetryError?.message || 'Timed out waiting for image data after rendering'
                  });
                  continue;
                }
              } else {
                skippedImages.push({
                  page: pageNum,
                  imageName,
                  reason: timeoutError?.message || 'Timed out waiting for image data'
                });
                continue;
              }
            }
            
            logDebug(`Image ${imageName}:`, imgData);
            
            if (imgData && imgData.width && imgData.height) {
              // Create canvas to draw the image
              const imgCanvas = document.createElement('canvas');
              imgCanvas.width = imgData.width;
              imgCanvas.height = imgData.height;
              const imgCtx = imgCanvas.getContext('2d');
              
              // Try to render the image data
              if (imgData.data) {
                const imageData = imgCtx.createImageData(imgData.width, imgData.height);
                imageData.data.set(imgData.data);
                imgCtx.putImageData(imageData, 0, 0);
                images.push(imgCanvas.toDataURL('image/png'));
                logDebug(`Extracted image ${images.length}`);
              } else if (imgData.bitmap) {
                // Some images might be bitmaps
                imgCtx.drawImage(imgData.bitmap, 0, 0);
                images.push(imgCanvas.toDataURL('image/png'));
                logDebug(`Extracted bitmap image ${images.length}`);
              }
            }
          } catch (e) {
            console.warn('Failed to extract image:', e);
          }
        }
      }
    }

    logDebug(`Image extraction complete. Total images extracted: ${images.length}. Skipped: ${skippedImages.length}`);
    return { images, skippedImages };
  }

  async function readEmbeddedPprData(pdfArrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
    try {
      const metadata = await pdf.getMetadata().catch(() => null);
      const keywords =
        (metadata?.info && typeof metadata.info.Keywords === 'string' && metadata.info.Keywords) ||
        (metadata?.metadata && typeof metadata.metadata.get === 'function' ? metadata.metadata.get('Keywords') : null);
      if (!keywords || typeof keywords !== 'string') return null;
      const match = keywords.match(/PPRDATA:([A-Za-z0-9+/=]+)/);
      if (!match) return null;
      return decodeFromPdf(match[1]);
    } finally {
      if (typeof pdf.destroy === 'function') {
        pdf.destroy();
      }
    }
  }

  return {
    decodeFromPdf,
    extractImagesFromPdf,
    readEmbeddedPprData
  };
}
