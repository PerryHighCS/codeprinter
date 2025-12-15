// PPR page main entry point
import { initPPR } from './ppr-module.js';

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initPPR();
  });
} else {
  // DOM already loaded
  initPPR();
}
