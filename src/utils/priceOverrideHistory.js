// meat-management-fe/src/utils/priceOverrideHistory.js
// Quản lý theo dõi vết các lần sửa giá chọn "Chỉ lần này" để gợi ý chuyển sang "Cập nhật từ bây giờ"
import { Platform } from 'react-native';

const STORAGE_PREFIX = 'meat_price_override_history_';

// Cache trong RAM để đọc/ghi tức thì, không bị độ trễ
const memoryCache = new Map();

/**
 * Đọc dữ liệu từ bộ nhớ cục bộ
 */
const getStoredData = (key) => {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        memoryCache.set(key, parsed);
        return parsed;
      }
    } catch (_) {}
  }
  return null;
};

/**
 * Lưu dữ liệu vào bộ nhớ cục bộ
 */
const setStoredData = (key, data) => {
  memoryCache.set(key, data);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (_) {}
  }
};

/**
 * Xóa dữ liệu bộ nhớ
 */
const removeStoredData = (key) => {
  memoryCache.delete(key);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }
};

/**
 * Tạo storage key cho một cặp khách hàng - sản phẩm
 */
export const makeOverrideKey = (customerId, productId) => {
  return `${STORAGE_PREFIX}${customerId || 'all'}_${productId}`;
};

/**
 * Kiểm tra xem trong các mặt hàng thay đổi giá, có mặt hàng nào đã có 2 lần liên tiếp trước đó
 * sửa thành CÙNG MỘT GIÁ và đều bấm "Chỉ lần này" hay không.
 *
 * @param {string} customerId
 * @param {Array} changedItems Danh sách các món thay đổi giá { productId, newPrice, productName, ... }
 * @returns {Array} Danh sách các món thỏa mãn điều kiện chuỗi (đã có 2 lần trước cùng giá)
 */
export const checkStreakBeforeOneTime = (customerId, changedItems = []) => {
  if (!customerId || !Array.isArray(changedItems) || changedItems.length === 0) {
    return [];
  }

  const streakItems = [];

  for (const item of changedItems) {
    const prodId = item.productId || item.id;
    const newPrice = Number(item.newPrice);
    if (!prodId || isNaN(newPrice)) continue;

    const key = makeOverrideKey(customerId, prodId);
    const history = getStoredData(key);

    // Nếu trước đó đã ghi nhận lịch sử cùng một mức giá và số lần liên tiếp >= 2
    if (history && Number(history.price) === newPrice && Number(history.count) >= 2) {
      streakItems.push({
        productId: prodId,
        productName: item.productName || item.name || 'Mặt hàng',
        price: newPrice,
        count: Number(history.count),
      });
    }
  }

  return streakItems;
};

/**
 * Ghi nhận thêm 1 lần bấm "Chỉ lần này" cho danh sách các món thay đổi giá.
 * - Nếu giá mới giống giá lần trước: Tăng count + 1.
 * - Nếu giá mới khác giá lần trước: Reset count = 1 với giá mới.
 *
 * @param {string} customerId
 * @param {Array} changedItems
 */
export const recordOneTimeOverride = (customerId, changedItems = []) => {
  if (!customerId || !Array.isArray(changedItems) || changedItems.length === 0) {
    return;
  }

  for (const item of changedItems) {
    const prodId = item.productId || item.id;
    const newPrice = Number(item.newPrice);
    if (!prodId || isNaN(newPrice)) continue;

    const key = makeOverrideKey(customerId, prodId);
    const prev = getStoredData(key);

    let nextCount = 1;
    if (prev && Number(prev.price) === newPrice) {
      nextCount = (Number(prev.count) || 1) + 1;
    }

    setStoredData(key, {
      price: newPrice,
      count: nextCount,
      updatedAt: Date.now(),
    });
  }
};

/**
 * Xóa vết lịch sử khi người dùng chọn "Cập nhật từ bây giờ" (vì giá đã được lưu chính thức)
 *
 * @param {string} customerId
 * @param {Array} changedItems
 */
export const clearOverrideHistory = (customerId, changedItems = []) => {
  if (!customerId || !Array.isArray(changedItems) || changedItems.length === 0) {
    return;
  }

  for (const item of changedItems) {
    const prodId = item.productId || item.id;
    if (!prodId) continue;
    const key = makeOverrideKey(customerId, prodId);
    removeStoredData(key);
  }
};
