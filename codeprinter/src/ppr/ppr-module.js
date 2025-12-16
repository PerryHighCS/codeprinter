export function initPPR() {
  setupPPR();
}

let isModified = false;
const segmentImages = {
  1: [],
  2: [],
  3: [],
  4: []
};

const imageCompressionState = {
  1: [],
  2: [],
  3: [],
  4: []
};

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

function addImage(dataUrl, segmentNum) {
  segmentImages[segmentNum].push(dataUrl);
  imageCompressionState[segmentNum].push(false);
  renderImages(segmentNum);
  updateImageCount(segmentNum);
  isModified = true;
}

function removeImage(index, segmentNum) {
  segmentImages[segmentNum].splice(index, 1);
  imageCompressionState[segmentNum].splice(index, 1);
  renderImages(segmentNum);
  updateImageCount(segmentNum);
  isModified = true;
}

function renderImages(segmentNum) {
  const imagesContainer = document.querySelector(`.images-container[data-segment="${segmentNum}"]`);
  const uploadArea = document.querySelector(`.upload-area[data-segment="${segmentNum}"]`);

  imagesContainer.innerHTML = '';

  segmentImages[segmentNum].forEach((dataUrl, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';

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
}

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

function applyLoadedData(data) {
  if (!data) return;

  if (data.studentName) {
    document.getElementById('student-name').value = data.studentName;
  }

  if (data.images) {
    for (let segmentNum in data.images) {
      segmentImages[segmentNum] = data.images[segmentNum];
      imageCompressionState[segmentNum] = new Array(segmentImages[segmentNum].length).fill(true);
      renderImages(parseInt(segmentNum, 10));
      updateImageCount(parseInt(segmentNum, 10));
    }
  }

  isModified = false;
}

async function saveWork() {
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

  // Compress and prepare all images for embedding in PDF
  const buildPayload = async () => {
    const compressedImages = {};
    for (let segment = 1; segment <= 4; segment++) {
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
            result = await compressDataUrl(dataUrl, {
              maxWidth: 1600,
              maxHeight: 1600,
              outputType: 'image/png',
            });
          }
          compressedImages[segment].push(result);
        } catch (err) {
          console.warn('Failed to process image, skipping', err);
        }
      }
    }
    return compressedImages;
  };

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  const addImages = async () => {
    const compressedImages = await buildPayload();

    // Build payload with just segment counts
    const payload = {
      studentName,
      segments: Object.keys(compressedImages).reduce((acc, seg) => {
        acc[seg] = compressedImages[seg].length;
        return acc;
      }, {}),
      timestamp,
    };
    const jsonString = JSON.stringify(payload);
    const embedded = encodeForPdf(jsonString);

    doc.setProperties({
      title: 'Practice Personalized Project Reference',
      subject: 'Practice AP CSP Create Task Personalized Project Reference',
      author: studentName || 'Unknown',
      keywords: `PPRDATA:${embedded}`,
    });

    doc.setFontSize(16);
    doc.text(`Name: ${studentName || 'Unknown'}`, margin, 40);
    doc.text('Practice AP CSP Create Task Personalized Project Reference', margin, 60);

    doc.setFontSize(12);

    let y = 90;
    const maxW = pageWidth - margin * 2;
    const maxH = pageHeight - margin * 2;

    // Map segment numbers to their labels
    const segmentLabels = {
      1: 'Procedure\ni.',
      2: 'ii.',
      3: 'List\ni.',
      4: 'ii.'
    };

    for (let segment = 1; segment <= 4; segment++) {
      const imgs = compressedImages[segment] || [];
      if (!imgs.length) continue;
      const segText = segmentLabels[segment] || '';
      
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
              continue;
            }
          }
          
          let scale = Math.min(maxW / props.width, maxH / props.height, 1);
          let w = props.width * scale;
          let h = props.height * scale;

          // Skip images that would be too small to be useful (less than 50px in either dimension)
          if (w < 50 || h < 50) {
            console.warn(`Image ${imgIdx + 1} in segment ${segment} is too small after scaling (${w.toFixed(0)}x${h.toFixed(0)}px). Skipping.`);
            continue;
          }

          // For first image in segment, ensure text and image fit on same page
          if (isFirstImageInSegment) {
            // Calculate height needed for multiline text
            const textLines = segText.split('\n');
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
                console.warn(`Image ${imgIdx + 1} in segment ${segment} is too small even on a fresh page (${w.toFixed(0)}x${h.toFixed(0)}px). Skipping.`);
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
              const baseLabel = (segText || '').split('\n').pop()?.trim();
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
        }
      }

      // Add spacing between segments, but don't create a new page if this is the last segment
      y += 10;
    }
  };

    const hasImages = Object.values(segmentImages).some(a => (a || []).length);
    const finalize = () => {
      const namePart = studentName ? studentName.replace(/\s+/g, '-') : 'Student';
      const fileName = `${namePart}-PPR-${timestamp}.pdf`;
      try {
        doc.save(fileName);
        showToast('PDF created');
      } catch (e) {
        showToast('Failed to save PDF', true);
        console.error(e);
      }
      isModified = false;
      // Restore button
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalContent;
    };

    if (hasImages) {
      addImages().then(finalize).catch((e) => { 
        console.error('Save error', e); 
        finalize(); 
      });
    } else {
      finalize();
    }
  } catch (error) {
    console.error('Save error:', error);
    showToast('Failed to save', true);
    // Restore button on error
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalContent;
  }
}

async function loadWork() {
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
        const data = JSON.parse(jsonText);
        applyLoadedData(data);
        showToast('Work loaded successfully!');
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
          const data = JSON.parse(jsonString);

          // Extract images from PDF
          const images = await extractImagesFromPdf(event.target.result);

          // Reconstruct data with extracted images
          const reconstructedData = {
            studentName: data.studentName,
            images: {},
            timestamp: data.timestamp,
          };

          let imageIdx = 0;
          console.log('Reconstructing data. Segment counts:', data.segments);
          console.log('Extracted images count:', images.length);
          for (let segment = 1; segment <= 4; segment++) {
            const count = data.segments[segment] || 0;
            reconstructedData.images[segment] = [];
            for (let i = 0; i < count && imageIdx < images.length; i++) {
              reconstructedData.images[segment].push(images[imageIdx++]);
            }
            console.log(`Segment ${segment}: assigned ${reconstructedData.images[segment].length} of ${count} expected images`);
          }

          applyLoadedData(reconstructedData);
          showToast('Work loaded from PDF!');
        } catch (error) {
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

function setupPPR() {
  // Setup segments
  for (let i = 1; i <= 4; i++) {
    setupSegment(i);
  }

  // Setup button handlers
  window.saveWork = saveWork;
  window.loadWork = loadWork;

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
