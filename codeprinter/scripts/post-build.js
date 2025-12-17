/**
 * Post-build relocation script.
 *
 * Vite emits the PPR bundle under dist/src/ppr because the source files live in src/ppr.
 * Our hosting environment (e.g. Github Pages) serves static assets from dist/ppr without the src
 * prefix, so we copy the compiled files over after every build. This script is executed
 * by the "postbuild" npm script immediately after the Vite build finishes.
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
