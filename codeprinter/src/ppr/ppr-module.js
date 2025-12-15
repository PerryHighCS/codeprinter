let jsPDFLib, pdfjsLib;

export function initPPR(jsPDF, pdfjs) {
  jsPDFLib = jsPDF;
  pdfjsLib = pdfjs;
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

function encodeForPdf(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decodeFromPdf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function compressDataUrl(dataUrl, { maxWidth = 1600, maxHeight = 1600, outputType = 'image/png' } = {}) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(maxWidth / width, maxHeight / height, 1);
        const targetW = Math.max(1, Math.round(width * scale));
        const targetH = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const out = canvas.toDataURL(outputType);
        resolve(out);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch (e) {
      console.warn('Compression error, using original image', e);
      resolve(dataUrl);
    }
  });
}

// Extract images from PDF using pdfjs
async function extractImagesFromPdf(pdfArrayBuffer) {
  console.log('Starting image extraction from PDF...');
  const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
  console.log('PDF loaded, pages:', pdf.numPages);
  const images = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    
    // Render the page to ensure all objects are loaded
    const viewport = page.getViewport({ scale: 1.0 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({ canvasContext: ctx, viewport }).promise;
    
    // Now get the operator list
    const operatorList = await page.getOperatorList();
    console.log(`Page ${pageNum}: ${operatorList.fnArray.length} operators`);

    // Extract image objects
    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const op = operatorList.fnArray[i];
      
      // Check if this is an image paint operation (85 = paintImageXObject)
      if (op === 85 || op === pdfjsLib.OPS.paintImageXObject) {
        try {
          const imageName = operatorList.argsArray[i][0];
          console.log(`Found image operator: ${imageName}`);
          
          // Wait for the object to be available
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const imgData = page.objs.get(imageName);
          console.log(`Image ${imageName}:`, imgData);
          
          if (imgData && imgData.width && imgData.height) {
            // Create canvas to draw the image
            const imgCanvas = document.createElement('canvas');
            imgCanvas.width = imgData.width;
            imgCanvas.height = imgData.height;
            const imgCtx = imgCanvas.getContext('2d');
            
            // Try to render the image data
            if (imgData.data) {
              const imageData = imgCtx.createImageData(imgData.width, imgData.height);
              const data = imgData.data;
              
              for (let j = 0; j < data.length; j++) {
                imageData.data[j] = data[j];
              }
              
              imgCtx.putImageData(imageData, 0, 0);
              images.push(imgCanvas.toDataURL('image/png'));
              console.log(`Extracted image ${images.length}`);
            } else if (imgData.bitmap) {
              // Some images might be bitmaps
              imgCtx.drawImage(imgData.bitmap, 0, 0);
              images.push(imgCanvas.toDataURL('image/png'));
              console.log(`Extracted bitmap image ${images.length}`);
            }
          }
        } catch (e) {
          console.warn('Failed to extract image:', e);
        }
      }
    }
  }

  console.log(`Image extraction complete. Total images extracted: ${images.length}`);
  return images;
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
  if (!jsPDFLib) {
    showToast('PDF library failed to load.', true);
    return;
  }

  const saveBtn = document.querySelector('.action-button.save');
  const originalContent = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '⏳ Saving...';

  // Allow UI to update before heavy processing
  await new Promise(resolve => setTimeout(resolve, 50));

  try {
    const jsPDF = jsPDFLib;
    const studentName = document.getElementById('student-name').value;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

  // Build payload with only segment image counts
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

    let y = 130;
    const maxW = pageWidth - margin * 2;
    const maxH = pageHeight - margin * 2;

    for (let segment = 1; segment <= 4; segment++) {
      const imgs = compressedImages[segment] || [];
      if (!imgs.length) continue;
      let segText = '';

      if (segment == 1) {
        segText = 'i.';
      } else if (segment == 2) {
        segText = 'ii.';
      } else if (segment == 3) {
        segText = 'i.';
      } else if (segment == 4) {
        segText = 'ii.';
      }
      // For first image in segment, check if we need a new page
      let isFirstImageInSegment = true;
      
      for (let imgIdx = 0; imgIdx < imgs.length; imgIdx++) {
        const compressed = imgs[imgIdx];
        
        try {
          let props;
          try {
            props = doc.getImageProperties(compressed);
          } catch {
            props = { width: 800, height: 600 };
          }
          
          let scale = Math.min(maxW / props.width, maxH / props.height, 1);
          let w = Math.max(1, props.width * scale);
          let h = Math.max(1, props.height * scale);

          // For first image in segment, ensure text and image fit on same page
          if (isFirstImageInSegment) {
            const spaceAvailable = pageHeight - margin - y;
            if (h > spaceAvailable) {
              // Move to new page
              doc.addPage();
              y = margin;
              // Now scale if needed to fit on the fresh page
              const maxImageHeight = pageHeight - margin * 2 - 16; // Account for text
              scale = Math.min(maxW / props.width, maxImageHeight / props.height, 1);
              w = Math.max(1, props.width * scale);
              h = Math.max(1, props.height * scale);
            }
            // Add segment text right before first image
            doc.text(segText, margin, y);
            y += 16;
            isFirstImageInSegment = false;
          } else {
            // For subsequent images, add page break if needed
            if (y + h > pageHeight - margin) {
              doc.addPage();
              y = margin;
              doc.text(`${segText} (cont.)`, margin, y);
              y += 16;
            }
          }

          doc.addImage(compressed, 'PNG', margin, y, w, h, undefined, 'FAST');
          y += h + 14;
        } catch (err) {
          console.error('Image add error', err);
        }
      }

      y += 10;
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
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
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const bytes = new Uint8Array(event.target.result);
          let text = '';
          for (let i = 0; i < bytes.length; i++) {
            text += String.fromCharCode(bytes[i]);
          }

          const match = text.match(/PPRDATA:([A-Za-z0-9+/=]+)/);
          if (!match) {
            showToast('No metadata found in PDF. Attempting image extraction...', false);
            // Try to extract images without metadata
            try {
              const images = await extractImagesFromPdf(event.target.result);
              if (images.length > 0) {
                // Distribute images across segments evenly or by some heuristic
                const perSegment = Math.ceil(images.length / 4);
                for (let segment = 1; segment <= 4; segment++) {
                  const start = (segment - 1) * perSegment;
                  const end = Math.min(start + perSegment, images.length);
                  for (let i = start; i < end; i++) {
                    addImage(images[i], segment);
                  }
                }
                isModified = false;
                showToast('Images extracted from PDF');
              } else {
                showToast('No metadata or images found in PDF.', true);
              }
            } catch (extractErr) {
              showToast('Could not extract images from PDF.', true);
              console.error(extractErr);
            } finally {
              loadBtn.disabled = false;
              loadBtn.innerHTML = originalContent;
            }
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
