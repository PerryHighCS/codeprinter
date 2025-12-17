import { SEGMENT_COUNT, segmentImages } from './ppr-state.js';
import {
  showToast,
  showProgressToast,
  setProgressToastMessage,
  hideProgressToast,
  flagSegmentLoadWarning,
  focusSegmentLoadWarning
} from './ppr-ui.js';

export const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const MAX_IMAGES_PER_SEGMENT = 3;

export function isAllowedImageFile(file) {
  if (!file || typeof file.name !== 'string') return false;
  const lowerName = file.name.toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

const pluralizeImages = (count, singular = 'image was', plural = 'images were') =>
  count === 1 ? singular : plural;

/**
 * Creates file-handling helpers, wiring all state/UI dependencies so the core module stays focused.
 * @param {{
 *  addImage:(dataUrl:string,segment:number)=>void,
 *  handleSegmentImagesClick:(event:MouseEvent)=>void,
 *  parsePprJson:(json:string)=>any,
 *  applyLoadedData:(data:object)=>void,
 *  generatePdfDocument:(args:any)=>Promise<void>,
 *  markWorkspaceUnmodified:()=>void,
 *  maxImagesPerSegment?:number,
 *  uiUpdateDelay?:number
 * }} options
 */
export function createFileHandling({
  addImage,
  handleSegmentImagesClick,
  parsePprJson,
  applyLoadedData,
  generatePdfDocument,
  markWorkspaceUnmodified,
  maxImagesPerSegment = MAX_IMAGES_PER_SEGMENT,
  uiUpdateDelay = 50
}) {
  if (typeof addImage !== 'function') throw new Error('addImage handler is required');
  if (typeof handleSegmentImagesClick !== 'function') throw new Error('handleSegmentImagesClick handler is required');
  if (typeof parsePprJson !== 'function') throw new Error('parsePprJson function is required');
  if (typeof applyLoadedData !== 'function') throw new Error('applyLoadedData function is required');
  if (typeof generatePdfDocument !== 'function') throw new Error('generatePdfDocument function is required');
  if (typeof markWorkspaceUnmodified !== 'function') throw new Error('markWorkspaceUnmodified function is required');

  function handleFiles(files, segmentNum) {
    const remainingSlots = maxImagesPerSegment - segmentImages[segmentNum].length;
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
    const filesToAdd = validationSummary.valid.slice(0, Math.max(remainingSlots, 0));

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
        `Only ${filesToAdd.length} ${pluralizeImages(filesToAdd.length)} added. Each segment is limited to ${maxImagesPerSegment} images.`,
        true
      );
    }
  }

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
      if (segmentImages[segmentNum].length < maxImagesPerSegment) {
        fileInput.click();
      } else {
        showToast(`This segment already has ${maxImagesPerSegment} images. Remove one before adding another.`, true);
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

      if (segmentImages[segmentNum].length >= maxImagesPerSegment) {
        showToast(`This segment already has ${maxImagesPerSegment} images. Remove one before adding another.`, true);
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

  async function savePprPdf() {
    const saveBtn = document.querySelector('.action-button.save');
    if (!saveBtn) return;
    const originalContent = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ Saving...';
    showProgressToast('Preparing PDF...');
    const updateSaveProgress = async (msg) => {
      setProgressToastMessage(msg);
      await new Promise(requestAnimationFrame);
    };

    await new Promise(resolve => setTimeout(resolve, uiUpdateDelay));

    try {
      const { createPdfSaver } = await import('./pdf-saver.js');
      const { jsPDF, compressDataUrl, encodeForPdf } = await createPdfSaver();

      const studentName = document.getElementById('student-name').value;
      const timestamp = new Date()
        .toISOString()
        .split('.')[0]
        .replace(/:/g, '-')
        .replace('T', '_');

      const doc = new jsPDF({ unit: 'pt', format: 'letter' });

      const hasImages = Object.values(segmentImages).some(a => (a || []).length);
      const finalize = (shouldSavePdf = true) => {
        const namePart = studentName ? studentName.replace(/\s+/g, '-') : 'Student';
        const fileName = `${namePart}-PPR-${timestamp}.pdf`;
        if (shouldSavePdf) {
          try {
            doc.save(fileName);
            showToast('PDF created');
            markWorkspaceUnmodified();
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
          .then(() => finalize(true))
          .catch((e) => {
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
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalContent;
    }
  }

  async function loadPprPdf() {
    const loadBtn = document.querySelector('.action-button.load');
    if (!loadBtn) return;
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
        const { createPdfLoader } = await import('./pdf-loader.js');
        const { extractImagesFromPdf, readEmbeddedPprData } = await createPdfLoader();

        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const pdfArrayBuffer = event.target.result;
            const embeddedData = await readEmbeddedPprData(pdfArrayBuffer.slice(0));
            if (!embeddedData) {
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
                aliasMeta.set(alias, { ...aliasMeta.get(alias), page, order });
              });
            }

            const reconstructedData = { studentName: data.studentName || '', images: {} };
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
            const missingImagesBySegment = [];
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

            const missingImages = [];
            for (let segment = 1; segment <= SEGMENT_COUNT; segment++) {
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

            applyLoadedData(reconstructedData);

            if (segmentsWithMissingImages.length) {
              const uniqueSegments = [...new Set(segmentsWithMissingImages)];
              uniqueSegments.forEach(seg => flagSegmentLoadWarning(seg, true));
              focusSegmentLoadWarning(uniqueSegments[0]);
            }

            if (notices.length) {
              const isError = missingImages.length > 0 || skippedImages.length > 0;
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

  return {
    setupSegment,
    savePprPdf,
    loadPprPdf
  };
}
