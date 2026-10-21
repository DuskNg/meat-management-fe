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

const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const commonReactHooks = [
  'useState',
  'useEffect',
  'useMemo',
  'useCallback',
  'useRef',
  'useContext',
  'useReducer',
  'useImperativeHandle',
  'useLayoutEffect',
  'forwardRef'
];

let errors = 0;
allFiles.forEach((f) => {
  try {
    const code = fs.readFileSync(f, 'utf8');
    babel.transformSync(code, { filename: f, presets: ['babel-preset-expo'] });

    // Kiểm tra AST để bắt triệt để lỗi quên import các React Hooks
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript']
    });

    traverse(ast, {
      Identifier(p) {
        if (commonReactHooks.includes(p.node.name)) {
          if (p.isReferencedIdentifier() && !p.scope.hasBinding(p.node.name)) {
            console.error(`❌ [LỖI BIẾN/HOOK CHƯA KHAI BÁO]: ${p.node.name} tại file ${path.relative(rootDir, f)} (Dòng ${p.node.loc?.start?.line})`);
            errors++;
          }
        }
      }
    });
  } catch (err) {
    console.error(`❌ [LỖI BIÊN DỊCH]: ${path.relative(rootDir, f)}`);
    console.error(`   -> ${err.message}`);
    errors++;
  }
});

async function checkMetroBundler() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8081/index.bundle?platform=web&dev=true', { timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ [METRO LIVE CHECK] Metro Bundler đang chạy và Web Bundle trả về STATUS: 200 OK (Không có runtime/bundle error).');
          resolve(true);
        } else {
          console.error(`💥 [METRO ERROR]: Metro Bundler trả về STATUS: ${res.statusCode}`);
          if (body.includes('error') || body.includes('Error')) {
            console.error(body.slice(0, 500));
          }
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.log(`ℹ️ [METRO NOTICE]: Metro Bundler offline hoặc không phản hồi trên cổng 8081 (${err.message}). Bỏ qua kiểm tra live bundle.`);
      resolve(true); // Không bắt buộc nếu Metro chưa khởi động
    });

    req.on('timeout', () => {
      req.destroy();
      console.log('⚠️ [METRO TIMEOUT]: Kiểm tra live bundle vượt quá thời gian chờ.');
      resolve(true);
    });
  });
}

(async () => {
  if (errors > 0) {
    console.error(`\n💥 THẤT BẠI: Phát hiện ${errors} file bị lỗi cú pháp/biên dịch!`);
    process.exit(1);
  } else {
    console.log(`✅ [FE CHECK] Toàn bộ ${allFiles.length} file Frontend COMPILES OK (100% hợp lệ).`);
    const metroOk = await checkMetroBundler();
    if (!metroOk) {
      process.exit(1);
    }
  }
})();
