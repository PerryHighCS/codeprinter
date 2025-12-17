// PDF load functionality - lazy loaded
// Import worker URL statically so Vite can properly bundle it
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const IMAGE_LOAD_TIMEOUT_MS = 1500;
const IMAGE_TIMEOUT_ERROR_PREFIX = 'Timed out waiting for image object';
const PPR_METADATA_KEYWORD_PREFIX = 'PPRDATA:';
const IS_DEV_BUILD = Boolean(import.meta?.env?.DEV);

/**
 * Safe console logger that only emits during development builds.
 * Falls back gracefully if the bundler does not define import.meta.env.DEV.
 * @param {...unknown} args
 */
function logDebug(...args) {
  if (IS_DEV_BUILD) console.log(...args);
}

/**
 * Waits for a PDF image object to be ready, rejecting if it exceeds the timeout.
 * @param {Object} page - PDF.js page object
 * @param {string} imageName - Name of the image object to wait for
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Object>} - Resolves with the image object
 */
async function waitForPdfImageObject(page, imageName, timeout = IMAGE_LOAD_TIMEOUT_MS) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Timed out waiting for image object ${imageName}`)),
      timeout
    );
  });

  const objectPromise = new Promise((resolve) => {
    let resolved = false;
    const onObjectReady = (obj) => {
      if (resolved) return;
      resolved = true;
      resolve(obj);
    };
    const immediate = page.objs.get(imageName, onObjectReady);
    if (immediate) onObjectReady(immediate);
  });

  return Promise.race([objectPromise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function isImageTimeoutError(error) {
  return (
    error instanceof Error &&
    typeof error.message === 'string' &&
    error.message.startsWith(IMAGE_TIMEOUT_ERROR_PREFIX)
  );
}

function extractKeywordsPayload(rawKeywords) {
  if (typeof rawKeywords !== 'string') return null;
  const trimmed = rawKeywords.trim();
  if (!trimmed.startsWith(PPR_METADATA_KEYWORD_PREFIX)) return null;
  return trimmed.slice(PPR_METADATA_KEYWORD_PREFIX.length);
}

function logImageSkip(details) {
  console.warn('Skipping image during extraction:', details);
}

// Attempts to load an image object, with an optional retry after rendering if the first attempt times out.
async function loadPdfImageWithRenderRetry(page, imageName, renderPageIfNeeded, options = {}) {
  const { allowRenderRetry = true, timeout = IMAGE_LOAD_TIMEOUT_MS } = options;
  let attemptedRender = false;

  while (true) {
    try {
      return await waitForPdfImageObject(page, imageName, timeout);
    } catch (error) {
      if (!isImageTimeoutError(error)) throw error;

      const canRetryWithRender = allowRenderRetry && !attemptedRender;
      if (!canRetryWithRender) {
        const message = attemptedRender
          ? 'Timed out waiting for image data after rendering'
          : 'Timed out waiting for image data';
        logImageSkip({
          stage: 'final-timeout',
          imageName,
          attemptedRender,
          allowRenderRetry,
          timeout
        });
        throw new Error(message);
      }

      logDebug(`Image ${imageName} timed out, rendering page and retrying...`);
      await renderPageIfNeeded();
      attemptedRender = true;
    }
  }
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
    const imageNames = [];
    const imagePlacements = [];
    const pageImageCounts = new Map();
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
      logDebug(
        `Page ${pageNum}: ${operatorList.fnArray.length} operators (images? ${operatorList.fnArray.filter(
          op => op === pdfjsLib.OPS.paintImageXObject || op === pdfjsLib.OPS.paintInlineImageXObject
        ).length})`
      );

      // Extract image objects
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i];
        const args = operatorList.argsArray[i];
        const isImageXObject = op === pdfjsLib.OPS.paintImageXObject;
        const isInlineImage = op === pdfjsLib.OPS.paintInlineImageXObject;
        
        if (!isImageXObject && !isInlineImage) continue;

        try {
          let imgData;
          let imageName = null;

          if (isImageXObject) {
            imageName = args?.[0];
            logDebug(`Found xobject image operator: ${imageName}`);
            try {
              imgData = await loadPdfImageWithRenderRetry(page, imageName, renderPageIfNeeded, {
                allowRenderRetry: !pageRendered
              });
            } catch (timeoutError) {
              const skipInfo = {
                page: pageNum,
                imageName,
                reason: timeoutError?.message || 'Timed out waiting for image data'
              };
              skippedImages.push(skipInfo);
              logImageSkip(skipInfo);
              continue;
            }
          } else {
            imgData = args?.[0];
            imageName = `inline-${pageNum}-${i}`;
            logDebug(`Found inline image operator: ${imageName}`);
          }

          if (!imgData || !imgData.width || !imgData.height) {
            const skipInfo = {
              page: pageNum,
              imageName,
              reason: 'Missing image dimensions'
            };
            skippedImages.push(skipInfo);
            logImageSkip(skipInfo);
            continue;
          }

          const imgCanvas = document.createElement('canvas');
          imgCanvas.width = imgData.width;
          imgCanvas.height = imgData.height;
          const imgCtx = imgCanvas.getContext('2d');

          const targetArray = () => {
            if (imgData.data) {
              const imageData = imgCtx.createImageData(imgData.width, imgData.height);
              imageData.data.set(imgData.data);
              imgCtx.putImageData(imageData, 0, 0);
              return imgCanvas.toDataURL('image/png');
            }
            if (imgData.bitmap) {
              imgCtx.drawImage(imgData.bitmap, 0, 0);
              return imgCanvas.toDataURL('image/png');
            }
            return null;
          };
          const dataUrl = targetArray();
          if (dataUrl) {
            images.push(dataUrl);
            imageNames.push(imageName);
            const orderOnPage = (pageImageCounts.get(pageNum) || 0) + 1;
            pageImageCounts.set(pageNum, orderOnPage);
            imagePlacements.push({
              name: imageName,
              page: pageNum,
              order: orderOnPage
            });
            logDebug(`Extracted image ${images.length}`);
          } else {
            const skipInfo = {
              page: pageNum,
              imageName,
              reason: 'Unsupported image payload'
            };
            skippedImages.push(skipInfo);
            logImageSkip(skipInfo);
          }
        } catch (e) {
          console.warn('Failed to extract image:', e);
        }
      }
    }

    logDebug(`Image extraction complete. Total images extracted: ${images.length}. Skipped: ${skippedImages.length}`);
    return { images, imageNames, imagePlacements, skippedImages };
  }

  async function readEmbeddedPprData(pdfArrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
    try {
      const metadata = await pdf.getMetadata().catch(() => null);
      const infoSection = metadata?.info;
      const xmpSection = metadata?.metadata;
      const keywordsRaw =
        (infoSection && typeof infoSection.Keywords === 'string' && infoSection.Keywords) ||
        (infoSection && typeof infoSection.keywords === 'string' && infoSection.keywords) ||
        null;
      const keywordPayload = extractKeywordsPayload(keywordsRaw);
      const embeddedValue =
        (infoSection && typeof infoSection.PprData === 'string' && infoSection.PprData) ||
        (xmpSection && typeof xmpSection.get === 'function' ? xmpSection.get('PprData') : null) ||
        keywordPayload;
      if (!embeddedValue || typeof embeddedValue !== 'string') return null;
      return decodeFromPdf(embeddedValue);
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
