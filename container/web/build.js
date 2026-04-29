const JavaScriptObfuscator      = require('javascript-obfuscator');
const { minify: minifyHTML }    = require('html-minifier-terser');
const { minify: minifyJS }      = require('terser');
const fs                        = require('fs');
const path                      = require('path');

const INPUT  = path.join(__dirname, 'views', 'index.ejs');
const OUTPUT = path.join(__dirname, 'views', 'index.min.ejs');

async function build() {
  console.log('🔨 Reading index.ejs...');
  let source = fs.readFileSync(INPUT, 'utf8');

  // ── 1. EXTRACT <script> BLOCK ──────────────────────────────────────────────
  const scriptMatch = source.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    console.error('❌ No <script> block found in index.ejs');
    process.exit(1);
  }
  const rawJS = scriptMatch[1];

  // ── 2. MINIFY JS (terser) ──────────────────────────────────────────────────
  console.log('⚙️  Minifying JS...');
  const minified = await minifyJS(rawJS, {
    compress: true,
    mangle:   true,
  });

  // ── 3. OBFUSCATE JS ────────────────────────────────────────────────────────
  console.log('🔒 Obfuscating JS...');
  const obfuscated = JavaScriptObfuscator.obfuscate(minified.code, {
    compact:                          true,
    controlFlowFlattening:            true,
    controlFlowFlatteningThreshold:   0.5,
    deadCodeInjection:                true,
    deadCodeInjectionThreshold:       0.2,
    stringEncoding:                   true,
    stringEncodingThreshold:          0.5,
    selfDefending:                    true,
    disableConsoleOutput:             true,
    rotateStringArray:                true,
    shuffleStringArray:               true,
    splitStrings:                     true,
    splitStringsChunkLength:          5,
  }).getObfuscatedCode();

  // ── 4. INJECT PROTECTION + REPLACE <script> BLOCK ─────────────────────────
  const protectedJS = `
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => {
      if (
        e.keyCode === 123 ||
        (e.ctrlKey && e.shiftKey && e.keyCode === 73) ||
        (e.ctrlKey && e.shiftKey && e.keyCode === 74) ||
        (e.ctrlKey && e.keyCode === 85) ||
        (e.ctrlKey && e.keyCode === 83)
      ) { e.preventDefault(); return false; }
    });
    (function devToolsBlock() {
      const check = () => {
        if (window.outerHeight - window.innerHeight > 200)
          document.body.innerHTML = '<h1 style="color:#fff;text-align:center;margin-top:40vh">Access Denied</h1>';
      };
      setInterval(check, 1000);
    })();
    ${obfuscated}
  `;

  source = source.replace(
    /<script>([\s\S]*?)<\/script>/,
    `<script>${protectedJS}</script>`
  );

  // ── 5. MINIFY HTML + CSS ───────────────────────────────────────────────────
  console.log('🗜️  Minifying HTML & CSS...');
  const final = await minifyHTML(source, {
    collapseWhitespace:        true,
    removeComments:            true,
    removeRedundantAttributes: true,
    minifyCSS:                 true,
    minifyJS:                  false, // already handled above
  });

  // ── 6. WRITE OUTPUT ────────────────────────────────────────────────────────
  fs.writeFileSync(OUTPUT, final, 'utf8');

  const originalSize = Buffer.byteLength(source,  'utf8');
  const finalSize    = Buffer.byteLength(final,    'utf8');
  const saving       = (((originalSize - finalSize) / originalSize) * 100).toFixed(1);

  console.log(`\n✅ Build complete → views/index.min.ejs`);
  console.log(`📦 Original : ${(originalSize / 1024).toFixed(1)} KB`);
  console.log(`📦 Protected: ${(finalSize    / 1024).toFixed(1)} KB`);
  console.log(`💾 Reduced  : ${saving}%\n`);
}

build().catch(err => {
  console.error('❌ Build error:', err);
  process.exit(1);
});
