// meat-management-fe/api/quick-price-meta.js
// Serverless function trên Vercel để trả về Open Graph meta tags riêng cho trang Cập nhật giá thịt khi chia sẻ qua Zalo/Facebook
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  try {
    let html = '';

    // 1. Thử đọc file index.html từ các đường dẫn build của Vercel
    const possiblePaths = [
      path.join(process.cwd(), 'dist', 'index.html'),
      path.join(process.cwd(), 'public', 'index.html'),
      path.join(process.cwd(), 'index.html'),
      path.join(__dirname, '..', 'dist', 'index.html'),
      path.join(__dirname, '..', 'public', 'index.html'),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        html = fs.readFileSync(p, 'utf8');
        break;
      }
    }

    // 2. Nếu không tìm thấy file cục bộ, fetch index.html từ chính host hiện tại
    if (!html) {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (host) {
        try {
          const fetchRes = await fetch(`${proto}://${host}/index.html`);
          if (fetchRes.ok) {
            html = await fetchRes.text();
          }
        } catch (fetchErr) {
          console.warn('[OG-Meta] Lỗi fetch loopback index.html:', fetchErr.message);
        }
      }
    }

    // Nếu vẫn không có HTML, chuyển hướng an toàn về /index.html
    if (!html) {
      return res.redirect(302, '/index.html');
    }

    // 3. Thay thế tiêu đề và các thẻ Open Graph sang "Cập nhật giá thịt" cho Zalo/Facebook crawler
    const titleText = 'Cập nhật giá thịt';
    const descText = 'Xem và cập nhật giá thịt nhanh chóng';

    // Thay thế <title>
    if (html.includes('<title>')) {
      html = html.replace(/<title>.*?<\/title>/gi, `<title>${titleText}</title>`);
    } else {
      html = html.replace('</head>', `  <title>${titleText}</title>\n</head>`);
    }

    // Thay thế hoặc thêm meta title
    if (/name=["']title["']/i.test(html)) {
      html = html.replace(/<meta\s+name=["']title["'][^>]*>/gi, `<meta name="title" content="${titleText}" />`);
    } else {
      html = html.replace('</head>', `  <meta name="title" content="${titleText}" />\n</head>`);
    }

    // Thay thế hoặc thêm og:title
    if (/property=["']og:title["']/i.test(html)) {
      html = html.replace(/<meta\s+property=["']og:title["'][^>]*>/gi, `<meta property="og:title" content="${titleText}" />`);
    } else {
      html = html.replace('</head>', `  <meta property="og:title" content="${titleText}" />\n</head>`);
    }

    // Thay thế hoặc thêm meta description
    if (/name=["']description["']/i.test(html)) {
      html = html.replace(/<meta\s+name=["']description["'][^>]*>/gi, `<meta name="description" content="${descText}" />`);
    } else {
      html = html.replace('</head>', `  <meta name="description" content="${descText}" />\n</head>`);
    }

    // Thay thế hoặc thêm og:description
    if (/property=["']og:description["']/i.test(html)) {
      html = html.replace(/<meta\s+property=["']og:description["'][^>]*>/gi, `<meta property="og:description" content="${descText}" />`);
    } else {
      html = html.replace('</head>', `  <meta property="og:description" content="${descText}" />\n</head>`);
    }

    // 4. Trả về HTML đã được chèn meta tags chuẩn
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).send(html);
  } catch (error) {
    console.error('[OG-Meta] Lỗi khi xử lý quick-price metadata:', error);
    return res.redirect(302, '/index.html');
  }
};
