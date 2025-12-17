// PDF load functionality - lazy loaded
// Import worker URL statically so Vite can properly bundle it
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

function debugLog(...args) {
  if (import.meta.env.DEV) console.log(...args);
}

export async function createPdfLoader() {
  const pdfjsLib = await import('pdfjs-dist');
  
  // Initialize worker from pdfjs-dist package
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  function decodeFromPdf(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function extractImagesFromPdf(pdfArrayBuffer) {
    debugLog('Starting image extraction from PDF...');
    const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
    debugLog('PDF loaded, pages:', pdf.numPages);
    const images = [];
    const skippedImages = [];

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
      debugLog(`Page ${pageNum}: ${operatorList.fnArray.length} operators`);

      // Extract image objects
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i];
        
        // Check if this is an image paint operation
        if (op === pdfjsLib.OPS.paintImageXObject) {
          try {
            const imageName = operatorList.argsArray[i][0];
            debugLog(`Found image operator: ${imageName}`);
            
            // Wait for the object to be available (pdf.js supports callbacks on get)
            const waitForImageObject = () => {
              const maxWaitMs = 1500;
              let timeoutId;

              const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(
                  () => reject(new Error(`Timed out waiting for image object ${imageName}`)),
                  maxWaitMs
                );
              });

              const objectPromise = new Promise((resolve) => {
                const onObjectReady = (obj) => resolve(obj);
                const immediate = page.objs.get(imageName, onObjectReady);
                if (immediate) {
                  onObjectReady(immediate);
                }
              }).finally(() => clearTimeout(timeoutId));

              return Promise.race([objectPromise, timeoutPromise]);
            };

            let imgData;
            try {
              imgData = await waitForImageObject();
            } catch (timeoutError) {
              skippedImages.push({
                page: pageNum,
                imageName,
                reason: timeoutError?.message || 'Timed out waiting for image data'
              });
              continue;
            }
            
            debugLog(`Image ${imageName}:`, imgData);
            
            if (imgData && imgData.width && imgData.height) {
              // Create canvas to draw the image
              const imgCanvas = document.createElement('canvas');
              imgCanvas.width = imgData.width;
              imgCanvas.height = imgData.height;
              const imgCtx = imgCanvas.getContext('2d');
              
              // Try to render the image data
              if (imgData.data) {
                const imageData = imgCtx.createImageData(imgData.width, imgData.height);
                imageData.data.set(imgData.data);
                imgCtx.putImageData(imageData, 0, 0);
                images.push(imgCanvas.toDataURL('image/png'));
                debugLog(`Extracted image ${images.length}`);
              } else if (imgData.bitmap) {
                // Some images might be bitmaps
                imgCtx.drawImage(imgData.bitmap, 0, 0);
                images.push(imgCanvas.toDataURL('image/png'));
                debugLog(`Extracted bitmap image ${images.length}`);
              }
            }
          } catch (e) {
            console.warn('Failed to extract image:', e);
          }
        }
      }
    }

    debugLog(`Image extraction complete. Total images extracted: ${images.length}. Skipped: ${skippedImages.length}`);
    return { images, skippedImages };
  }

  return {
    decodeFromPdf,
    extractImagesFromPdf
  };
}
