import fs from 'fs';
import path from 'path';

// Move dist/src/ppr to dist/ppr after build
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
  
  // Remove src directory
  fs.rmSync(path.join('dist', 'src'), { recursive: true });
  
  console.log('✓ Moved PPR build to dist/ppr/');
}
