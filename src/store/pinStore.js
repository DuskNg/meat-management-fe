// meat-management-fe/src/store/pinStore.js
// Store quản lý mã PIN bảo vệ các thao tác tài chính nhạy cảm
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from './authStore';
import { api } from '../api/client';

// ─── Helper: tương thích đa nền tảng (Web vs Native) ─────────────────────────
const isWeb = Platform.OS === 'web';

const setItem = async (key, value) => {
  if (isWeb) {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

const getItem = async (key) => {
  if (isWeb) {
    return localStorage.getItem(key);
  } else {
    return await SecureStore.getItemAsync(key);
  }
};

const deleteItem = async (key) => {
  if (isWeb) {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
};

// Lấy userId hiện tại từ authStore để quản lý PIN độc lập cho từng tài khoản
const getUserId = () => {
  try {
    return useAuthStore.getState().user?.id || 'default';
  } catch (e) {
    return 'default';
  }
};

// Định nghĩa các khoá lưu trữ động theo userId
const getPinVerifiedAtKey = () => `meat_pin_verified_at_${getUserId()}`;
const getPinSessionHoursKey = () => `meat_pin_session_hours_${getUserId()}`;

// ─── Các hàm công khai của pinStore ──────────────────────────────────────────

/**
 * Kiểm tra người dùng đã cài mã PIN chưa (kiểm tra từ trạng thái profile lưu ở authStore)
 * @returns {Promise<boolean>}
 */
export const hasPin = async () => {
  try {
    return !!useAuthStore.getState().user?.hasPin;
  } catch (e) {
    return false;
  }
};

/**
 * Lấy số giờ phiên PIN (mặc định 12 giờ)
 * @returns {Promise<number>}
 */
export const getSessionHours = async () => {
  const raw = await getItem(getPinSessionHoursKey());
  const parsed = parseInt(raw, 10);
  return (!isNaN(parsed) && parsed > 0) ? parsed : 12; // Mặc định 12 giờ
};

/**
 * Cài đặt số giờ phiên PIN
 * @param {number} hours - Số giờ (ví dụ: 12 hoặc 24)
 */
export const setSessionHours = async (hours) => {
  await setItem(getPinSessionHoursKey(), hours.toString());
};

/**
 * Kiểm tra phiên PIN hiện tại còn hiệu lực không (lưu trữ thời gian xác thực cục bộ)
 * @returns {Promise<boolean>}
 */
export const isSessionValid = async () => {
  const verifiedAt = await getItem(getPinVerifiedAtKey());
  if (!verifiedAt) return false;

  const sessionHours = await getSessionHours();
  const verifiedTime = new Date(verifiedAt).getTime();
  const nowTime = Date.now();
  const sessionMs = sessionHours * 60 * 60 * 1000;

  return (nowTime - verifiedTime) < sessionMs;
};

/**
 * Xác minh PIN người dùng nhập có khớp không (gọi API xác thực ở Backend)
 * @param {string} pin - Chuỗi 4 số người dùng vừa nhập
 * @returns {Promise<boolean>}
 */
export const verifyPin = async (pin) => {
  try {
    const response = await api.post('/auth/pin/verify', { pin });
    return !!response.data?.success;
  } catch (error) {
    console.error('Lỗi xác minh mã PIN:', error);
    return false;
  }
};

/**
 * Lưu mã PIN mới (gọi API lưu trên Backend và cập nhật authStore)
 * @param {string} pin - Chuỗi 4 số mã PIN mới
 */
export const savePin = async (pin) => {
  try {
    const response = await api.post('/auth/pin/setup', { pin });
    if (response.data?.success) {
      await useAuthStore.getState().setHasPin(true);
    }
  } catch (error) {
    console.error('Lỗi thiết lập mã PIN:', error);
    throw error;
  }
};

/**
 * Đánh dấu thời điểm xác thực PIN thành công → bắt đầu tính phiên
 */
export const markSessionVerified = async () => {
  await setItem(getPinVerifiedAtKey(), new Date().toISOString());
};

/**
 * Xóa toàn bộ dữ liệu PIN (gọi API xóa ở Backend và xóa phiên cục bộ)
 */
export const clearPin = async () => {
  try {
    await api.post('/auth/pin/clear');
    await useAuthStore.getState().setHasPin(false);
    await deleteItem(getPinVerifiedAtKey());
  } catch (error) {
    console.error('Lỗi xóa mã PIN:', error);
  }
};

/**
 * Xóa phiên PIN hiện tại (buộc nhập lại PIN lần tới, giữ nguyên PIN đã đặt)
 */
export const clearSession = async () => {
  await deleteItem(getPinVerifiedAtKey());
};
