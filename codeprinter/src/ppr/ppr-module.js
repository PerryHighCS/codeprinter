let isModified = false;
let progressToastEl = null;

const DEFAULT_SEGMENT_COUNT = 4;

const createSegmentMap = () => {
  const map = {};
  for (let i = 1; i <= DEFAULT_SEGMENT_COUNT; i++) {
    map[i] = [];
  }
  return map;
};

const FOCUS_ANIMATION_DURATION = 1600;
const SEGMENT_WARNING_ANIMATION_DURATION = 1500;
const UI_UPDATE_DELAY = 50;
const MIN_RENDERED_IMAGE_SIZE = 10; // pixels
const TOAST_SHOW_DELAY = 10;
const TOAST_HIDE_DELAY = 300;
const TOAST_DURATION = 3000;
const PDF_HEADER_FONT_SIZE = 16;
const PDF_CONTENT_FONT_SIZE = 12;


const segmentImages = createSegmentMap();
const imageCompressionState = createSegmentMap();
const imageProcessingErrors = createSegmentMap();
const imageDimensions = createSegmentMap();


/** labels for each section of the Practice PPR. These labels are dictated by the actual PPR. */
const SEGMENT_LABEL_LINES = {
  1: ['Procedure', 'i.'],
  2: ['ii.'],
  3: ['List', 'i.'],
  4: ['ii.']
};

/**
 * Returns cached image dimensions if known for the given segment/index pair.
 * @param {number} segmentNum
 * @param {number} index
 * @returns {{width:number,height:number}|null}
 */
function getCachedImageDimensions(segmentNum, index) {
  const dims = imageDimensions[segmentNum]?.[index];
  if (!dims) return null;
  const { width, height } = dims;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return dims;
}

/**
 * Persist dimension metadata for a segment so future renders avoid re-measuring.
 * @param {number} segmentNum
 * @param {number} index
 * @param {{width:number,height:number}} dimensions
 */
function storeImageDimensions(segmentNum, index, dimensions) {
  if (!dimensions) return;
  const { width, height } = dimensions;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  imageDimensions[segmentNum][index] = { width, height };
}

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
  if (!dataUrl) return;
  if (getCachedImageDimensions(segmentNum, index)) return;
  measureImageDimensions(dataUrl)
    .then(dimensions => storeImageDimensions(segmentNum, index, dimensions))
    .catch(err => console.warn(`Failed to cache dimensions for segment ${segmentNum} image ${index + 1}`, err));
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
async function buildCompressedPayload(compressDataUrlFn, { onProgress } = {}) {
  if (typeof compressDataUrlFn !== 'function') {
    throw new Error('compressDataUrl function required to build payload');
  }

  const compressedImages = {};
  const compressionFailures = [];
  const totalImages = Object.values(segmentImages).reduce((sum, imgs) => sum + (imgs?.length || 0), 0);
  let processed = 0;
  for (let segment = 1; segment <= DEFAULT_SEGMENT_COUNT; segment++) {
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
 * @returns {{studentName: string, segments: Record<string, number>, timestamp: string}}
 */
function buildPdfPayload(compressedImages, studentName, timestamp) {
  return {
    studentName,
    segments: Object.keys(compressedImages).reduce((acc, seg) => {
      acc[seg] = compressedImages[seg].length;
      return acc;
    }, {}),
    timestamp,
  };
}

/**
 * Embeds metadata payload inside the PDF keywords so it can be losslessly extracted later
 * without inflating the PDF by duplicating the binary image data.
 * @param {import('jspdf').jsPDF} doc
 * @param {{studentName: string, segments: Record<string, number>, timestamp: string}} payload
 * @param {(text: string) => string} encodeForPdf
 * @param {string} studentName
 */
function embedPayloadMetadata(doc, payload, encodeForPdf, studentName) {
  const jsonString = JSON.stringify(payload);
  const embedded = encodeForPdf(jsonString);

  doc.setProperties({
    title: 'Practice Personalized Project Reference',
    subject: 'Practice AP CSP Create Task Personalized Project Reference',
    author: studentName || 'Unknown',
    keywords: `PPRDATA:${embedded}`,
  });
}

const PDF_LAYOUT = Object.freeze({
  margin: 40,
  contentStartY: 90,
  headerNameY: 40,
  headerTitleY: 60,
  textLineHeight: 16,
  imageGap: 14,
  segmentGap: 10,
  nameLabelGap: 6,
  nameUnderlineOffset: 3,
  nameUnderlineWidth: 0.5,
});

/**
 * Renders all compressed images into the PDF, ensuring the label text and images sit together by
 * segment and flowing across pages as required.
 * @param {import('jspdf').jsPDF} doc
 * @param {Record<number, string[]>} compressedImages
 * @param {Array<{segment:number,index:number,reason:string}>} [skippedImages]
 */
async function renderSegmentImages(doc, compressedImages, skippedImages = [], { onProgress } = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = PDF_LAYOUT.margin;

  let y = PDF_LAYOUT.contentStartY;
  const maxW = pageWidth - margin * 2;
  const maxH = pageHeight - margin * 2;

  const recordSkip = (segmentNum, imageIndex, reason) => {
    if (!Array.isArray(skippedImages)) return;
    skippedImages.push({ segment: segmentNum, index: imageIndex, reason });
  };

  let embeddedCount = 0;
  const totalToEmbed = Object.values(compressedImages).reduce((sum, imgs) => sum + (imgs?.length || 0), 0);

  for (let segment = 1; segment <= DEFAULT_SEGMENT_COUNT; segment++) {
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

        if (w < MIN_RENDERED_IMAGE_SIZE || h < MIN_RENDERED_IMAGE_SIZE) {
          const reason = !isFirstImageInSegment
            ? 'tooSmall'
            : (pageHeight - margin * 2 - (segLines.length * PDF_LAYOUT.textLineHeight) <= 0
                ? 'noSpaceAfterLabels'
                : 'tooSmall');
          const message = reason === 'noSpaceAfterLabels'
            ? `Segment ${segment} labels leave no room for image ${imgIdx + 1}. Let’s shorten the label text or split the image.`
            : `Image ${imgIdx + 1} in segment ${segment} is too small after scaling (${w.toFixed(0)}x${h.toFixed(0)}px).`;
          showToast(message, true);
          recordSkip(segment, imgIdx, reason);
          continue;
        }

        // For first image in segment, ensure text and image fit on same page
        if (isFirstImageInSegment) {
          // Calculate height needed for multiline text
          const textLines = segLines;
          const textHeight = textLines.length * PDF_LAYOUT.textLineHeight;
          const spaceAvailable = pageHeight - margin - y;
          
          if (h + textHeight > spaceAvailable) {
            // Move to new page
            doc.addPage();
            y = margin;
            const maxImageHeight = pageHeight - margin * 2 - textHeight;
            scale = Math.min(maxW / props.width, maxImageHeight / props.height, 1);
            w = props.width * scale;
            h = props.height * scale;
          }
          // Add segment text right before first image (handle multiline)
          for (const line of textLines) {
            doc.text(line, margin, y);
            y += PDF_LAYOUT.textLineHeight;
          }
          isFirstImageInSegment = false;
        } else {
          // For subsequent images, add page break if needed
          if (y + h > pageHeight - margin) {
            doc.addPage();
            y = margin;
            // Handle multiline continuation text; guard against empty labels
            const lastLine = segLines[segLines.length - 1];
            const baseLabel = typeof lastLine === 'string' ? lastLine.trim() : '';
            if (baseLabel) {
              const contText = `${baseLabel} (cont.)`;
              doc.text(contText, margin, y);
              y += PDF_LAYOUT.textLineHeight;
            }
          }
        }

        doc.addImage(compressed, 'PNG', margin, y, w, h, undefined, 'FAST');
        embeddedCount += 1;
        if (typeof onProgress === 'function') {
          await onProgress({ embedded: embeddedCount, total: totalToEmbed });
        }
        y += h + PDF_LAYOUT.imageGap;
        } catch (err) {
          console.error('Image add error', err);
          recordSkip(segment, imgIdx, 'renderError');
        }
      }

    // Add spacing between segments, but don't create a new page if this is the last segment
    y += PDF_LAYOUT.segmentGap;
  }
}

/**
 * Displays a temporary toast notification to the user.
 * @param {string} message
 * @param {boolean} [isError=false]
 */
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (isError) {
    toast.classList.add('error');
  }
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), TOAST_SHOW_DELAY);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => document.body.removeChild(toast), TOAST_HIDE_DELAY);
  }, TOAST_DURATION);
}

function showProgressToast(message) {
  if (!progressToastEl) {
    progressToastEl = document.createElement('div');
    progressToastEl.className = 'toast persistent';
    document.body.appendChild(progressToastEl);
    setTimeout(() => progressToastEl.classList.add('show'), TOAST_SHOW_DELAY);
  }
  progressToastEl.textContent = message;
}

function updateProgressToast(message) {
  if (progressToastEl) {
    progressToastEl.textContent = message;
  } else {
    showProgressToast(message);
  }
}

function hideProgressToast() {
  if (progressToastEl) {
    const toastToRemove = progressToastEl;
    progressToastEl = null;
    toastToRemove.classList.remove('show');
    setTimeout(() => toastToRemove.remove(), TOAST_HIDE_DELAY);
  }
}

/**
 * Synchronizes DOM styling for images that failed preprocessing.
 * @param {number} segmentNum
 */
function updateImageErrorStyles(segmentNum) {
  const container = document.querySelector(`.images-container[data-segment="${segmentNum}"]`);
  if (!container) return;

  const wrappers = container.querySelectorAll('.image-wrapper');
  wrappers.forEach((wrapper, index) => {
    const hasError = Boolean(imageProcessingErrors[segmentNum]?.[index]);
    wrapper.classList.toggle('image-error', hasError);
  });
}

/**
 * Flags or clears an error for a particular image and syncs the UI.
 * @param {number} segmentNum
 * @param {number} index
 * @param {boolean} hasError
 */
function setImageProcessingError(segmentNum, index, hasError) {
  imageProcessingErrors[segmentNum][index] = hasError;
  updateImageErrorStyles(segmentNum);
}

/**
 * Scrolls smoothly to the offending image wrapper so the user can fix it quickly.
 * @param {number} segmentNum
 * @param {number} index
 */
function scrollToImageError(segmentNum, index) {
  const container = document.querySelector(`.images-container[data-segment="${segmentNum}"]`);
  if (!container) return;

  const wrapper = container.querySelector(`.image-wrapper[data-image-index="${index}"]`);
  if (!wrapper) return;

  wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
  wrapper.classList.add('image-error-focus');
  setTimeout(() => wrapper.classList.remove('image-error-focus'), FOCUS_ANIMATION_DURATION);
}

function clearSegmentLoadWarnings() {
  document.querySelectorAll('.upload-area.segment-warning').forEach(el => {
    el.classList.remove('segment-warning');
    el.classList.remove('segment-warning-focus');
  });
}

function flagSegmentLoadWarning(segmentNum, hasWarning = true) {
  const uploadArea = document.querySelector(`.upload-area[data-segment="${segmentNum}"]`);
  if (!uploadArea) return;
  uploadArea.classList.toggle('segment-warning', hasWarning);
}

function focusSegmentLoadWarning(segmentNum) {
  const uploadArea = document.querySelector(`.upload-area[data-segment="${segmentNum}"]`);
  if (!uploadArea) return;
  uploadArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
  uploadArea.classList.add('segment-warning-focus');
  setTimeout(() => uploadArea.classList.remove('segment-warning-focus'), SEGMENT_WARNING_ANIMATION_DURATION);
}

/**
 * Adds a single image to a segment during interactive editing and refreshes UI state.
 * (Distinct from the `addImages` helper inside `savePprPdf`, which processes every segment before exporting.)
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
 * Renders the thumbnails for a given segment.
 * @param {number} segmentNum
 */
function renderImages(segmentNum) {
  const imagesContainer = document.querySelector(`.images-container[data-segment="${segmentNum}"]`);
  const uploadArea = document.querySelector(`.upload-area[data-segment="${segmentNum}"]`);

  imagesContainer.innerHTML = '';

  segmentImages[segmentNum].forEach((dataUrl, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';
    wrapper.dataset.imageIndex = index;

    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = `Code screenshot ${index + 1}`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-button';
    removeBtn.innerHTML = '×';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      removeImage(index, segmentNum);
    };

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    imagesContainer.appendChild(wrapper);
  });

  if (segmentImages[segmentNum].length > 0) {
    uploadArea.classList.add('has-images');
  } else {
    uploadArea.classList.remove('has-images');
  }

  updateImageErrorStyles(segmentNum);
}

/**
 * Updates UI counters and upload affordances for a segment.
 * @param {number} segmentNum
 */
function updateImageCount(segmentNum) {
  const imageCount = document.querySelector(`.image-count[data-count="${segmentNum}"]`);
  const count = segmentImages[segmentNum].length;
  imageCount.textContent = `${count} / 3 images`;

  const uploadArea = document.querySelector(`.upload-area[data-segment="${segmentNum}"]`);
  if (count >= 3) {
    uploadArea.style.opacity = '0.6';
    uploadArea.style.cursor = 'not-allowed';
  } else {
    uploadArea.style.opacity = '1';
    uploadArea.style.cursor = 'pointer';
  }
}

/**
 * Hydrates UI + state from previously saved work.
 * @param {{studentName?: string, images?: Record<number, string[]>}} data
 */
function applyLoadedData(data) {
  if (!data) return;
  clearSegmentLoadWarnings();

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
        primeImageDimensions(segmentNum, index, dataUrl);
      });
      renderImages(segmentNum);
      updateImageCount(segmentNum);
    }
  }

  isModified = false;
}

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
      for (let i = 1; i <= DEFAULT_SEGMENT_COUNT; i++) {
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
      for (let i = 1; i <= DEFAULT_SEGMENT_COUNT; i++) {
        const count = Number(data.segments[i]);
        if (!Number.isFinite(count) || count < 0) {
          throw new Error(`Segment count for ${i} invalid`);
        }
        safeSegments[i] = count;
      }
    }

    return {
      studentName: typeof data.studentName === 'string' ? data.studentName : '',
      images: data.images ? safeImages : undefined,
      segments: data.segments ? safeSegments : undefined,
      timestamp: data.timestamp
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
    updateProgressToast(msg);
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
      .replace(/[:.]/g, '-');  // Replace colons with hyphens for filename: '2025-12-16T14-30-45'

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    /**
     * Compresses all current images, embeds the metadata payload, then streams visuals into the PDF.
     * Unlike `addImage` (which handles interactive adds), this processes every segment at export time.
     */
    const addImages = async () => {
      const totalImages = Object.values(segmentImages).reduce((sum, imgs) => sum + (imgs?.length || 0), 0);
      const totalLabel = totalImages || '?';
      await updateSaveProgress(`Processing PPR images (0 of ${totalLabel})...`);
      let compressedImages;
      let compressionFailures;
        const result = await buildCompressedPayload(compressDataUrl, {
          onProgress: async ({ processed, total }) => {
            const displayTotal = total || totalLabel;
            await updateSaveProgress(`Processing PPR images (${processed} of ${displayTotal})...`);
          }
        });
      compressedImages = result.images;
      compressionFailures = result.failures;

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
      const payload = buildPdfPayload(compressedImages, studentName, timestamp);
      embedPayloadMetadata(doc, payload, encodeForPdf, studentName);

      const nameToRender = studentName || 'Unknown';
      const nameY = PDF_LAYOUT.headerNameY;
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(PDF_CONTENT_FONT_SIZE);
      const nameLabel = 'Name:';
      doc.text(nameLabel, PDF_LAYOUT.margin, nameY);
      const nameStartX =
        PDF_LAYOUT.margin +
        doc.getTextWidth(`${nameLabel} `);

      doc.setFontSize(PDF_HEADER_FONT_SIZE);
      doc.text(nameToRender, nameStartX + PDF_LAYOUT.nameLabelGap, nameY);

      const underlineY = nameY + PDF_LAYOUT.nameUnderlineOffset;
      const originalLineWidth =
        typeof doc.getLineWidth === 'function' ? doc.getLineWidth() : null;
      doc.setLineWidth(PDF_LAYOUT.nameUnderlineWidth);
      doc.line(nameStartX, underlineY, pageWidth - PDF_LAYOUT.margin, underlineY);
      if (typeof originalLineWidth === 'number') {
        doc.setLineWidth(originalLineWidth);
      }

      doc.setFontSize(PDF_HEADER_FONT_SIZE);
      doc.text('Practice AP CSP Create Task Personalized Project Reference', PDF_LAYOUT.margin, PDF_LAYOUT.headerTitleY);

      doc.setFontSize(PDF_CONTENT_FONT_SIZE);
      const skippedRenderImages = [];
      await renderSegmentImages(doc, compressedImages, skippedRenderImages, {
        onProgress: async ({ embedded, total }) => {
          const totalLabel = total || totalEmbed || '?';
          await updateSaveProgress(`Embedding images into PDF (${embedded} of ${totalLabel})...`);
        }
      });

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
    };

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
      saveBtn.innerHTML = originalContent;
      // Restore button
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalContent;
    };

    if (hasImages) {
      addImages().then(() => finalize(true)).catch((e) => { 
        console.error('Save error', e); 
        if (!e || e.code !== 'IMAGE_COMPRESSION_FAILED') {
          showToast('Failed to save PDF', true);
        }
        finalize(false); 
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
      const { decodeFromPdf, extractImagesFromPdf } = await createPdfLoader();
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const bytes = new Uint8Array(event.target.result);
          // Use TextDecoder for efficient conversion
          const text = new TextDecoder('latin1').decode(bytes);

          const match = text.match(/PPRDATA:([A-Za-z0-9+/=]+)/);
          if (!match) {
            // No PPR metadata found - this is not a valid PPR PDF
            showToast('Could not load PDF. Only PPR PDFs saved from this site using "Save to PDF" can be loaded.', true);
            loadBtn.disabled = false;
            loadBtn.innerHTML = originalContent;
            return;
          }

          showProgressToast('Reading PDF...');
          const updateLoadProgress = async (msg) => {
            updateProgressToast(msg);
            await new Promise(requestAnimationFrame);
          };
          const jsonString = decodeFromPdf(match[1]);
          const data = parsePprJson(jsonString);
          if (!data) {
            showToast('The embedded PPR data was invalid or corrupted.', true);
            hideProgressToast();
            return;
          }

          await updateLoadProgress('Processing PDF pages (0 of ?)...');
          const { images, skippedImages } = await extractImagesFromPdf(event.target.result, {
            onProgress: async ({ page, totalPages }) => {
              const totalLabel = totalPages ?? '?';
              await updateLoadProgress(`Processing PDF pages (${page} of ${totalLabel})...`);
            }
          });
          await updateLoadProgress('Rebuilding workspace...');
          const segments = data.segments || {};
          const expectedImageTotal = Object.values(segments).reduce((sum, count) => {
            const numeric = typeof count === 'number' ? count : parseInt(count, 10);
            return sum + (Number.isFinite(numeric) ? numeric : 0);
          }, 0);

          // Reconstruct data with extracted images
          const reconstructedData = {
            studentName: data.studentName,
            images: {},
            timestamp: data.timestamp,
          };

          let imageIdx = 0;
          const missingImagesBySegment = [];
          console.log('Reconstructing data. Segment counts:', data.segments);
          console.log('Extracted images count:', images.length);
          for (let segment = 1; segment <= DEFAULT_SEGMENT_COUNT; segment++) {
            const count = Number(segments[segment]) || 0;
            reconstructedData.images[segment] = [];
            for (let i = 0; i < count && imageIdx < images.length; i++) {
              reconstructedData.images[segment].push(images[imageIdx++]);
            }
            if (reconstructedData.images[segment].length < count) {
              missingImagesBySegment.push({
                segment,
                expected: count,
                received: reconstructedData.images[segment].length
              });
            }
            console.log(`Segment ${segment}: assigned ${reconstructedData.images[segment].length} of ${count} expected images`);
          }

          const leftoverImages = Math.max(0, images.length - imageIdx);
          const notices = [];
          const warningSegments = [];
          if (missingImagesBySegment.length) {
            const missingSummary = missingImagesBySegment
              .map(({ segment, expected, received }) => `Segment ${segment} (${expected - received} missing)`)
              .join('; ');
            notices.push(`Some images could not be recovered: ${missingSummary}. Please re-add them manually.`);
            warningSegments.push(...missingImagesBySegment.map(({ segment }) => segment));
          }
          if (imageIdx < images.length) {
            notices.push('Extra images were found in the PDF that could not be matched to segments. Please verify the PDF was created by this tool.');
          }
          if (skippedImages.length) {
            notices.push(`${skippedImages.length} image(s) could not be decoded from the PDF in time. Highlighted segments may be incomplete.`);
          }
          if (leftoverImages > 0) {
            notices.push(`${leftoverImages} unreferenced image(s) were ignored during reconstruction.`);
          }
          if (notices.length) {
            console.warn('Image reconstruction mismatch:', {
              expectedImageTotal,
              extractedImages: images.length,
              missingImagesBySegment,
              leftoverImages,
              skippedImages
            });
          }

          applyLoadedData(reconstructedData);

          if (warningSegments.length) {
            const uniqueSegments = [...new Set(warningSegments)];
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
function handleFiles(files, segmentNum) {
  const remainingSlots = 3 - segmentImages[segmentNum].length;
  const filesToAdd = files.slice(0, remainingSlots);

  filesToAdd.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      addImage(e.target.result, segmentNum);
    };
    reader.readAsDataURL(file);
  });

  if (files.length > filesToAdd.length) {
    const pluralized = filesToAdd.length === 1 ? 'image was' : 'images were';
    showToast(`Only ${filesToAdd.length} ${pluralized} added. Each segment is limited to 3 images.`, true);
  }
}

/**
 * Binds DOM handlers for image uploads + drag/drop for a segment.
 * @param {number} segmentNum
 */
function setupSegment(segmentNum) {
  const uploadArea = document.querySelector(`.upload-area[data-segment="${segmentNum}"]`);
  const fileInput = document.querySelector(`.hidden-input[data-segment="${segmentNum}"]`);

  if (!uploadArea || !fileInput) return;

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

    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    handleFiles(files, segmentNum);
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
  for (let i = 1; i <= DEFAULT_SEGMENT_COUNT; i++) {
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
