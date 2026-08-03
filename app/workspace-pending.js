// meat-management-fe/app/workspace-pending.js
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../src/api/client';
import { useAuthStore } from '../src/store/authStore';

const POLL_INTERVAL = 5000; // Kiểm tra mỗi 5 giây

export default function WorkspacePendingScreen() {
  const router = useRouter();
  const auth = useAuthStore();
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const intervalRef = useRef(null);

  const checkStatus = async () => {
    try {
      const response = await api.get('/workspace/join-status');
      if (response.data && response.data.success) {
        const { status, data } = response.data;
        setStatusData(data);

        if (status === 'approved') {
          // Được phê duyệt -> chuyển ngay về trang chủ ứng dụng
          if (intervalRef.current) clearInterval(intervalRef.current);
          router.replace('/');
        } else if (status === 'none') {
          // Yêu cầu bị từ chối hoặc đã hủy -> về trang chủ
          if (intervalRef.current) clearInterval(intervalRef.current);
          router.replace('/');
        }
      }
    } catch (error) {
      console.error('Lỗi kiểm tra trạng thái gia nhập Workspace:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    intervalRef.current = setInterval(checkStatus, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleCancelRequest = async () => {
    setCancelling(true);
    try {
      await api.delete('/workspace/leave');
      if (intervalRef.current) clearInterval(intervalRef.current);
      router.replace('/');
    } catch (error) {
      console.error('Lỗi khi hủy yêu cầu:', error);
    } finally {
      setCancelling(false);
    }
  };

  const handleLogout = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    await auth.logout();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <ActivityIndicator size="large" color="#7C3AED" />
          </View>

          <Text style={styles.title}>Đang chờ phản hồi...</Text>

          <View style={styles.messageBox}>
            <Text style={styles.messageText}>
              Tài khoản của bạn đang được yêu cầu đồng bộ hệ thống với chủ tài khoản{' '}
              <Text style={styles.highlightText}>
                {statusData?.ownerName || statusData?.workspaceName || 'chủ nhà hàng'}
              </Text>
              , vui lòng chờ phản hồi...
            </Text>
          </View>

          <Text style={styles.subText}>
            Hệ thống sẽ tự động cập nhật ngay khi chủ tài khoản phê duyệt yêu cầu của bạn.
          </Text>

          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={checkStatus}
            disabled={loading}
          >
            <Text style={styles.refreshBtnText}>
              {loading ? 'Đang kiểm tra...' : '🔄 Kiểm tra lại ngay'}
            </Text>
          </TouchableOpacity>

          <View style={styles.footerActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancelRequest}
              disabled={cancelling}
            >
              <Text style={styles.cancelBtnText}>
                {cancelling ? 'Đang hủy...' : 'Hủy yêu cầu'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutBtnText}>Đăng xuất</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F6',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1EFEA',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#DDD6FE',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4C1D95',
    marginBottom: 16,
    textAlign: 'center',
  },
  messageBox: {
    backgroundColor: '#F5F3FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginBottom: 16,
    width: '100%',
  },
  messageText: {
    fontSize: 15,
    color: '#5B21B6',
    lineHeight: 24,
    textAlign: 'center',
  },
  highlightText: {
    fontWeight: 'bold',
    color: '#7C3AED',
  },
  subText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  refreshBtn: {
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  refreshBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
  },
  logoutBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  logoutBtnText: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '600',
  },
});
