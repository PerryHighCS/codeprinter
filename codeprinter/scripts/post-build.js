/**
 * Post-build relocation script.
 *
 * Vite emits the PPR bundle under dist/src/ppr because the source files live in src/ppr.
 * The deployed app routes users to /ppr as the entrypoint for this module, so the compiled
 * assets must live under dist/ppr to keep URLs like https://example.com/ppr working in a 
 * static hosting environment like GitHub Pages or Netlify.
 * Moving the files after build ensures the production routing structure matches what the 
 * browser expects. This relocation step runs automatically at the end of `npm run build`.
 */
import fs from 'fs';
import path from 'path';

const srcPprPath = path.join('dist', 'src', 'ppr');
const destPprPath = path.join('dist', 'ppr');

if (fs.existsSync(srcPprPath)) {
  // Ensure dest directory exists
  if (!fs.existsSync(destPprPath)) {
    fs.mkdirSync(destPprPath, { recursive: true });
  }
  
  // Copy contents
  fs.readdirSync(srcPprPath).forEach(file => {
    const src = path.join(srcPprPath, file);
    const dest = path.join(destPprPath, file);
    if (fs.lstatSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  });
  
  // Remove only the ppr subdirectory from src, not the entire src directory
  fs.rmSync(srcPprPath, { recursive: true });
  
  console.log('✓ Moved PPR build to dist/ppr/');
}
