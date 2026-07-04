// meat-management-fe/app/admin/index.js
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useAuthStore } from '../../src/store/authStore';
import { api } from '../../src/api/client';
import AdminPermissionModal from '../../src/components/AdminPermissionModal';
import AdminLogsModal from '../../src/components/AdminLogsModal';

export default function AdminDashboard() {
  const authStore = useAuthStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Refs của các modal
  const permissionModalRef = useRef(null);
  const logsModalRef = useRef(null);

  // Tải danh sách người dùng
  const fetchUsers = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const response = await api.get('/admin/users');
      if (response.data && response.data.success) {
        setUsers(response.data.data);
      } else {
        setErrorMsg('Không thể lấy danh sách tài khoản.');
      }
    } catch (error) {
      console.error('Lỗi tải danh sách users:', error);
      setErrorMsg(error.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Cập nhật lại user sau khi phân quyền thành công
  const handlePermissionSaveSuccess = (updatedUser) => {
    setUsers((prevUsers) =>
      prevUsers.map((u) => (u.id === updatedUser.id ? { ...u, ...updatedUser.permissions } : u))
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header Quản trị */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Hệ thống Quản trị</Text>
          <Text style={styles.headerSubtitle}>Chào Admin, chúc bạn một ngày tốt lành!</Text>
        </View>
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => authStore.logout()}
        >
          <Text style={styles.logoutBtnText}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>

      {errorMsg ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* Danh sách người dùng */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0EA5E9" />
          <Text style={styles.loadingText}>Đang tải danh sách tài khoản...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Tổng quan hệ thống</Text>
            <Text style={styles.summaryValue}>{users.length} tài khoản người dùng</Text>
          </View>

          <Text style={styles.sectionTitle}>Danh sách tài khoản sử dụng ứng dụng</Text>

          {users.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Chưa có tài khoản người dùng nào đăng ký.</Text>
            </View>
          ) : (
            users.map((item) => (
              <View key={item.id} style={styles.userCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{item.name}</Text>
                    <Text style={styles.userPhone}>{item.phone}</Text>
                  </View>
                  <View style={[styles.roleBadge, item.isAdmin && styles.adminRoleBadge]}>
                    <Text style={styles.roleBadgeText}>{item.isAdmin ? 'ADMIN' : 'CHỦ BUÔN'}</Text>
                  </View>
                </View>

                {/* Danh sách các quyền được cấp */}
                {!item.isAdmin && (
                  <View style={styles.permissionsList}>
                    <Text style={styles.permissionsTitle}>Quyền hiện có:</Text>
                    <View style={styles.badgesContainer}>
                      {item.canManageCustomers ? (
                        <View style={[styles.badge, styles.activeBadge]}>
                          <Text style={styles.badgeText}>Khách hàng</Text>
                        </View>
                      ) : (
                        <View style={[styles.badge, styles.inactiveBadge]}>
                          <Text style={styles.badgeText}>Khách hàng</Text>
                        </View>
                      )}

                      {item.canManageDebt ? (
                        <View style={[styles.badge, styles.activeBadge]}>
                          <Text style={styles.badgeText}>Công nợ</Text>
                        </View>
                      ) : (
                        <View style={[styles.badge, styles.inactiveBadge]}>
                          <Text style={styles.badgeText}>Công nợ</Text>
                        </View>
                      )}

                      {item.canManageBadDebt ? (
                        <View style={[styles.badge, styles.activeBadge]}>
                          <Text style={styles.badgeText}>Nợ xấu</Text>
                        </View>
                      ) : (
                        <View style={[styles.badge, styles.inactiveBadge]}>
                          <Text style={styles.badgeText}>Nợ xấu</Text>
                        </View>
                      )}

                      {item.canManageEmployees ? (
                        <View style={[styles.badge, styles.activeBadge]}>
                          <Text style={styles.badgeText}>Nhân viên</Text>
                        </View>
                      ) : (
                        <View style={[styles.badge, styles.inactiveBadge]}>
                          <Text style={styles.badgeText}>Nhân viên</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Các nút hành động */}
                {!item.isAdmin && (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.permissionBtn}
                      onPress={() => permissionModalRef.current?.open(item)}
                    >
                      <Text style={styles.actionBtnText}>Phân quyền</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.logsBtn}
                      onPress={() => logsModalRef.current?.open(item)}
                    >
                      <Text style={styles.actionBtnText}>Xem Logs</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Khai báo modal phân quyền và logs sử dụng ref */}
      <AdminPermissionModal
        ref={permissionModalRef}
        onSaveSuccess={handlePermissionSaveSuccess}
      />
      
      <AdminLogsModal
        ref={logsModalRef}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#1E293B',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#38BDF8',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  logoutBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#EF444415',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    margin: 20,
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 8,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryTitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#E2E8F0',
    marginBottom: 12,
  },
  emptyBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
  },
  userCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  userPhone: {
    fontSize: 13,
    color: '#94A3B8',
  },
  roleBadge: {
    backgroundColor: '#0EA5E920',
    borderColor: '#0EA5E9',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  adminRoleBadge: {
    backgroundColor: '#EF444420',
    borderColor: '#EF4444',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#38BDF8',
  },
  permissionsList: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingVertical: 10,
  },
  permissionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  activeBadge: {
    backgroundColor: '#10B98115',
    borderColor: '#10B981',
  },
  inactiveBadge: {
    backgroundColor: '#33415530',
    borderColor: '#334155',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#E2E8F0',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 12,
    gap: 12,
  },
  permissionBtn: {
    backgroundColor: '#0EA5E9',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  logsBtn: {
    backgroundColor: '#475569',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
