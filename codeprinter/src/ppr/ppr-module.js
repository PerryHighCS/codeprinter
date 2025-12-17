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

const segmentImages = createSegmentMap();
const imageCompressionState = createSegmentMap();
const imageProcessingErrors = createSegmentMap();

const PAGE_MARGIN = 40;

const SEGMENT_LABEL_LINES = {
  1: ['Procedure', 'i.'],
  2: ['ii.'],
  3: ['List', 'i.'],
  4: ['ii.']
};

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
        if (totalImages) {
          onProgress?.({ processed, total: totalImages });
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


/**
 * Renders all compressed images into the PDF, ensuring the label text and images sit together by
 * segment and flowing across pages as required.
 * @param {import('jspdf').jsPDF} doc
 * @param {Record<number, string[]>} compressedImages
 * @param {Array<{segment:number,index:number,reason:string}>} [skippedImages]
 */
async function renderSegmentImages(doc, compressedImages, skippedImages = []) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = PAGE_MARGIN;

  let y = 90;
  const maxW = pageWidth - margin * 2;
  const maxH = pageHeight - margin * 2;

  const recordSkip = (segmentNum, imageIndex, reason) => {
    if (!Array.isArray(skippedImages)) return;
    skippedImages.push({ segment: segmentNum, index: imageIndex, reason });
  };

  for (let segment = 1; segment <= DEFAULT_SEGMENT_COUNT; segment++) {
    const imgs = compressedImages[segment] || [];
    if (!imgs.length) continue;
    const segLines = SEGMENT_LABEL_LINES[segment] || [];
    
    // For first image in segment, check if we need a new page
    let isFirstImageInSegment = true;
    
    for (let imgIdx = 0; imgIdx < imgs.length; imgIdx++) {
      const compressed = imgs[imgIdx];
      
      try {
        let props;
        try {
          props = doc.getImageProperties(compressed);
        } catch (err) {
          // Try to get dimensions from image by loading it
          try {
            const img = new Image();
            props = await new Promise((resolve, reject) => {
              img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
              img.onerror = () => reject(new Error('Could not load image'));
              img.src = compressed;
            });
          } catch {
            console.warn(`Could not determine dimensions for image ${imgIdx + 1} in segment ${segment}. Skipping this image.`);
            recordSkip(segment, imgIdx, 'dimensions');
            continue;
          }
        }
        
        let scale = Math.min(maxW / props.width, maxH / props.height, 1);
        let w = props.width * scale;
        let h = props.height * scale;

        // Skip images that would be too small to be useful (less than 50px in either dimension)
        if (w < 50 || h < 50) {
          console.warn(`Image ${imgIdx + 1} in segment ${segment} is too small after scaling (${w.toFixed(0)}x${h.toFixed(0)}px). Skipping.`);
          recordSkip(segment, imgIdx, 'tooSmall');
          continue;
        }

        // For first image in segment, ensure text and image fit on same page
        if (isFirstImageInSegment) {
          // Calculate height needed for multiline text
          const textLines = segLines;
          const textHeight = textLines.length * 16;
          const spaceAvailable = pageHeight - margin - y;
          
          if (h + textHeight > spaceAvailable) {
            // Move to new page
            doc.addPage();
            y = margin;
            // Now scale if needed to fit on the fresh page
            const maxImageHeight = pageHeight - margin * 2 - textHeight;
            scale = Math.min(maxW / props.width, maxImageHeight / props.height, 1);
            w = props.width * scale;
            h = props.height * scale;
            
            // Double-check dimensions after rescaling
            if (w < 50 || h < 50) {
              console.warn(`Image ${imgIdx + 1} in segment ${segment} cannot be rendered at a meaningful size (${w.toFixed(0)}x${h.toFixed(0)}px) due to its original resolution. Skipping.`);
              recordSkip(segment, imgIdx, 'tooSmall');
              continue;
            }
          }
          // Add segment text right before first image (handle multiline)
          for (const line of textLines) {
            doc.text(line, margin, y);
            y += 16;
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
              y += 16;
            }
          }
        }

        doc.addImage(compressed, 'PNG', margin, y, w, h, undefined, 'FAST');
        y += h + 14;
        } catch (err) {
          console.error('Image add error', err);
          recordSkip(segment, imgIdx, 'renderError');
        }
      }

    // Add spacing between segments, but don't create a new page if this is the last segment
    y += 10;
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

  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 3000);
}

function showProgressToast(message) {
  if (!progressToastEl) {
    progressToastEl = document.createElement('div');
    progressToastEl.className = 'toast persistent';
    document.body.appendChild(progressToastEl);
    setTimeout(() => progressToastEl.classList.add('show'), 10);
  }
  progressToastEl.textContent = message;
}

function hideProgressToast() {
  if (progressToastEl) {
    const toastToRemove = progressToastEl;
    progressToastEl = null;
    toastToRemove.classList.remove('show');
    setTimeout(() => toastToRemove.remove(), 300);
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
  setTimeout(() => wrapper.classList.remove('image-error-focus'), 1600);
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
  setTimeout(() => uploadArea.classList.remove('segment-warning-focus'), 1500);
}

/**
 * Adds a single image to a segment during interactive editing and refreshes UI state.
 * (Distinct from the `addImages` helper inside `savePprPdf`, which processes every segment before exporting.)
 * @param {string} dataUrl
 * @param {number} segmentNum
 */
function addImage(dataUrl, segmentNum) {
  segmentImages[segmentNum].push(dataUrl);
  imageCompressionState[segmentNum].push(false);
  flagSegmentLoadWarning(segmentNum, false);
  imageProcessingErrors[segmentNum].push(false);
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
    for (let segmentNum in data.images) {
      segmentImages[segmentNum] = data.images[segmentNum];
      imageCompressionState[segmentNum] = new Array(segmentImages[segmentNum].length).fill(true);
      imageProcessingErrors[segmentNum] = new Array(segmentImages[segmentNum].length).fill(false);
      renderImages(parseInt(segmentNum, 10));
      updateImageCount(parseInt(segmentNum, 10));
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

  // Allow UI to update before heavy processing
  await new Promise(resolve => setTimeout(resolve, 50));

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
      showProgressToast(`Processing PPR images (0 of ${totalLabel})...`);
      let compressedImages;
      let compressionFailures;
      try {
        const result = await buildCompressedPayload(compressDataUrl, {
          onProgress: ({ processed, total }) => {
            const displayTotal = total || totalLabel;
            showProgressToast(`Processing PPR images (${processed} of ${displayTotal})...`);
          }
        });
        compressedImages = result.images;
        compressionFailures = result.failures;
      } finally {
        hideProgressToast();
      }

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

      const payload = buildPdfPayload(compressedImages, studentName, timestamp);
      embedPayloadMetadata(doc, payload, encodeForPdf, studentName);

      doc.setFontSize(16);
      doc.text(`Name: ${studentName || 'Unknown'}`, PAGE_MARGIN, 40);
      doc.text('Practice AP CSP Create Task Personalized Project Reference', PAGE_MARGIN, 60);

      doc.setFontSize(12);
      const skippedRenderImages = [];
      await renderSegmentImages(doc, compressedImages, skippedRenderImages);

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

          const jsonString = decodeFromPdf(match[1]);
          const data = parsePprJson(jsonString);
          if (!data) {
            showToast('The embedded PPR data was invalid or corrupted.', true);
            return;
          }

          showProgressToast('Processing PDF pages (0 of ?)...');
          const { images, skippedImages } = await extractImagesFromPdf(event.target.result, {
            onProgress: ({ page, totalPages }) => {
              const totalLabel = totalPages ?? '?';
              showProgressToast(`Processing PDF pages (${page} of ${totalLabel})...`);
            }
          });
          hideProgressToast();
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
