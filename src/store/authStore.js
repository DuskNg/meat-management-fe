// meat-management-fe/src/store/authStore.js
import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'meat_manager_access_token';
const REFRESH_TOKEN_KEY = 'meat_manager_refresh_token';
const USER_INFO_KEY = 'meat_manager_user_info';

// Hàm helper để tương thích lưu trữ trên cả Web và thiết bị di động (Native)
const isWeb = Platform.OS === 'web';

const setStorageItem = async (key, value) => {
  if (isWeb) {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

const getStorageItem = async (key) => {
  if (isWeb) {
    return localStorage.getItem(key);
  } else {
    return await SecureStore.getItemAsync(key);
  }
};

const deleteStorageItem = async (key) => {
  if (isWeb) {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
};

export const useAuthStore = create((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isInitialized: false, // Để kiểm soát xem đã tải xong trạng thái từ bộ nhớ chưa

  // 1. Lưu thông tin đăng nhập và Tokens sau khi xác thực thành công
  login: async (user, tokens) => {
    try {
      await setStorageItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      await setStorageItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      await setStorageItem(USER_INFO_KEY, JSON.stringify(user));

      set({
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isAuthenticated: true,
      });
    } catch (error) {
      console.error('Lỗi khi lưu thông tin đăng nhập:', error);
    }
  },

  // 2. Xóa thông tin đăng nhập (khi đăng xuất)
  logout: async () => {
    try {
      await deleteStorageItem(ACCESS_TOKEN_KEY);
      await deleteStorageItem(REFRESH_TOKEN_KEY);
      await deleteStorageItem(USER_INFO_KEY);

      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      });
    } catch (error) {
      console.error('Lỗi khi đăng xuất:', error);
    }
  },

  // 3. Nạp lại phiên đăng nhập khi vừa mở ứng dụng
  init: async () => {
    try {
      const accessToken = await getStorageItem(ACCESS_TOKEN_KEY);
      const refreshToken = await getStorageItem(REFRESH_TOKEN_KEY);
      const userInfoStr = await getStorageItem(USER_INFO_KEY);

      if (accessToken && refreshToken && userInfoStr) {
        const user = JSON.parse(userInfoStr);
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isInitialized: true,
        });
      } else {
        set({ isInitialized: true });
      }
    } catch (error) {
      console.error('Lỗi khi nạp lại trạng thái đăng nhập:', error);
      set({ isInitialized: true });
    }
  },
}));
