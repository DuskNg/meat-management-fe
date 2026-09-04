// meat-management-fe/src/store/toastStore.js
// Store quản lý trạng thái hiển thị thông báo Toast toàn cục (Global Toast)
import { create } from 'zustand';

export const useToastStore = create((set) => ({
  toast: null, // { id, message, type: 'success' | 'error' | 'info', title, duration }
  showToast: (payload) => {
    let message = '';
    let type = 'success';
    let title = 'Thông báo';
    let duration = 3000;

    if (typeof payload === 'string') {
      message = payload;
    } else if (payload && typeof payload === 'object') {
      message = typeof payload.message === 'string' ? payload.message : (payload.message ? JSON.stringify(payload.message) : '');
      type = payload.type || 'success';
      title = payload.title || (type === 'success' ? 'Thành công' : type === 'error' ? 'Lỗi' : 'Thông báo');
      duration = payload.duration || 3000;
    }

    set({ toast: { id: Date.now() + Math.random(), message, type, title } });
    setTimeout(() => {
      set({ toast: null });
    }, duration);
  },
  hideToast: () => set({ toast: null }),
}));

/**
 * Hàm gọi hiển thị Toast toàn cục từ bất kỳ đâu (modal, controller, hook...)
 * Hỗ trợ cả 2 cách gọi:
 * - showGlobalToast('Nội dung', 'success', 'Tiêu đề')
 * - showGlobalToast({ title: 'Tiêu đề', message: 'Nội dung', type: 'success' })
 */
export const showGlobalToast = (arg1, type = 'success', title = 'Thành công', duration = 3000) => {
  if (arg1 && typeof arg1 === 'object') {
    useToastStore.getState().showToast(arg1);
  } else {
    useToastStore.getState().showToast({ message: String(arg1 || ''), type, title, duration });
  }
};
