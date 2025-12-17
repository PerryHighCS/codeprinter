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
import { createFileHandling } from './ppr-files.js';
import { createPdfSavePipeline } from './pdf-saver.js';
import {
  showToast,
  updateImageErrorStyles,
  scrollToImageError,
  clearSegmentLoadWarnings,
  flagSegmentLoadWarning,
  focusSegmentLoadWarning,
  renderImages,
  updateImageCount
} from './ppr-ui.js';

let isModified = false;

const UI_UPDATE_DELAY = 50;

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

const { generatePdfDocument } = createPdfSavePipeline({
  segmentImages,
  imageCompressionState,
  imageProcessingErrors,
  SEGMENT_COUNT,
  SEGMENT_LABEL_LINES,
  getCachedImageDimensions,
  storeImageDimensions,
  measureImageDimensions,
  ensureAllImageDimensions,
  setImageProcessingError,
  showToast,
  scrollToImageError,
  flagSegmentLoadWarning,
  focusSegmentLoadWarning
});

const {
  setupSegment: setupSegmentUploadArea,
  savePprPdf,
  loadPprPdf
} = createFileHandling({
  addImage,
  handleSegmentImagesClick,
  parsePprJson,
  applyLoadedData,
  generatePdfDocument,
  markWorkspaceUnmodified: () => {
    isModified = false;
  },
  uiUpdateDelay: UI_UPDATE_DELAY
});

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
    const getManifestAlias = (entry) => {
      if (entry && typeof entry === 'object' && typeof entry.alias === 'string') {
        return entry.alias;
      }
      return typeof entry === 'string' ? entry : null;
    };
    const getManifestSegment = (entry) => {
      if (entry && typeof entry === 'object' && Number.isFinite(Number(entry.segment))) {
        return Number(entry.segment);
      }
      const numeric = Number(entry);
      return Number.isFinite(numeric) ? numeric : null;
    };
    const coerceManifestEntry = (entry) => {
      if (!entry) return null;
      const alias = getManifestAlias(entry);
      const segment = getManifestSegment(entry);
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
 * Sets up the entire PPR UI and global behaviors.
 */
function setupPPR() {
  // Setup segments
  for (let i = 1; i <= SEGMENT_COUNT; i++) {
    setupSegmentUploadArea(i);
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
