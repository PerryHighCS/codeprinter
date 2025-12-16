// PDF load functionality - lazy loaded
// Import worker URL statically so Vite can properly bundle it
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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

  return {
    decodeFromPdf,
    extractImagesFromPdf
  };
}
