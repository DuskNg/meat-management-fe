// meat-management-fe/src/store/authStore.js
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'meat_manager_access_token';
const REFRESH_TOKEN_KEY = 'meat_manager_refresh_token';
const USER_INFO_KEY = 'meat_manager_user_info';

export const useAuthStore = create((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isInitialized: false, // Để kiểm soát xem đã tải xong trạng thái từ bộ nhớ chưa

  // 1. Lưu thông tin đăng nhập và Tokens sau khi xác thực thành công
  login: async (user, tokens) => {
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
      await SecureStore.setItemAsync(USER_INFO_KEY, JSON.stringify(user));

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
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_INFO_KEY);

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
      const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      const userInfoStr = await SecureStore.getItemAsync(USER_INFO_KEY);

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
