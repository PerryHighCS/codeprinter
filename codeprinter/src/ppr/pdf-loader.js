// PDF load functionality - lazy loaded
// Import worker URL statically so Vite can properly bundle it
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const IMAGE_LOAD_TIMEOUT_MS = 1500;
const IMAGE_TIMEOUT_ERROR_PREFIX = 'Timed out waiting for image object';
const PPR_METADATA_KEYWORD_PREFIX = 'PPRDATA:';
const IS_DEV_BUILD = Boolean(import.meta?.env?.DEV);

/**
 * @typedef {import('pdfjs-dist/types/src/display/api').PDFPageProxy} PDFPageProxy
 * @typedef {import('pdfjs-dist/types/src/display/api').PDFImage} PDFImage
 * @typedef {{page:number,totalPages:number}} PdfExtractionProgress
 * @typedef {(progress:PdfExtractionProgress)=>Promise<void>|void} PdfProgressHandler
 * @typedef {{name:string,page:number,order:number}} ImagePlacement
 * @typedef {{page:number,imageName?:string,reason:string}} SkippedImage
 * @typedef {{images:string[],imageNames:string[],imagePlacements:ImagePlacement[],skippedImages:SkippedImage[]}} ImageExtractionResult
 * @typedef {{onProgress?:PdfProgressHandler}} ImageExtractionOptions
 * @typedef {{decodeFromPdf:(b64:string)=>string|null,extractImagesFromPdf:(pdfArrayBuffer:ArrayBuffer, options?:ImageExtractionOptions)=>Promise<ImageExtractionResult>,readEmbeddedPprData:(pdfArrayBuffer:ArrayBuffer)=>Promise<string|null>}} PdfLoaderApi
 */

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
 * @param {PDFPageProxy} page
 * @param {string} imageName
 * @param {number} timeout
 * @returns {Promise<PDFImage>}
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

/**
 * Determines whether the provided error represents an image timeout.
 * @param {unknown} error
 * @returns {boolean}
 */
function isImageTimeoutError(error) {
  return (
    error instanceof Error &&
    typeof error.message === 'string' &&
    error.message.startsWith(IMAGE_TIMEOUT_ERROR_PREFIX)
  );
}

/**
 * Extracts the PPR metadata from the Keywords field if present.
 * @param {string | null | undefined} rawKeywords
 * @returns {string | null}
 */
function extractKeywordsPayload(rawKeywords) {
  if (typeof rawKeywords !== 'string') return null;
  const trimmed = rawKeywords.trim();
  if (!trimmed.startsWith(PPR_METADATA_KEYWORD_PREFIX)) return null;
  return trimmed.slice(PPR_METADATA_KEYWORD_PREFIX.length);
}

/**
 * Emits a warning when an image cannot be extracted.
 * @param {{page?:number,imageName?:string,reason?:string,stage?:string,attemptedRender?:boolean,allowRenderRetry?:boolean,timeout?:number}} details
 */
function logImageSkip(details) {
  console.warn('Skipping image during extraction:', details);
}

/**
 * Attempts to load an image object, with an optional retry after rendering if the first attempt times out.
 * @param {PDFPageProxy} page
 * @param {string} imageName
 * @param {() => Promise<void>} renderPageIfNeeded
 * @param {{allowRenderRetry?:boolean,timeout?:number}} [options]
 * @returns {Promise<PDFImage>}
 */
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

/**
 * Dynamically loads pdf.js and returns helpers for decoding embedded data and extracting images.
 * @returns {Promise<PdfLoaderApi>}
 */
export async function createPdfLoader() {
  const pdfjsLib = await import('pdfjs-dist');
  
  // Initialize worker from pdfjs-dist package
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  /**
   * Decodes Base64 text that was embedded in the PDF metadata.
   * @param {string} b64
   * @returns {string|null}
   */
  function decodeFromPdf(b64) {
    try {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (error) {
      console.warn('Failed to decode embedded PPR data', error);
      return null;
    }
  }

  /**
   * Extracts all raster images from the supplied PDF ArrayBuffer.
   * @param {ArrayBuffer} pdfArrayBuffer
   * @param {ImageExtractionOptions} [options]
   * @returns {Promise<ImageExtractionResult>}
   */
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

  /**
   * Reads the embedded PPR metadata payload from a PDF.
   * @param {ArrayBuffer} pdfArrayBuffer
   * @returns {Promise<string|null>}
   */
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
      const decoded = decodeFromPdf(embeddedValue);
      return typeof decoded === 'string' ? decoded : null;
    } finally {
      if (pdf && typeof pdf.destroy === 'function') {
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

/**
 * Reconstructs segment/image assignments using metadata + extracted assets.
 * @param {{
 *  metadata: {studentName?:string,segments?:Record<string,number>,imageManifest?:Array<{alias:string,segment:number}>,imagePlacements?:Array<{alias:string,page:number,order:number}>},
 *  extractedImages: string[],
 *  extractedPlacements?: Array<{page:number,order:number,index:number}>,
 *  skippedImages?: Array<{page:number,imageName?:string,reason:string}>,
 *  segmentCount?: number
 * }} params
 * @returns {{
 *  workspaceData:{studentName:string,images:Record<number,string[]>},
 *  notices:string[],
 *  missingImages:Array<{segment:number,expected:number,received:number}>,
 *  segmentsWithMissingImages:number[],
 *  leftoverImagesCount:number
 * }}
 */
export function reconstructPprDataFromPdf({
  metadata,
  extractedImages,
  extractedPlacements = [],
  skippedImages = [],
  segmentCount = 4
}) {
  if (!metadata) {
    throw new Error('Metadata is required to reconstruct PPR data');
  }
  const segments = metadata.segments || {};
  const expectedImageTotal = Object.values(segments).reduce((sum, count) => {
    const numeric = typeof count === 'number' ? count : parseInt(count, 10);
    return sum + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);
  const manifestOrder =
    Array.isArray(metadata.imageManifest) &&
    metadata.imageManifest.length === expectedImageTotal
      ? metadata.imageManifest
      : null;

  const fallbackOrder = [];
  for (let segment = 1; segment <= segmentCount; segment++) {
    const count = Number(segments[segment]) || 0;
    for (let i = 0; i < count; i++) {
      fallbackOrder.push({ alias: `seg${segment}-img${i + 1}`, segment });
    }
  }
  const reconstructionOrder = manifestOrder && manifestOrder.length ? manifestOrder : fallbackOrder;
  const aliasMeta = new Map();
  reconstructionOrder.forEach(({ alias, segment }) => {
    aliasMeta.set(alias, { segment });
  });
  const hasPlacementMetadata =
    Array.isArray(metadata.imagePlacements) && metadata.imagePlacements.length > 0;
  if (hasPlacementMetadata) {
    metadata.imagePlacements.forEach(({ alias, page, order }) => {
      aliasMeta.set(alias, { ...aliasMeta.get(alias), page, order });
    });
  }

  const reconstructedData = { studentName: metadata.studentName || '', images: {} };
  const allIndices = new Set(extractedImages.map((_, index) => index));
  const buckets = new Map();
  if (hasPlacementMetadata) {
    extractedPlacements.forEach(({ page, order, index }) => {
      if (!Number.isInteger(index)) return;
      const key = `${page}:${order}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(index);
    });
  }
  const missingImages = [];
  const claimFromBucket = (bucketKey) => {
    const bucket = buckets.get(bucketKey);
    if (!bucket || !bucket.length) return null;
    const idx = bucket.shift();
    allIndices.delete(idx);
    return idx;
  };
  const claimNextUnused = () => {
    const iter = allIndices.values().next();
    if (!iter.done) {
      allIndices.delete(iter.value);
      return iter.value;
    }
    return null;
  };

  let usedFallbackAssignment = false;
  reconstructionOrder.forEach(({ alias, segment }) => {
    if (!reconstructedData.images[segment]) {
      reconstructedData.images[segment] = [];
    }
    const targetInfo = aliasMeta.get(alias);
    let idx = null;
    if (targetInfo?.page && targetInfo?.order) {
      idx = claimFromBucket(`${targetInfo.page}:${targetInfo.order}`);
    }
    if (idx === null) {
      idx = claimNextUnused();
      if (idx !== null) usedFallbackAssignment = true;
    }
    if (idx !== null && typeof extractedImages[idx] === 'string') {
      reconstructedData.images[segment].push(extractedImages[idx]);
    }
  });

  for (let segment = 1; segment <= segmentCount; segment++) {
    const expected = Number(segments[segment]) || 0;
    if (!reconstructedData.images[segment]) {
      reconstructedData.images[segment] = [];
    }
    const received = reconstructedData.images[segment].length;
    if (received < expected) {
      missingImages.push({ segment, expected, received });
    }
  }

  const leftoverImagesCount = allIndices.size;
  const notices = [];
  const segmentsWithMissingImages = [];
  if (missingImages.length) {
    const missingSummary = missingImages
      .map(({ segment, expected, received }) => `Segment ${segment} (${expected - received} missing)`)
      .join('; ');
    notices.push(`Some images could not be recovered: ${missingSummary}. Please re-add them manually.`);
    segmentsWithMissingImages.push(...missingImages.map(({ segment }) => segment));
  }
  if (hasPlacementMetadata && usedFallbackAssignment) {
    notices.push('Extra images were found in the PDF metadata that could not be matched exactly. They were assigned based on remaining space; please verify each segment.');
  }
  if (skippedImages.length) {
    notices.push(`${skippedImages.length} image(s) could not be decoded from the PDF in time. Highlighted segments may be incomplete.`);
  }
  if (leftoverImagesCount > 0) {
    notices.push(`${leftoverImagesCount} unreferenced image(s) were ignored during reconstruction.`);
  }
  if (notices.length) {
    console.warn('Image reconstruction mismatch:', {
      expectedImageTotal,
      extractedImages: extractedImages.length,
      missingImagesBySegment: missingImages,
      leftoverImages: leftoverImagesCount,
      skippedImages
    });
  }

  return {
    workspaceData: reconstructedData,
    notices,
    missingImages,
    segmentsWithMissingImages: [...new Set(segmentsWithMissingImages)],
    leftoverImagesCount
  };
}
