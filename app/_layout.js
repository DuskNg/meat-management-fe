import { useEffect, useRef } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import WorkspacePendingBanner from '../src/components/WorkspacePendingBanner';
import AdminOwnerDetailModal from '../src/components/AdminOwnerDetailModal';
import { api } from '../src/api/client';
import { recordUserActivity } from '../src/hooks/useResourceLock';
import GlobalToast from '../src/components/GlobalToast';

// Tạo Client cho React Query để quản lý cache dữ liệu từ API
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RootLayoutNav() {
  const { isAuthenticated, isInitialized, init, user } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const ownerModalRef = useRef(null);

  // 1. Nạp lại phiên đăng nhập khi mở ứng dụng lần đầu
  useEffect(() => {
    init();
  }, []);

  // 2. Tự động kiểm soát quyền truy cập và chuyển hướng màn hình
  useEffect(() => {
    if (!isInitialized) return;

    const currentUser = useAuthStore.getState().user;

    // Kiểm tra phân cụm màn hình hiện tại
    const inAuthGroup = segments[0] === 'login' || (segments[0] === 'admin' && segments[1] === 'login');
    const inAdminGroup = segments[0] === 'admin';
    const inPendingScreen = segments[0] === 'workspace-pending';

    if (!isAuthenticated) {
      if (!inAuthGroup) {
        // Chưa đăng nhập -> Chuyển ngay về trang Đăng nhập
        router.replace('/login');
      }
    } else {
      // Đã đăng nhập
      if (currentUser?.isAdmin) {
        // Tài khoản Admin tối cao
        if (!inAdminGroup || segments[1] === 'login') {
          // Đưa Admin về trang quản trị
          router.replace('/admin');
        }
      } else {
        // Tài khoản thường
        // Kiểm tra xem có phải nhân viên hoặc đang chờ duyệt Workspace không
        api.get('/workspace/join-status').then((res) => {
          const isEmployee = res.data && (res.data.status === 'pending' || res.data.status === 'approved');
          
          if (isEmployee && currentUser?.name === 'Chủ buôn mới') {
            if (segments[0] !== 'set-name') {
              router.replace('/set-name');
            }
          } else if (res.data && res.data.status === 'pending') {
            if (!inPendingScreen) {
              router.replace('/workspace-pending');
            }
          } else {
            if (inAdminGroup || inAuthGroup || inPendingScreen || segments[0] === 'set-name') {
              router.replace('/');
            }
          }
        }).catch(() => {
          if (inAdminGroup || inAuthGroup || segments[0] === 'set-name') {
            router.replace('/');
          }
        });
      }
    }
  }, [isAuthenticated, isInitialized, segments, user]);

  // Hiển thị vòng xoay chờ khi chưa tải xong trạng thái từ SecureStore
  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} onTouchStart={recordUserActivity}>
      <WorkspacePendingBanner onPress={() => ownerModalRef.current?.open(user)} />
      <Slot />
      <AdminOwnerDetailModal ref={ownerModalRef} />
      <GlobalToast />
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootLayoutNav />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
});
