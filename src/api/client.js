// meat-management-fe/src/api/client.js
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

// Cấu hình URL máy chủ Backend (Ưu tiên đọc từ biến môi trường của Vercel/Expo, mặc định localhost)
const API_HOST = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3000';

export const api = axios.create({
  baseURL: `${API_HOST}/api/v1`,
  timeout: 60000, // Hết hạn kết nối mặc định sau 60 giây (60000ms) để hỗ trợ gọi AI
});

// 1. Request Interceptor: Tự động đính kèm Access Token vào mọi yêu cầu
api.interceptors.request.use(
  (config) => {
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Quản lý việc làm mới Token đồng thời nhiều API
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// 2. Response Interceptor: Tự động xử lý lỗi hết hạn Token (401) và làm mới tự động (Silent Refresh)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Nếu gặp lỗi 401 Unauthorized và request chưa được thử lại lần nào
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      const authStore = useAuthStore.getState();
      
      // Nếu có sẵn Refresh Token trong store
      if (authStore.refreshToken) {
        if (isRefreshing) {
          // Nếu đang tiến hành làm mới token từ một luồng khác, xếp hàng chờ
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return api(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          // Gọi API làm mới token trực tiếp qua Axios thuần để tránh lặp vô hạn
          const refreshRes = await axios.post(`${API_HOST}/api/v1/auth/refresh-token`, {
            refreshToken: authStore.refreshToken,
          });

          if (refreshRes.data && refreshRes.data.success) {
            const { accessToken, refreshToken } = refreshRes.data.tokens;
            
            // Lưu cặp token mới vào store và bộ nhớ máy
            await authStore.login(authStore.user, { accessToken, refreshToken });
            
            processQueue(null, accessToken);
            isRefreshing = false;
            
            // Thực hiện lại yêu cầu ban đầu với token mới
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return api(originalRequest);
          }
        } catch (refreshError) {
          processQueue(refreshError, null);
          isRefreshing = false;
          
          // Làm mới thất bại (Refresh Token hết hạn) -> Đăng xuất người dùng ngay
          await authStore.logout();
          return Promise.reject(refreshError);
        }
      }
    }
    
    return Promise.reject(error);
  }
);
