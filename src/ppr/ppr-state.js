// Shared state helpers for the Personalized Project Reference (PPR) module.  
// This module manages segment images, their compression state, processing errors,  
// and cached image dimensions for each PPR segment.  

export const SEGMENT_COUNT = 4;
export const MAX_IMAGES_PER_SEGMENT = 3;
export const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

export const segmentImages = createSegmentMap();
export const imageCompressionState = createSegmentMap();
export const imageProcessingErrors = createSegmentMap();
export const imageDimensions = createSegmentMap();

export function createSegmentMap() {
  const map = {};
  for (let i = 1; i <= SEGMENT_COUNT; i++) {
    map[i] = [];
  }
  return map;
}

export function getCachedImageDimensions(segmentNum, index) {
  const dims = imageDimensions[segmentNum]?.[index];
  if (!dims) return null;
  const { width, height } = dims;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return dims;
}

export function storeImageDimensions(segmentNum, index, dimensions) {
  if (!dimensions) return;
  const { width, height } = dimensions;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  imageDimensions[segmentNum][index] = { width, height };
}

export function setImageProcessingError(segmentNum, index, hasError) {
  imageProcessingErrors[segmentNum][index] = hasError;
}
