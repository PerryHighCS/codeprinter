import { segmentImages, imageProcessingErrors, MAX_IMAGES_PER_SEGMENT } from './ppr-state.js';

const TOAST_SHOW_DELAY = 10;
const TOAST_HIDE_DELAY = 300;
const TOAST_DURATION = 3000;
const FOCUS_ANIMATION_DURATION = 1600;
const SEGMENT_WARNING_ANIMATION_DURATION = 1500;

let progressToastEl = null;

export function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.zIndex = '9999';
  if (isError) toast.classList.add('error');
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), TOAST_SHOW_DELAY);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => document.body.removeChild(toast), TOAST_HIDE_DELAY);
  }, TOAST_DURATION);
}

export function showProgressToast(message) {
  if (!progressToastEl) {
    progressToastEl = document.createElement('div');
    progressToastEl.className = 'toast persistent';
    document.body.appendChild(progressToastEl);
    const toastEl = progressToastEl;
    setTimeout(() => {
      if (toastEl) toastEl.classList.add('show');
    }, TOAST_SHOW_DELAY);
  }
  progressToastEl.textContent = message;
}

export function setProgressToastMessage(message) {
  if (progressToastEl) {
    progressToastEl.textContent = message;
  } else {
    showProgressToast(message);
  }
}

export function hideProgressToast() {
  if (progressToastEl) {
    const toastToRemove = progressToastEl;
    progressToastEl = null;
    toastToRemove.classList.remove('show');
    setTimeout(() => toastToRemove.remove(), TOAST_HIDE_DELAY);
  }
}

export function updateImageErrorStyles(segmentNum) {
  const container = document.querySelector(`.images-container[data-segment="${segmentNum}"]`);
  if (!container) return;

  const wrappers = container.querySelectorAll('.image-wrapper');
  wrappers.forEach((wrapper, index) => {
    const hasError = Boolean(imageProcessingErrors[segmentNum]?.[index]);
    wrapper.classList.toggle('image-error', hasError);
  });
}

export function scrollToImageError(segmentNum, index) {
  const container = document.querySelector(`.images-container[data-segment="${segmentNum}"]`);
  if (!container) return;
  const wrapper = container.querySelector(`.image-wrapper[data-image-index="${index}"]`);
  if (!wrapper) return;

  wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
  wrapper.classList.add('image-error-focus');
  setTimeout(() => wrapper.classList.remove('image-error-focus'), FOCUS_ANIMATION_DURATION);
}

export function clearSegmentLoadWarnings() {
  document.querySelectorAll('.upload-area.segment-warning').forEach(el => {
    el.classList.remove('segment-warning');
    el.classList.remove('segment-warning-focus');
  });
}

export function flagSegmentLoadWarning(segmentNum, hasWarning = true) {
  const uploadArea = document.querySelector(`.upload-area[data-segment="${segmentNum}"]`);
  if (!uploadArea) return;
  uploadArea.classList.toggle('segment-warning', hasWarning);
}

export function focusSegmentLoadWarning(segmentNum) {
  const uploadArea = document.querySelector(`.upload-area[data-segment="${segmentNum}"]`);
  if (!uploadArea) return;
  uploadArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
  uploadArea.classList.add('segment-warning-focus');
  setTimeout(() => uploadArea.classList.remove('segment-warning-focus'), SEGMENT_WARNING_ANIMATION_DURATION);
}

export function renderImages(segmentNum) {
  const imagesContainer = document.querySelector(`.images-container[data-segment="${segmentNum}"]`);
  const uploadArea = document.querySelector(`.upload-area[data-segment="${segmentNum}"]`);
  if (!imagesContainer || !uploadArea) return;

  const existingWrappers = new Map();
  Array.from(imagesContainer.querySelectorAll('.image-wrapper')).forEach((wrapper) => {
    const idx = Number(wrapper.dataset.imageIndex);
    if (Number.isInteger(idx)) existingWrappers.set(idx, wrapper);
  });

  const ensureWrapper = (index, dataUrl) => {
    let wrapper = existingWrappers.get(index);
    if (!wrapper) {
      wrapper = createImageWrapper(segmentNum, index, dataUrl);
      imagesContainer.appendChild(wrapper);
      existingWrappers.set(index, wrapper);
      return;
    }

    if (wrapper.dataset.imageSrc !== dataUrl) {
      const img = wrapper.querySelector('img');
      if (img) {
        img.src = dataUrl;
        img.alt = `Code screenshot ${index + 1}`;
      }
      wrapper.dataset.imageSrc = dataUrl;
    }
    wrapper.dataset.imageIndex = index;
  };

  segmentImages[segmentNum].forEach((dataUrl, index) => ensureWrapper(index, dataUrl));

  existingWrappers.forEach((wrapper, idx) => {
    if (idx >= segmentImages[segmentNum].length && wrapper.parentNode === imagesContainer) {
      imagesContainer.removeChild(wrapper);
      existingWrappers.delete(idx);
    }
  });

  if (segmentImages[segmentNum].length > 0) {
    uploadArea.classList.add('has-images');
  } else {
    uploadArea.classList.remove('has-images');
  }

  updateImageErrorStyles(segmentNum);
}

function createImageWrapper(segmentNum, index, dataUrl) {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-wrapper';
  wrapper.dataset.imageIndex = index;
  wrapper.dataset.segment = String(segmentNum);
  wrapper.dataset.imageSrc = dataUrl;

  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = `Code screenshot ${index + 1}`;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-button';
  removeBtn.innerHTML = '×';

  wrapper.appendChild(img);
  wrapper.appendChild(removeBtn);
  return wrapper;
}

export function updateImageCount(segmentNum) {
  const imageCount = document.querySelector(`.image-count[data-count="${segmentNum}"]`);
  const count = segmentImages[segmentNum].length;
  imageCount.textContent = `${count} / ${MAX_IMAGES_PER_SEGMENT} images`;

  const uploadArea = document.querySelector(`.upload-area[data-segment="${segmentNum}"]`);
  const uploadButton = uploadArea ? uploadArea.querySelector('.upload-button') : null;
  if (count >= MAX_IMAGES_PER_SEGMENT) {
    uploadArea.style.opacity = '0.6';
    uploadArea.style.cursor = 'not-allowed';
  } else {
    uploadArea.style.opacity = '1';
    uploadArea.style.cursor = 'pointer';
  }
  if (uploadButton) {
    uploadButton.disabled = count >= MAX_IMAGES_PER_SEGMENT;
  }
}
