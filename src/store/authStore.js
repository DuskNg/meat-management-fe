// meat-management-fe/src/store/authStore.js
import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'meat_manager_access_token';
const REFRESH_TOKEN_KEY = 'meat_manager_refresh_token';
const USER_INFO_KEY = 'meat_manager_user_info';
const SAVED_PHONE_KEY = 'meat_manager_saved_phone'; // Khóa lưu số điện thoại đăng nhập gần nhất

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
  savedPhone: '', // Số điện thoại đã lưu từ lần đăng nhập gần nhất

  // 1. Lưu thông tin đăng nhập và Tokens sau khi xác thực thành công
  login: async (user, tokens) => {
    try {
      await setStorageItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      await setStorageItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      await setStorageItem(USER_INFO_KEY, JSON.stringify(user));
      
      // Lưu số điện thoại mới nhất vừa đăng nhập thành công (chỉ lưu số của tài khoản thường, không lưu số Admin)
      if (user && user.phone && !user.isAdmin) {
        await setStorageItem(SAVED_PHONE_KEY, user.phone);
      }

      set((state) => ({
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isAuthenticated: true,
        savedPhone: user?.isAdmin ? state.savedPhone : (user?.phone || ''),
      }));
    } catch (error) {
      console.error('Lỗi khi lưu thông tin đăng nhập:', error);
    }
  },

  // 2. Xóa thông tin đăng nhập (khi đăng xuất)
  logout: async () => {
    try {
      // Xoá phiên xác thực mã PIN của tài khoản hiện tại trước khi thoát
      const currentUser = useAuthStore.getState().user;
      if (currentUser && currentUser.id) {
        await deleteStorageItem(`meat_pin_verified_at_${currentUser.id}`);
      }

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
      const savedPhone = await getStorageItem(SAVED_PHONE_KEY) || '';

      if (accessToken && refreshToken && userInfoStr) {
        const user = JSON.parse(userInfoStr);
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isInitialized: true,
          savedPhone,
        });
      } else {
        set({ 
          isInitialized: true,
          savedPhone,
        });
      }
    } catch (error) {
      console.error('Lỗi khi nạp lại trạng thái đăng nhập:', error);
      set({ isInitialized: true });
    }
  },

  // 4. Cập nhật trạng thái có mã PIN hay chưa của người dùng
  setHasPin: async (hasPin) => {
    try {
      const user = useAuthStore.getState().user;
      if (user) {
        const updatedUser = { ...user, hasPin };
        await setStorageItem(USER_INFO_KEY, JSON.stringify(updatedUser));
        set({ user: updatedUser });
      }
    } catch (error) {
      console.error('Lỗi khi cập nhật trạng thái PIN:', error);
    }
  },

  // 4.5. Cập nhật và đồng bộ thông tin người dùng từ Backend (bao gồm phân quyền mới)
  updateUser: async (userInfo) => {
    try {
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        const updatedUser = { ...currentUser, ...userInfo };
        await setStorageItem(USER_INFO_KEY, JSON.stringify(updatedUser));
        set({ user: updatedUser });
      }
    } catch (error) {
      console.error('Lỗi khi cập nhật thông tin user:', error);
    }
  },

  // 5. Kiểm tra quyền của người dùng hiện tại (Admin hoặc mặc định chưa cài đặt đều là true)
  hasPermission: (permissionField) => {
    const user = useAuthStore.getState().user;
    if (!user) return false;
    if (user.isAdmin) return true;
    if (!user.permissions || user.permissions[permissionField] === undefined) {
      return true;
    }
    return !!user.permissions[permissionField];
  },
}));
