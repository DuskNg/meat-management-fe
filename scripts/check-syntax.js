// meat-management-fe/scripts/check-syntax.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const babel = require('@babel/core');

function getFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.expo' && file !== 'dist' && file !== '.git') {
        results = results.concat(getFiles(fullPath));
      }
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      results.push(fullPath);
    }
  });
  return results;
}

const rootDir = path.resolve(__dirname, '..');
const srcFiles = getFiles(path.join(rootDir, 'src'));
const appFiles = getFiles(path.join(rootDir, 'app'));
const allFiles = [...srcFiles, ...appFiles];

console.log(`[FE CHECK] Đang kiểm tra cú pháp và biên dịch cho ${allFiles.length} file JS/JSX...`);

let errors = 0;
allFiles.forEach((f) => {
  try {
    babel.transformFileSync(f, { presets: ['babel-preset-expo'] });
  } catch (err) {
    console.error(`❌ [LỖI BIÊN DỊCH]: ${path.relative(rootDir, f)}`);
    console.error(`   -> ${err.message}`);
    errors++;
  }
});

if (errors > 0) {
  console.error(`\n💥 THẤT BẠI: Phát hiện ${errors} file bị lỗi cú pháp/biên dịch!`);
  process.exit(1);
} else {
  console.log(`✅ [FE CHECK] Toàn bộ ${allFiles.length} file Frontend COMPILES OK (100% hợp lệ).`);
}
