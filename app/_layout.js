// meat-management-fe/app/_layout.js
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

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
  const { isAuthenticated, isInitialized, init } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // 1. Nạp lại phiên đăng nhập khi mở ứng dụng lần đầu
  useEffect(() => {
    init();
  }, []);

  // 2. Tự động kiểm soát quyền truy cập và chuyển hướng màn hình
  useEffect(() => {
    if (!isInitialized) return;

    // Kiểm tra xem người dùng đang đứng ở cụm màn hình login hay không
    const inAuthGroup = segments[0] === 'login';

    if (!isAuthenticated && !inAuthGroup) {
      // Chưa đăng nhập -> Chuyển ngay về trang Đăng nhập
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Đã đăng nhập nhưng cố truy cập login -> Đưa về trang chủ
      router.replace('/');
    }
  }, [isAuthenticated, isInitialized, segments]);

  // Hiển thị vòng xoay chờ khi chưa tải xong trạng thái từ SecureStore
  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return <Slot />;
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
