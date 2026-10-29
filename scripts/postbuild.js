import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error('dist directory does not exist!');
  process.exit(1);
}

const indexHtmlPath = path.join(distDir, 'index.html');
if (!fs.existsSync(indexHtmlPath)) {
  console.error('dist/index.html does not exist!');
  process.exit(1);
}

const indexContent = fs.readFileSync(indexHtmlPath, 'utf8');

// List of routes to support for direct navigation on static hosting
const routes = [
  'register',
  'admin',
  'admin-login',
  'student',
  'student-login',
  'kiosk',
  'circulation',
  'books',
];

// 1. Always create 404.html as a fallback for static web servers / CDNs
fs.writeFileSync(path.join(distDir, '404.html'), indexContent, 'utf8');
console.log('✓ Created dist/404.html for universal SPA fallback');

// 2. For each route, ensure <route>/index.html and <route>.html exist
routes.forEach((route) => {
  const routeDir = path.join(distDir, route);
  if (!fs.existsSync(routeDir)) {
    fs.mkdirSync(routeDir, { recursive: true });
  }

  const routeIndexPath = path.join(routeDir, 'index.html');
  if (!fs.existsSync(routeIndexPath)) {
    fs.writeFileSync(routeIndexPath, indexContent, 'utf8');
    console.log(`✓ Created dist/${route}/index.html`);
  } else {
    console.log(`✓ Confirmed dist/${route}/index.html exists`);
  }

  // Also create cleanUrl variant <route>.html
  const routeCleanPath = path.join(distDir, `${route}.html`);
  fs.writeFileSync(routeCleanPath, fs.readFileSync(routeIndexPath, 'utf8'), 'utf8');
  console.log(`✓ Created dist/${route}.html`);
});

console.log('Postbuild static route generation completed successfully.');
