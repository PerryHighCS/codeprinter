/**
 * Post-build relocation script.
 *
 * Vite emits standalone module bundles under dist/src/<module> because the source files live
 * in src/<module>. The deployed app routes users to /<module> as the entrypoint for each one,
 * so the compiled assets must live under dist/<module> to keep URLs like
 * https://example.com/ppr or https://example.com/tracelift working when deploying in a static
 * hosting environment like GitHub Pages or Netlify, rather than the default
 * example.com/src/<module>. The deployment script should deploy files from the dist/
 * directory root to serve the / entrypoint and the <module>/ subdirectory for each standalone
 * module.
 *
 * Moving the files after build ensures the production routing structure matches what the
 * browser expects. This relocation step runs automatically at the end of `npm run build`.
 */
import fs from 'fs';
import path from 'path';

const standaloneModules = ['ppr', 'tracelift'];

for (const moduleName of standaloneModules) {
  const srcModulePath = path.join('dist', 'src', moduleName);
  const destModulePath = path.join('dist', moduleName);

  if (!fs.existsSync(srcModulePath)) {
    continue;
  }

  // Clean destination to avoid stale artifacts
  if (fs.existsSync(destModulePath)) {
    fs.rmSync(destModulePath, { recursive: true, force: true });
  }
  fs.mkdirSync(destModulePath, { recursive: true });

  // Copy contents
  fs.readdirSync(srcModulePath).forEach(file => {
    const src = path.join(srcModulePath, file);
    const dest = path.join(destModulePath, file);
    if (fs.lstatSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  });

  // Vite calculated relative asset URLs from dist/src/<module>/index.html.
  // The relocation removes one directory level, so make those references
  // relative to their final dist/<module>/index.html location as well.
  const indexPath = path.join(destModulePath, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  fs.writeFileSync(indexPath, indexHtml.replaceAll('../../', '../'));

  // Remove only the module subdirectory from src, not the entire src directory
  fs.rmSync(srcModulePath, { recursive: true });

  console.log(`✓ Moved ${moduleName} build to dist/${moduleName}/`);
}
