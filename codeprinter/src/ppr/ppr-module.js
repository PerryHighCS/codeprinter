let isModified = false;

const UI_UPDATE_DELAY = 50;
const MIN_RENDERED_IMAGE_SIZE = 10; // Minimum width/height in pixels to render in PDF
const PDF_HEADER_FONT_SIZE = 16;
const PDF_CONTENT_FONT_SIZE = 12;
const PDF_METADATA_KEYWORD_PREFIX = 'PPRDATA:';

import {
  SEGMENT_COUNT,
  segmentImages,
  imageCompressionState,
  imageProcessingErrors,
  imageDimensions,
  getCachedImageDimensions,
  storeImageDimensions,
  setImageProcessingError as setImageProcessingErrorState
} from './ppr-state.js';
import {
  showToast,
  showProgressToast,
  setProgressToastMessage,
  hideProgressToast,
  updateImageErrorStyles,
  scrollToImageError,
  clearSegmentLoadWarnings,
  flagSegmentLoadWarning,
  focusSegmentLoadWarning,
  renderImages,
  updateImageCount
} from './ppr-ui.js';

/** labels for each section of the Practice PPR. These labels are dictated by the actual PPR. */
const SEGMENT_LABEL_LINES = {
  1: ['Procedure', 'i.'],
  2: ['ii.'],
  3: ['List', 'i.'],
  4: ['ii.']
};


/**
 * Loads an Image element to determine the intrinsic size of a data URL.
 * @param {string} dataUrl
 * @returns {Promise<{width:number,height:number}>}
 */
function measureImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not load image data'));
    img.src = dataUrl;
  });
}

/**
 * Starts asynchronous caching of an image's dimensions (without blocking callers).
 * @param {number} segmentNum
 * @param {number} index
 * @param {string} dataUrl
 */
function primeImageDimensions(segmentNum, index, dataUrl) {
  if (!dataUrl) return Promise.resolve();
  if (getCachedImageDimensions(segmentNum, index)) return Promise.resolve();
  return measureImageDimensions(dataUrl)
    .then(dimensions => storeImageDimensions(segmentNum, index, dimensions))
    .catch(err => console.warn(`Failed to cache dimensions for segment ${segmentNum} image ${index + 1}`, err));
}

async function ensureAllImageDimensions(compressedImages) {
  const tasks = [];
  for (let segment = 1; segment <= SEGMENT_COUNT; segment++) {
    const imgs = compressedImages[segment] || [];
    imgs.forEach((dataUrl, index) => {
      if (!getCachedImageDimensions(segment, index)) {
        tasks.push(
          measureImageDimensions(dataUrl)
            .then(dimensions => storeImageDimensions(segment, index, dimensions))
            .catch(err => console.warn(`Failed to preload dimensions for segment ${segment} image ${index + 1}`, err))
        );
      }
    });
  }
  if (tasks.length) {
    await Promise.all(tasks);
  }
}

/**
 * Entry point exposed to the rest of the app to initialize the PPR module.
 */
export function initPPR() {
  setupPPR();
}

/**
 * Compresses any newly added images per segment while preserving which ones were previously compressed.
 * Returns a map of segment numbers to their compressed data URLs ready for PDF embedding.
 * @param {(dataUrl: string, options: object) => Promise<string>} compressDataUrlFn
 * @returns {Promise<Record<number, string[]>>}
 */
async function compressImagesAndBuildPayload(compressDataUrlFn, { onProgress } = {}) {
  if (typeof compressDataUrlFn !== 'function') {
    throw new Error('compressDataUrl function required to build payload');
  }

  const compressedImages = {};
  const compressionFailures = [];
  const totalImages = Object.values(segmentImages).reduce((sum, imgs) => sum + (imgs?.length || 0), 0);
  let processed = 0;
  for (let segment = 1; segment <= SEGMENT_COUNT; segment++) {
    const imgs = segmentImages[segment] || [];
    compressedImages[segment] = [];
    for (let idx = 0; idx < imgs.length; idx++) {
      const dataUrl = imgs[idx];
      const isPreCompressed = imageCompressionState[segment][idx];
      try {
        let result;
        if (isPreCompressed) {
          result = dataUrl;
        } else {
          result = await compressDataUrlFn(dataUrl, {
            maxWidth: 1600,
            maxHeight: 1600,
            outputType: 'image/png',
          });
        }
        compressedImages[segment].push(result);
        if (imageProcessingErrors[segment][idx]) {
          setImageProcessingError(segment, idx, false);
        }
        processed += 1;
        if (totalImages && typeof onProgress === 'function') {
          await onProgress({ processed, total: totalImages });
        }
      } catch (err) {
        console.warn('Failed to process image, skipping', err);
        setImageProcessingError(segment, idx, true);
        compressionFailures.push({ segment, index: idx, error: err });
      }
    }
  }
  return { images: compressedImages, failures: compressionFailures };
}

/**
 * Builds the metadata payload that gets embedded into the PDF keywords so the loader
 * knows which student saved the file, which segments contain how many images, and when it was last saved.
 * @param {Record<number, string[]>} compressedImages
 * @param {string} studentName
 * @param {string} timestamp
 * @returns {{payload:{studentName: string, segments: Record<string, number>, timestamp: string, imageManifest: Array<{alias:string,segment:number}>}, aliasMap: Record<number,string[]>}}
 */
function buildPdfPayload(compressedImages, studentName, timestamp) {
  const imageManifest = [];
  const aliasMap = {};
  for (let segment = 1; segment <= SEGMENT_COUNT; segment++) {
    const count = compressedImages[segment]?.length || 0;
    aliasMap[segment] = [];
    for (let i = 0; i < count; i++) {
      const alias = `seg${segment}-img${i + 1}`;
      aliasMap[segment].push(alias);
      imageManifest.push({ alias, segment });
    }
  }

  return {
    payload: {
      studentName,
      segments: Object.keys(compressedImages).reduce((acc, seg) => {
        acc[seg] = compressedImages[seg].length;
        return acc;
      }, {}),
      timestamp,
      imageManifest
    },
    aliasMap
  };
}

/**
 * Embeds metadata payload inside the PDF keywords so it can be losslessly extracted later without duplicating image data.
 * @param {import('jspdf').jsPDF} doc
 * @param {{studentName: string, segments: Record<string, number>, timestamp: string}} payload
 * @param {(text: string) => string} encodeForPdf
 * @param {string} studentName
 */
function embedPayloadMetadata(doc, payload, encodeForPdf, studentName) {
  const jsonString = JSON.stringify(payload);
  const embedded = encodeForPdf(jsonString);
  const keywords = `${PDF_METADATA_KEYWORD_PREFIX}${embedded}`;

  doc.setProperties({
    title: 'Practice Personalized Project Reference',
    subject: 'Practice AP CSP Create Task Personalized Project Reference',
    author: studentName || '',
    keywords
  });
}

/**
 * PDF layout geometry defined in PDF points (1/72") for clarity.
 */
const PDF_LAYOUT = Object.freeze({
  marginPt: 40,
  contentStartYPt: 90,
  headerNameYPt: 40,
  headerTitleYPt: 60,
  textLineHeightPt: 16,
  imageGapPt: 14,
  segmentGapPt: 10,
  nameLabelGapPt: 6,
  nameUnderlineOffsetPt: 3,
  nameUnderlineWidthPt: 0.5,
});

/**
 * Renders all compressed images into the PDF, ensuring the label text and images sit together by
 * segment and flowing across pages as required.
 * @param {import('jspdf').jsPDF} doc
 * @param {Record<number, string[]>} compressedImages
 * @param {Array<{segment:number,index:number,reason:string}>} [skippedImages]
 * @param {{onProgress?:(args:{embedded:number,total:number})=>Promise<void>}} [options]
 * @param {Record<number,string[]>} [imageAliases]
 */
async function renderSegmentImages(
  doc,
  compressedImages,
  skippedImages = [],
  { onProgress } = {},
  imageAliases = {},
  imagePlacements = []
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = PDF_LAYOUT.marginPt;

  await ensureAllImageDimensions(compressedImages);

  let y = PDF_LAYOUT.contentStartYPt;
  const maxW = pageWidth - margin * 2;
  const maxH = pageHeight - margin * 2;
  const pageImageCount = new Map();
  const resolvePageNumber = () => {
    if (typeof doc.internal.getCurrentPageInfo === 'function') {
      return doc.internal.getCurrentPageInfo().pageNumber || 1;
    }
    if (doc.internal.pages && doc.internal.pages.length > 0) {
      return doc.internal.pages.length - 1;
    }
    return 1;
  };
  let currentPageNumber = resolvePageNumber();

  const recordSkip = (segmentNum, imageIndex, reason) => {
    if (!Array.isArray(skippedImages)) return;
    skippedImages.push({ segment: segmentNum, index: imageIndex, reason });
  };

  const recordPlacement = (segment, alias) => {
    const count = (pageImageCount.get(currentPageNumber) || 0) + 1;
    pageImageCount.set(currentPageNumber, count);
    if (alias && Array.isArray(imagePlacements)) {
      imagePlacements.push({
        alias,
        segment,
        page: currentPageNumber,
        order: count
      });
    }
  };

  let embeddedCount = 0;
  const totalToEmbed = Object.values(compressedImages).reduce((sum, imgs) => sum + (imgs?.length || 0), 0);

  for (let segment = 1; segment <= SEGMENT_COUNT; segment++) {
    const imgs = compressedImages[segment] || [];
    if (!imgs.length) continue;
    const segLines = SEGMENT_LABEL_LINES[segment] || [];

    // For first image in segment, check if we need a new page
    let isFirstImageInSegment = true;

    for (let imgIdx = 0; imgIdx < imgs.length; imgIdx++) {
      const compressed = imgs[imgIdx];

      try {
        let props = getCachedImageDimensions(segment, imgIdx);
        if (!props) {
          try {
            const docProps = doc.getImageProperties(compressed);
            props = { width: docProps.width, height: docProps.height };
            storeImageDimensions(segment, imgIdx, props);
          } catch (err) {
            // Try to get dimensions from image by loading it
            try {
              props = await measureImageDimensions(compressed);
              storeImageDimensions(segment, imgIdx, props);
            } catch {
              console.warn(`Could not determine dimensions for image ${imgIdx + 1} in segment ${segment}. Skipping this image.`);
              recordSkip(segment, imgIdx, 'dimensions');
              continue;
            }
          }
        }

        let scale = Math.min(maxW / props.width, maxH / props.height, 1);
        let w = props.width * scale;
        let h = props.height * scale;

      if (shouldSkipForSize(props, w, h, maxW, maxH)) {
        const reason = getSkipReasonForSize({
          isFirstImageInSegment,
          pageHeight,
          margin,
          segLines,
          index: imgIdx,
          segment,
          renderedWidth: w,
          renderedHeight: h
        });
        showToast(reason.message, true);
        recordSkip(segment, imgIdx, reason.code);
        continue;
      }

      // For first image in segment, ensure text and image fit on same page
      if (isFirstImageInSegment) {
          // Calculate height needed for multiline text
          const textLines = segLines;
          const textHeight = textLines.length * PDF_LAYOUT.textLineHeightPt;
          const spaceAvailable = pageHeight - margin - y;

          if (h + textHeight > spaceAvailable) {
            // Move to new page
            doc.addPage();
            currentPageNumber = resolvePageNumber();
            y = margin;
            const maxImageHeight = pageHeight - margin * 2 - textHeight;
            scale = Math.min(maxW / props.width, maxImageHeight / props.height, 1);
            w = props.width * scale;
            h = props.height * scale;
          }
          // Add segment text right before first image (handle multiline)
          for (const line of textLines) {
            doc.text(line, margin, y);
            y += PDF_LAYOUT.textLineHeightPt;
          }
          isFirstImageInSegment = false;
      } else {
        // For subsequent images, add page break if needed
          if (y + h > pageHeight - margin) {
            doc.addPage();
            currentPageNumber = resolvePageNumber();
          y = margin;
          // Handle multiline continuation text; guard against empty labels
          const lastLine = segLines[segLines.length - 1];
          const baseLabel = typeof lastLine === 'string' ? lastLine.trim() : '';
          if (baseLabel) {
              const contText = `${baseLabel} (cont.)`;
              doc.text(contText, margin, y);
              y += PDF_LAYOUT.textLineHeightPt;
            }
          }
      }

        const aliasList = imageAliases?.[segment];
        const imageAlias = Array.isArray(aliasList) ? aliasList[imgIdx] : undefined;
        recordPlacement(segment, imageAlias);
        doc.addImage(compressed, 'PNG', margin, y, w, h, imageAlias, 'FAST');
        embeddedCount += 1;
        if (typeof onProgress === 'function') {
          await onProgress({ embedded: embeddedCount, total: totalToEmbed });
        }
        y += h + PDF_LAYOUT.imageGapPt;
      } catch (err) {
        console.error('Image add error', err);
        recordSkip(segment, imgIdx, 'renderError');
      }
    }

    // Add spacing between segments, but don't create a new page if this is the last segment
    y += PDF_LAYOUT.segmentGapPt;
  }
}

/**
 * Flags or clears an error for a particular image and syncs the UI.
 * @param {number} segmentNum
 * @param {number} index
 * @param {boolean} hasError
 */
function setImageProcessingError(segmentNum, index, hasError) {
  setImageProcessingErrorState(segmentNum, index, hasError);
  updateImageErrorStyles(segmentNum);
}

/**
 * Adds a single image to a segment during interactive editing and refreshes UI state.
 * (The export flow later re-processes everything through compressImagesAndBuildPayload.)
 * @param {string} dataUrl
 * @param {number} segmentNum
 */
function addImage(dataUrl, segmentNum) {
  segmentImages[segmentNum].push(dataUrl);
  const imageIndex = segmentImages[segmentNum].length - 1;
  imageCompressionState[segmentNum].push(false);
  flagSegmentLoadWarning(segmentNum, false);
  imageProcessingErrors[segmentNum].push(false);
  imageDimensions[segmentNum].push(null);
  primeImageDimensions(segmentNum, imageIndex, dataUrl);
  renderImages(segmentNum);
  updateImageCount(segmentNum);
  isModified = true;
}

/**
 * Removes an image at a segment index and refreshes UI state.
 * @param {number} index
 * @param {number} segmentNum
 */
function removeImage(index, segmentNum) {
  segmentImages[segmentNum].splice(index, 1);
  imageCompressionState[segmentNum].splice(index, 1);
  flagSegmentLoadWarning(segmentNum, false);
  imageProcessingErrors[segmentNum].splice(index, 1);
  imageDimensions[segmentNum].splice(index, 1);
  renderImages(segmentNum);
  updateImageCount(segmentNum);
  isModified = true;
}

/**
 * Handles delegated clicks within a segment's image container (e.g. remove buttons).
 * @param {MouseEvent} event
 */
function handleSegmentImagesClick(event) {
  const removeButton = event.target.closest('.remove-button');
  if (!removeButton) return;

  const imageWrapper = removeButton.closest('.image-wrapper');
  const container = removeButton.closest('.images-container');
  if (!imageWrapper || !container) return;

  event.stopPropagation();

  const segmentNum = Number(container.dataset.segment);
  const index = Number(imageWrapper.dataset.imageIndex);
  if (!Number.isInteger(segmentNum) || !Number.isInteger(index)) return;

  removeImage(index, segmentNum);
}

function shouldSkipForSize(original, renderedWidth, renderedHeight, maxWidth, maxHeight) {
  const minWidth = Math.min(MIN_RENDERED_IMAGE_SIZE, maxWidth * 0.05);
  const minHeight = Math.min(MIN_RENDERED_IMAGE_SIZE, maxHeight * 0.05);

  if (renderedWidth < minWidth || renderedHeight < minHeight) {
    if (original.width < minWidth && original.height < minHeight) return true;
    if (renderedWidth < minWidth / 2 || renderedHeight < minHeight / 2) return true;
  }
  return false;
}

function getSkipReasonForSize({ isFirstImageInSegment, pageHeight, margin, segLines, index, segment, renderedWidth, renderedHeight }) {
  const lacksLabelSpace = (pageHeight - margin * 2 - (segLines.length * PDF_LAYOUT.textLineHeightPt)) <= 0;
  const reasonCode = !isFirstImageInSegment ? 'tooSmall' : lacksLabelSpace ? 'noSpaceAfterLabels' : 'tooSmall';
  const message = reasonCode === 'noSpaceAfterLabels'
    ? `Segment ${segment} labels leave no room for image ${index + 1}.`
    : `Image ${index + 1} in segment ${segment} is too small after scaling (${renderedWidth.toFixed(0)}x${renderedHeight.toFixed(0)}px).`;
  return { code: reasonCode, message };
}

/**
 * Hydrates UI + state from previously saved work.
 * @param {{studentName?: string, images?: Record<number, string[]>}} data
 */
function applyLoadedData(data) {
  if (!data) return;
  clearSegmentLoadWarnings();
  const dimensionPromises = [];

  if (data.studentName) {
    document.getElementById('student-name').value = data.studentName;
  }

  if (data.images) {
    for (let segmentKey in data.images) {
      const segmentNum = parseInt(segmentKey, 10);
      if (!Number.isInteger(segmentNum)) continue;
      segmentImages[segmentNum] = data.images[segmentKey];
      imageCompressionState[segmentNum] = new Array(segmentImages[segmentNum].length).fill(true);
      imageProcessingErrors[segmentNum] = new Array(segmentImages[segmentNum].length).fill(false);
      imageDimensions[segmentNum] = new Array(segmentImages[segmentNum].length).fill(null);
      segmentImages[segmentNum].forEach((dataUrl, index) => {
        const promise = primeImageDimensions(segmentNum, index, dataUrl);
        if (promise && typeof promise.then === 'function') {
          dimensionPromises.push(promise);
        }
      });
      renderImages(segmentNum);
      updateImageCount(segmentNum);
    }
  }

  if (dimensionPromises.length) {
    Promise.all(dimensionPromises).catch(err =>
      console.warn('Failed to preload some image dimensions after loading data', err)
    );
  }
  isModified = false;
}

/**
 * Parses PPR metadata JSON string safely, validating structure.
 * @param {string} jsonString
 * @returns {{studentName: string, images?: Record<number, string[]>, segments?: Record<number, number>, timestamp?: string, imageManifest?: Array<{alias:string,segment:number}>}|null}
 */
function parsePprJson(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') {
      throw new Error('Parsed data is not an object');
    }
    if (data.images && (typeof data.images !== 'object' || Array.isArray(data.images))) {
      throw new Error('Images payload malformed');
    }
    if (data.segments && (typeof data.segments !== 'object' || Array.isArray(data.segments))) {
      throw new Error('Segments payload malformed');
    }

    const safeImages = {};
    if (data.images) {
      for (let i = 1; i <= SEGMENT_COUNT; i++) {
        const entry = data.images[i];
        if (!entry) {
          safeImages[i] = [];
          continue;
        }
        if (!Array.isArray(entry) || !entry.every(url => typeof url === 'string')) {
          throw new Error(`Images for segment ${i} malformed`);
        }
        safeImages[i] = entry;
      }
    }

    const safeSegments = {};
    if (data.segments) {
      for (let i = 1; i <= SEGMENT_COUNT; i++) {
        const count = Number(data.segments[i]);
        if (!Number.isFinite(count) || count < 0) {
          throw new Error(`Segment count for ${i} invalid`);
        }
        safeSegments[i] = count;
      }
    }

    let safeImageManifest;
    const coerceManifestEntry = (entry) => {
      if (!entry) return null;
      const alias = typeof entry.alias === 'string' ? entry.alias : typeof entry === 'string' ? entry : null;
      const segmentValue = typeof entry === 'object' && entry && Number.isFinite(entry.segment)
        ? Number(entry.segment)
        : Number(entry);
      const segment = Number.isFinite(segmentValue) ? segmentValue : NaN;
      if (typeof alias !== 'string' || alias.length === 0) return null;
      if (!Number.isInteger(segment) || segment < 1 || segment > SEGMENT_COUNT) return null;
      return { alias, segment };
    };
    if (Array.isArray(data.imageManifest)) {
      const manifest = [];
      let valid = true;
      data.imageManifest.forEach((entry) => {
        if (!valid) return;
        const coerced = coerceManifestEntry(entry);
        if (coerced) {
          manifest.push(coerced);
        } else {
          valid = false;
        }
      });
      if (valid) safeImageManifest = manifest;
    } else if (Array.isArray(data.imageOrder)) {
      const manifest = [];
      const aliasCounts = {};
      data.imageOrder.forEach((entry) => {
        const segValue = Number(entry);
        if (Number.isInteger(segValue) && segValue >= 1 && segValue <= SEGMENT_COUNT) {
          const aliasIndex = aliasCounts[segValue] || 0;
          const alias = `seg${segValue}-img${aliasIndex + 1}`;
          manifest.push({ alias, segment: segValue });
          aliasCounts[segValue] = aliasIndex + 1;
        }
      });
      if (manifest.length) safeImageManifest = manifest;
    }

    let safeImagePlacements;
    if (Array.isArray(data.imagePlacements)) {
      const placements = [];
      let valid = true;
      data.imagePlacements.forEach((entry) => {
        if (!valid) return;
        const alias = typeof entry.alias === 'string' ? entry.alias : null;
        const page = Number(entry.page);
        const order = Number(entry.order);
        if (alias && Number.isFinite(page) && page >= 1 && Number.isFinite(order) && order >= 1) {
          placements.push({ alias, page, order });
        } else {
          valid = false;
        }
      });
      if (valid) safeImagePlacements = placements;
    }

    return {
      studentName: typeof data.studentName === 'string' ? data.studentName : '',
      images: data.images ? safeImages : undefined,
      segments: data.segments ? safeSegments : undefined,
      timestamp: data.timestamp,
      imageManifest: safeImageManifest,
      imagePlacements: safeImagePlacements
    };
  } catch (err) {
    console.error('Failed to parse PPR metadata', err);
    return null;
  }
}

/**
 * Serializes the current workspace into a PDF.
 */
async function savePprPdf() {
  const saveBtn = document.querySelector('.action-button.save');
  const originalContent = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '⏳ Saving...';
  showProgressToast('Preparing PDF...');
  const updateSaveProgress = async (msg) => {
    setProgressToastMessage(msg);
    await new Promise(requestAnimationFrame);
  };

  // Allow UI to update before heavy processing
  await new Promise(resolve => setTimeout(resolve, UI_UPDATE_DELAY));

  try {
    // Lazy load PDF save functionality
    const { createPdfSaver } = await import('./pdf-saver.js');
    const { jsPDF, compressDataUrl, encodeForPdf } = await createPdfSaver();

    const studentName = document.getElementById('student-name').value;
    const timestamp = new Date()
      .toISOString()
      .split('.')[0]           // Remove milliseconds and 'Z': '2025-12-16T14:30:45'
      .replace(/:/g, '-')  // Replace ':' with hyphens for filename: '2025-12-16T14-30-45'
      .replace('T', '_');    // Replace 'T' with underscore for readability: '2025-12-16_14-30-45'

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    const hasImages = Object.values(segmentImages).some(a => (a || []).length);
    const finalize = (shouldSavePdf = true) => {
      const namePart = studentName ? studentName.replace(/\s+/g, '-') : 'Student';
      const fileName = `${namePart}-PPR-${timestamp}.pdf`;
      if (shouldSavePdf) {
        try {
          doc.save(fileName);
          showToast('PDF created');
          isModified = false;
        } catch (e) {
          showToast('Failed to save PDF', true);
          console.error(e);
        }
      }
      hideProgressToast();
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalContent;
    };

    if (hasImages) {
      generatePdfDocument({
        doc,
        compressDataUrl,
        encodeForPdf,
        studentName,
        timestamp,
        updateSaveProgress
      })
      .then(() => finalize(true)).catch((e) => {
        console.error('Save error', e);
        if (!e || e.code !== 'IMAGE_COMPRESSION_FAILED') {
          showToast('Failed to save PDF', true);
        }
        requestAnimationFrame(() => finalize(false));
      });
    } else {
      showToast('Add at least one image before exporting your PPR.', true);
      finalize(false);
    }
  } catch (error) {
    console.error('Save error:', error);
    showToast('Failed to save', true);
    hideProgressToast();
    // Restore button on error
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalContent;
  }
}

/**
 * Restores previously saved work from PDF/JSON.
 */
async function loadPprPdf() {
  const loadBtn = document.querySelector('.action-button.load');
  const originalContent = loadBtn.innerHTML;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.ppr,.json,application/pdf,application/json';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    loadBtn.disabled = true;
    loadBtn.innerHTML = '⏳ Loading...';

    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    const handleJsonLoad = (jsonText) => {
      try {
        const data = parsePprJson(jsonText);
        if (!data) {
          showToast('File contents were invalid. Please make sure it is a valid PPR save file.', true);
        } else {
          applyLoadedData(data);
          showToast('Work loaded successfully!');
        }
      } catch (error) {
        showToast('Error loading file. Please make sure it is a valid PPR save file.', true);
        console.error('Load error:', error);
      } finally {
        loadBtn.disabled = false;
        loadBtn.innerHTML = originalContent;
      }
    };

    if (isPdf) {
      // Lazy load PDF loader functionality
      const { createPdfLoader } = await import('./pdf-loader.js');
      const { extractImagesFromPdf, readEmbeddedPprData } = await createPdfLoader();

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const pdfArrayBuffer = event.target.result;
          const embeddedData = await readEmbeddedPprData(pdfArrayBuffer.slice(0));
          if (!embeddedData) {
            // No PPR metadata found - this is not a valid PPR PDF
            showToast('Could not load PDF. Only PPR PDFs saved from this site using "Save to PDF" can be loaded.', true);
            loadBtn.disabled = false;
            loadBtn.innerHTML = originalContent;
            return;
          }
          const data = parsePprJson(embeddedData);
          if (!data) {
            showToast('The embedded PPR data was invalid or corrupted.', true);
            hideProgressToast();
            return;
          }

          showProgressToast('Reading PDF...');
          const updateLoadProgress = async (msg) => {
            setProgressToastMessage(msg);
            await new Promise(requestAnimationFrame);
          };

          const extractionPromise = extractImagesFromPdf(pdfArrayBuffer.slice(0), {
            onProgress: async ({ page, totalPages }) => {
              const totalLabel = totalPages ?? '?';
              await updateLoadProgress(`Processing PDF pages (${page} of ${totalLabel})...`);
            }
          });
          await updateLoadProgress('Processing PDF pages (0 of ?)...');
          const {
            images: extractedImages,
            imagePlacements: extractedPlacements = [],
            skippedImages = []
          } = await extractionPromise;
          await updateLoadProgress('Rebuilding workspace...');
          const segments = data.segments || {};
          const expectedImageTotal = Object.values(segments).reduce((sum, count) => {
            const numeric = typeof count === 'number' ? count : parseInt(count, 10);
            return sum + (Number.isFinite(numeric) ? numeric : 0);
          }, 0);
          const manifestOrder =
            Array.isArray(data.imageManifest) &&
            data.imageManifest.length === expectedImageTotal
              ? data.imageManifest
              : null;

          // Build deterministic reconstruction order
          const fallbackOrder = [];
          for (let segment = 1; segment <= SEGMENT_COUNT; segment++) {
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
            Array.isArray(data.imagePlacements) && data.imagePlacements.length > 0;
          if (hasPlacementMetadata) {
            data.imagePlacements.forEach(({ alias, page, order }) => {
              if (!aliasMeta.has(alias)) return;
              if (!Number.isFinite(page) || page < 1 || !Number.isFinite(order) || order < 1) return;
              Object.assign(aliasMeta.get(alias), { page, order });
            });
          }

          // Reconstruct data with extracted images
          const reconstructedData = {
            studentName: data.studentName,
            images: {},
            timestamp: data.timestamp,
          };

          const missingImagesBySegment = [];
          console.log('Reconstructing data. Segment counts:', data.segments);
          console.log('Extracted images count:', extractedImages.length);

          const placementBuckets = new Map();
          const allIndices = new Set(extractedImages.map((_, idx) => idx));
          if (Array.isArray(extractedPlacements) && extractedPlacements.length === extractedImages.length) {
            extractedPlacements.forEach(({ page, order }, idx) => {
              if (!Number.isFinite(page) || !Number.isFinite(order)) return;
              const key = `${page}:${order}`;
              if (!placementBuckets.has(key)) placementBuckets.set(key, []);
              placementBuckets.get(key).push(idx);
            });
          }
          const claimFromBucket = (key) => {
            const bucket = placementBuckets.get(key);
            if (bucket && bucket.length) {
              const idx = bucket.shift();
              allIndices.delete(idx);
              if (!bucket.length) placementBuckets.delete(key);
              return idx;
            }
            return null;
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

          for (let segment = 1; segment <= SEGMENT_COUNT; segment++) {
            const expected = Number(segments[segment]) || 0;
            if (!reconstructedData.images[segment]) {
              reconstructedData.images[segment] = [];
            }
            const received = reconstructedData.images[segment].length;
            if (received < expected) {
              missingImagesBySegment.push({ segment, expected, received });
            }
            console.log(`Segment ${segment}: assigned ${received} of ${expected} expected images`);
          }

          const leftoverImagesCount = allIndices.size;
          const notices = [];
          const segmentsWithMissingImages = [];
          if (missingImagesBySegment.length) {
            const missingSummary = missingImagesBySegment
              .map(({ segment, expected, received }) => `Segment ${segment} (${expected - received} missing)`)
              .join('; ');
            notices.push(`Some images could not be recovered: ${missingSummary}. Please re-add them manually.`);
            segmentsWithMissingImages.push(...missingImagesBySegment.map(({ segment }) => segment));
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
              missingImagesBySegment,
              leftoverImages: leftoverImagesCount,
              skippedImages
            });
          }

          applyLoadedData(reconstructedData);

          if (segmentsWithMissingImages.length) {
            const uniqueSegments = [...new Set(segmentsWithMissingImages)];
            uniqueSegments.forEach(seg => flagSegmentLoadWarning(seg, true));
            focusSegmentLoadWarning(uniqueSegments[0]);
          }

          if (notices.length) {
            const isError = missingImagesBySegment.length > 0 || skippedImages.length > 0;
            showToast(notices.join(' '), isError);
          } else {
            showToast('Work loaded from PDF!');
          }
          hideProgressToast();
        } catch (error) {
          hideProgressToast();
          showToast('Error loading PDF. Make sure it was saved from here.', true);
          console.error('Load error:', error);
        } finally {
          loadBtn.disabled = false;
          loadBtn.innerHTML = originalContent;
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => handleJsonLoad(event.target.result);
      reader.readAsText(file);
    }
  };

  input.click();
}

/**
 * Handles newly dropped/uploaded files for a segment.
 * @param {File[]} files
 * @param {number} segmentNum
 */
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

function isAllowedImageFile(file) {
  if (!file || typeof file.name !== 'string') return false;
  const lowerName = file.name.toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

const pluralizeImages = (count, singular = 'image was', plural = 'images were') =>
  count === 1 ? singular : plural;

function handleFiles(files, segmentNum) {
  const remainingSlots = 3 - segmentImages[segmentNum].length;
  const validationSummary = files.reduce(
    (acc, file) => {
      if (isAllowedImageFile(file)) {
        acc.valid.push(file);
      } else {
        acc.invalidCount += 1;
      }
      return acc;
    },
    { valid: [], invalidCount: 0 }
  );
  const filesToAdd = validationSummary.valid.slice(0, remainingSlots);

  filesToAdd.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      addImage(e.target.result, segmentNum);
    };
    reader.readAsDataURL(file);
  });

  if (validationSummary.invalidCount > 0) {
    showToast(
      'Some files were rejected because only image formats are supported (PNG, JPG, GIF, WEBP).',
      true
    );
  }

  if (validationSummary.valid.length > filesToAdd.length) {
    showToast(
      `Only ${filesToAdd.length} ${pluralizeImages(filesToAdd.length)} added. Each segment is limited to 3 images.`,
      true
    );
  }
}

/**
 * Binds DOM handlers for image uploads + drag/drop for a segment.
 * @param {number} segmentNum
 */
function setupSegment(segmentNum) {
  const uploadArea = document.querySelector(`.upload-area[data-segment="${segmentNum}"]`);
  const fileInput = document.querySelector(`.hidden-input[data-segment="${segmentNum}"]`);
  const imagesContainer = document.querySelector(`.images-container[data-segment="${segmentNum}"]`);

  if (!uploadArea || !fileInput || !imagesContainer) return;

  if (!imagesContainer.dataset.removeHandlerBound) {
    imagesContainer.addEventListener('click', handleSegmentImagesClick);
    imagesContainer.dataset.removeHandlerBound = 'true';
  }

  uploadArea.addEventListener('click', () => {
    if (segmentImages[segmentNum].length < 3) {
      fileInput.click();
    }
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    if (segmentImages[segmentNum].length >= 3) {
      showToast('This segment already has 3 images. Remove one before adding another.', true);
      return;
    }

    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles, segmentNum);
  });

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files, segmentNum);
    fileInput.value = '';
  });
}

/**
 * Sets up the entire PPR UI and global behaviors.
 */
function setupPPR() {
  // Setup segments
  for (let i = 1; i <= SEGMENT_COUNT; i++) {
    setupSegment(i);
  }

  // Setup button handlers without leaking globals
  const saveButton = document.querySelector('.action-button.save');
  const loadButton = document.querySelector('.action-button.load');
  if (saveButton) {
    saveButton.addEventListener('click', savePprPdf);
  }
  if (loadButton) {
    loadButton.addEventListener('click', loadPprPdf);
  }

  // Warn on unload if modified
  window.addEventListener('beforeunload', (e) => {
    if (isModified) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

  // Handle nolist query param
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('nolist')) {
    document.querySelectorAll('.list-section').forEach(el => {
      el.classList.add('hidden');
    });
  }
}
async function generatePdfDocument({
  doc,
  compressDataUrl,
  encodeForPdf,
  studentName,
  timestamp,
  updateSaveProgress
}) {
  const totalImages = Object.values(segmentImages).reduce((sum, imgs) => sum + (imgs?.length || 0), 0);
  const totalLabel = totalImages || '?';
  await updateSaveProgress(`Processing PPR images (0 of ${totalLabel})...`);

  const { images: compressedImages, failures: compressionFailures } =
    await compressImagesAndBuildPayload(compressDataUrl, {
      onProgress: async ({ processed, total }) => {
        const displayTotal = total || totalLabel;
        await updateSaveProgress(`Processing PPR images (${processed} of ${displayTotal})...`);
      }
    });

  if (compressionFailures.length) {
    const affectedSegments = [...new Set(compressionFailures.map(({ segment }) => segment))]
      .map(seg => `Segment ${seg}`)
      .join(', ');
    showToast(
      `Failed to prepare ${compressionFailures.length} image(s). ${affectedSegments} need attention before saving.`,
      true
    );
    scrollToImageError(compressionFailures[0].segment, compressionFailures[0].index);
    const error = new Error('IMAGE_COMPRESSION_FAILED');
    error.code = 'IMAGE_COMPRESSION_FAILED';
    throw error;
  }

  const totalEmbed = Object.values(compressedImages).reduce((sum, imgs) => sum + (imgs?.length || 0), 0);
  await updateSaveProgress(`Embedding images into PDF (0 of ${totalEmbed || '?'})...`);
  const { payload, aliasMap } = buildPdfPayload(compressedImages, studentName, timestamp);

  const nameToRender = studentName || '';
  const nameY = PDF_LAYOUT.headerNameYPt;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(PDF_CONTENT_FONT_SIZE);
  const nameLabel = 'Name:';
  doc.text(nameLabel, PDF_LAYOUT.marginPt, nameY);
  const nameStartX =
    PDF_LAYOUT.marginPt +
    doc.getTextWidth(`${nameLabel} `);

  doc.setFontSize(PDF_HEADER_FONT_SIZE);
  doc.text(nameToRender, nameStartX + PDF_LAYOUT.nameLabelGapPt, nameY);

  const underlineY = nameY + PDF_LAYOUT.nameUnderlineOffsetPt;
  const originalLineWidth =
    typeof doc.getLineWidth === 'function' ? doc.getLineWidth() : null;
  doc.setLineWidth(PDF_LAYOUT.nameUnderlineWidthPt);
  doc.line(nameStartX, underlineY, pageWidth - PDF_LAYOUT.marginPt, underlineY);
  if (typeof originalLineWidth === 'number') {
    doc.setLineWidth(originalLineWidth);
  }

  doc.setFontSize(PDF_HEADER_FONT_SIZE);
  doc.text('Practice AP CSP Create Task Personalized Project Reference', PDF_LAYOUT.marginPt, PDF_LAYOUT.headerTitleYPt);

  doc.setFontSize(PDF_CONTENT_FONT_SIZE);
  const skippedRenderImages = [];
  const imagePlacements = [];
  await renderSegmentImages(
    doc,
    compressedImages,
    skippedRenderImages,
    {
      onProgress: async ({ embedded, total }) => {
        const totalLabel = total || totalEmbed || '?';
        await updateSaveProgress(`Embedding images into PDF (${embedded} of ${totalLabel})...`);
      }
    },
    aliasMap,
    imagePlacements
  );
  embedPayloadMetadata(doc, payload, encodeForPdf, studentName);

  if (skippedRenderImages.length) {
    const affectedSegments = [...new Set(skippedRenderImages.map(({ segment }) => segment))];
    const segmentsLabel = affectedSegments.map(seg => `Segment ${seg}`).join(', ');
    showToast(
      `${skippedRenderImages.length} image(s) were skipped because they were unreadable or too small to render. ${segmentsLabel} need attention before saving.`,
      true
    );
    affectedSegments.forEach(seg => flagSegmentLoadWarning(seg, true));
    if (affectedSegments.length) {
      focusSegmentLoadWarning(affectedSegments[0]);
    }
  }
}
