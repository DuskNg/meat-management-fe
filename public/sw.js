// Service Worker cho Ứng dụng Quản lý Sổ Nợ Thịt
// Chiến lược: Network First cho tài nguyên chính, Cache First cho assets tĩnh (ảnh, font)
// Cơ chế tự cập nhật: So sánh phiên bản cache, phát hiện bản mới và tự reload

const CACHE_VERSION = 'v' + Date.now(); // Tự động tăng phiên bản mỗi lần build
const CACHE_NAME = 'meat-app-' + CACHE_VERSION;
const STATIC_CACHE_NAME = 'meat-app-static-' + CACHE_VERSION;

// Danh sách tài nguyên tĩnh cần cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// ─── SỰ KIỆN INSTALL: Cài đặt Service Worker và cache tài nguyên chính ───────
self.addEventListener('install', (event) => {
  console.log('[SW] Cài đặt Service Worker phiên bản:', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => {
        // Kích hoạt ngay lập tức thay vì chờ tab cũ đóng
        return self.skipWaiting();
      })
  );
});

// ─── SỰ KIỆN ACTIVATE: Xóa cache cũ và tiếp quản tất cả clients ──────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Kích hoạt Service Worker phiên bản:', CACHE_VERSION);
  
  event.waitUntil(
    // Xóa tất cả cache phiên bản cũ
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Xóa cache cũ (không phải phiên bản hiện tại)
              return name.startsWith('meat-app-') && 
                     name !== CACHE_NAME && 
                     name !== STATIC_CACHE_NAME;
            })
            .map((name) => {
              console.log('[SW] Xóa cache cũ:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // Tiếp quản tất cả tabs/windows đang mở ngay lập tức
        return self.clients.claim();
      })
      .then(() => {
        // Thông báo cho tất cả clients để reload lấy bản mới
        return self.clients.matchAll({ type: 'window' });
      })
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
        });
      })
  );
});

// ─── SỰ KIỆN FETCH: Chiến lược Network First cho HTML, Cache First cho assets ─
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Bỏ qua các yêu cầu đến API backend (không cache)
  if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) {
    return;
  }
  
  // Chiến lược cho file HTML chính: Network First (luôn lấy bản mới nhất)
  if (event.request.mode === 'navigate' || 
      event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Lưu bản mới vào cache
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback về cache nếu không có mạng
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('/index.html');
          });
        })
    );
    return;
  }
  
  // Chiến lược cho assets tĩnh (_expo/static, assets): Stale-While-Revalidate
  if (url.pathname.startsWith('/_expo/static/') || 
      url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
          return cached || networkFetch;
        });
      })
    );
    return;
  }
});

// ─── XỬ LÝ TIN NHẮN TỪ CLIENT: Lệnh skipWaiting thủ công từ app ─────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Nhận lệnh SKIP_WAITING từ ứng dụng');
    self.skipWaiting();
  }
});
