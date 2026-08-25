// meat-management-fe/src/store/toastStore.js
// Store quản lý trạng thái hiển thị thông báo Toast toàn cục (Global Toast)
import { create } from 'zustand';

export const useToastStore = create((set) => ({
  toast: null, // { id, message, type: 'success' | 'error' | 'info', title, duration }
  showToast: ({ message, type = 'success', title = 'Thông báo', duration = 3000 }) => {
    set({ toast: { id: Date.now() + Math.random(), message, type, title } });
    setTimeout(() => {
      set({ toast: null });
    }, duration);
  },
  hideToast: () => set({ toast: null }),
}));

/**
 * Hàm gọi hiển thị Toast toàn cục từ bất kỳ đâu (modal, controller, hook...)
 * @param {string} message - Nội dung thông báo
 * @param {'success' | 'error' | 'info'} type - Loại thông báo
 * @param {string} title - Tiêu đề thông báo
 */
export const showGlobalToast = (message, type = 'success', title = 'Thành công') => {
  useToastStore.getState().showToast({ message, type, title });
};
