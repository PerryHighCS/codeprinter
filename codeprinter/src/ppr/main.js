// PPR page main entry point
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';

// Initialize pdfjs worker - use public asset
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

// Import and initialize the PPR module
import { initPPR } from './ppr-module.js';

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initPPR(jsPDF, pdfjsLib);
  });
} else {
  // DOM already loaded
  initPPR(jsPDF, pdfjsLib);
}
