// PDF save functionality - lazy loaded plus rendering helpers.
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

const PDF_HEADER_FONT_SIZE = 16;
const PDF_CONTENT_FONT_SIZE = 12;
const PDF_METADATA_KEYWORD_PREFIX = 'PPRDATA:';
const MIN_RENDERED_IMAGE_SIZE = 10; // Minimum width/height in pixels to render in PDF

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
 * Encapsulates PDF-saving helpers so the main module can wire dependencies cleanly.
 */
export function createPdfSavePipeline(deps) {
  const {
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
  } = deps;

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

          if (isFirstImageInSegment) {
            const textLines = segLines;
            const textHeight = textLines.length * PDF_LAYOUT.textLineHeightPt;
            const spaceAvailable = pageHeight - margin - y;

            if (h + textHeight > spaceAvailable) {
              doc.addPage();
              currentPageNumber = resolvePageNumber();
              y = margin;
              const maxImageHeight = pageHeight - margin * 2 - textHeight;
              scale = Math.min(maxW / props.width, maxImageHeight / props.height, 1);
              w = props.width * scale;
              h = props.height * scale;
            }
            for (const line of textLines) {
              doc.text(line, margin, y);
              y += PDF_LAYOUT.textLineHeightPt;
            }
            isFirstImageInSegment = false;
          } else if (y + h > pageHeight - margin) {
            doc.addPage();
            currentPageNumber = resolvePageNumber();
            y = margin;
            const lastLine = segLines[segLines.length - 1];
            const baseLabel = typeof lastLine === 'string' ? lastLine.trim() : '';
            if (baseLabel) {
              const contText = `${baseLabel} (cont.)`;
              doc.text(contText, margin, y);
              y += PDF_LAYOUT.textLineHeightPt;
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

      y += PDF_LAYOUT.segmentGapPt;
    }
  }

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

  return {
    generatePdfDocument
  };
}
