// meat-management-fe/src/utils/invoiceDraftStorage.js
// Quản lý lưu trữ bản nháp ảnh & video hóa đơn bằng IndexedDB
// Sử dụng IndexedDB để lưu trữ an toàn chuỗi Base64 dung lượng lớn (hàng chục đến hàng trăm MB),
// khắc phục hoàn toàn giới hạn 5MB của localStorage.

const DB_NAME = 'MeatManagementInvoiceDraftDB';
const DB_VERSION = 1;
const STORE_NAME = 'invoice_drafts';
const DRAFT_KEY = 'active_upload_draft';

// Biến lưu trữ tạm trên bộ nhớ trong trường hợp môi trường không hỗ trợ IndexedDB
let memoryFallbackDraft = null;

/**
 * Mở kết nối tới IndexedDB
 * @returns {Promise<IDBDatabase|null>}
 */
const openIndexedDB = () => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      // Môi trường không có IndexedDB (Node.js hoặc môi trường đặc biệt)
      return resolve(null);
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.warn('[INVOICE DRAFT] Lỗi khi mở IndexedDB:', event.target.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('[INVOICE DRAFT] Ngoại lệ khi mở IndexedDB:', err);
      resolve(null);
    }
  });
};

/**
 * Lưu dữ liệu bản nháp hóa đơn vào IndexedDB
 * @param {Object} draftData { imageList, batchCustomer, batchDateStr, savedAt }
 * @returns {Promise<boolean>}
 */
export const saveInvoiceDraft = async (draftData) => {
  try {
    const dataToSave = {
      ...draftData,
      savedAt: draftData.savedAt || Date.now(),
    };

    const db = await openIndexedDB();
    if (!db) {
      memoryFallbackDraft = dataToSave;
      return true;
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(dataToSave, DRAFT_KEY);

        request.onsuccess = () => {
          resolve(true);
        };

        request.onerror = (event) => {
          console.error('[INVOICE DRAFT] Lỗi khi lưu bản nháp:', event.target.error);
          // Lưu dự phòng vào bộ nhớ tạm
          memoryFallbackDraft = dataToSave;
          resolve(false);
        };

        transaction.oncomplete = () => {
          db.close();
        };
      } catch (innerErr) {
        console.error('[INVOICE DRAFT] Lỗi transaction khi lưu:', innerErr);
        memoryFallbackDraft = dataToSave;
        resolve(false);
      }
    });
  } catch (err) {
    console.error('[INVOICE DRAFT] Ngoại lệ khi lưu bản nháp:', err);
    return false;
  }
};

/**
 * Đọc dữ liệu bản nháp hóa đơn đang lưu
 * @returns {Promise<Object|null>}
 */
export const loadInvoiceDraft = async () => {
  try {
    const db = await openIndexedDB();
    if (!db) {
      return memoryFallbackDraft;
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(DRAFT_KEY);

        request.onsuccess = (event) => {
          const result = event.target.result || null;
          resolve(result);
        };

        request.onerror = (event) => {
          console.error('[INVOICE DRAFT] Lỗi khi tải bản nháp:', event.target.error);
          resolve(memoryFallbackDraft);
        };

        transaction.oncomplete = () => {
          db.close();
        };
      } catch (innerErr) {
        console.error('[INVOICE DRAFT] Lỗi transaction khi đọc:', innerErr);
        resolve(memoryFallbackDraft);
      }
    });
  } catch (err) {
    console.error('[INVOICE DRAFT] Ngoại lệ khi tải bản nháp:', err);
    return null;
  }
};

/**
 * Xóa sạch bản nháp hóa đơn sau khi đã lưu thành công hoặc người dùng hủy
 * @returns {Promise<boolean>}
 */
export const clearInvoiceDraft = async () => {
  try {
    memoryFallbackDraft = null;
    const db = await openIndexedDB();
    if (!db) return true;

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(DRAFT_KEY);

        request.onsuccess = () => {
          resolve(true);
        };

        request.onerror = (event) => {
          console.error('[INVOICE DRAFT] Lỗi khi xóa bản nháp:', event.target.error);
          resolve(false);
        };

        transaction.oncomplete = () => {
          db.close();
        };
      } catch (innerErr) {
        console.error('[INVOICE DRAFT] Lỗi transaction khi xóa:', innerErr);
        resolve(false);
      }
    });
  } catch (err) {
    console.error('[INVOICE DRAFT] Ngoại lệ khi xóa bản nháp:', err);
    return false;
  }
};
