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
  Alert,
  Platform,
} from 'react-native';
import { useAuthStore } from '../../src/store/authStore';
import { api } from '../../src/api/client';
import AdminPermissionModal from '../../src/components/AdminPermissionModal';
import AdminLogsModal from '../../src/components/AdminLogsModal';
import AdminAiUsageModal from '../../src/components/AdminAiUsageModal';
import AdminOwnerDetailModal from '../../src/components/AdminOwnerDetailModal';
import PopupModal from '../../src/components/PopupModal';

export default function AdminDashboard() {
  const authStore = useAuthStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Refs của các modal
  const permissionModalRef = useRef(null);
  const logsModalRef = useRef(null);
  const aiUsageModalRef = useRef(null);
  const ownerDetailModalRef = useRef(null);
  const popupModalRef = useRef(null);

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

  // Tính số ngày còn lại trước khi xóa vĩnh viễn (tối đa 7 ngày)
  const getRemainingDays = (deletedAt) => {
    if (!deletedAt) return 7;
    const deletedTime = new Date(deletedAt).getTime();
    const nowTime = new Date().getTime();
    const diffMs = nowTime - deletedTime;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const remaining = 7 - diffDays;
    return remaining > 0 ? remaining : 0;
  };

  // Xử lý xóa mềm tài khoản
  const handleDeleteUser = (item) => {
    popupModalRef.current?.show({
      title: '🗑️ Xóa tạm thời',
      message: `Bạn có chắc chắn muốn xóa tạm thời tài khoản của **${item.name}** (${item.phone}) không? Tài khoản sẽ bị khóa và xóa vĩnh viễn sau 7 ngày nếu không được khôi phục.`,
      type: 'confirm',
      confirmText: 'XÓA TẠM THỜI',
      cancelText: 'HỦY BỎ',
      onConfirm: async () => {
        try {
          const response = await api.delete(`/admin/users/${item.id}`);
          if (response.data && response.data.success) {
            popupModalRef.current?.show({
              title: 'Thành công',
              message: `Đã xóa tạm thời tài khoản của **${item.name}**.`,
              type: 'success',
              confirmText: 'ĐÓNG',
            });
            fetchUsers();
          }
        } catch (err) {
          popupModalRef.current?.show({
            title: 'Thất bại',
            message: err.response?.data?.message || 'Lỗi kết nối khi xóa tài khoản.',
            type: 'error',
            confirmText: 'ĐÓNG',
          });
        }
      },
    });
  };

  // Xử lý khôi phục tài khoản đã xóa mềm
  const handleRestoreUser = (item) => {
    popupModalRef.current?.show({
      title: '🛡️ Khôi phục tài khoản',
      message: `Bạn muốn khôi phục lại tài khoản của **${item.name}** (${item.phone}) chứ?`,
      type: 'confirm',
      confirmText: 'KHÔI PHỤC',
      cancelText: 'HỦY BỎ',
      onConfirm: async () => {
        try {
          const response = await api.post(`/admin/users/${item.id}/restore`);
          if (response.data && response.data.success) {
            popupModalRef.current?.show({
              title: 'Thành công',
              message: `Đã khôi phục hoạt động tài khoản của **${item.name}**.`,
              type: 'success',
              confirmText: 'ĐÓNG',
            });
            fetchUsers();
          }
        } catch (err) {
          popupModalRef.current?.show({
            title: 'Thất bại',
            message: err.response?.data?.message || 'Lỗi kết nối khi khôi phục tài khoản.',
            type: 'error',
            confirmText: 'ĐÓNG',
          });
        }
      },
    });
  };

  // Xử lý bật/tắt quyền Chủ Workspace
  const handleToggleWorkspaceOwner = (item) => {
    const nextStatus = !item.isWorkspaceOwner;
    popupModalRef.current?.show({
      title: nextStatus ? '👑 Cấp quyền Chủ Workspace' : 'Thu hồi quyền Chủ Workspace',
      message: nextStatus
        ? `Bạn có muốn cấp quyền **Chủ Workspace** cho tài khoản **${item.name}** (${item.phone}) không? Tài khoản này sẽ có thể tạo Workspace và phát mã QR cho nhân viên.`
        : `Bạn có chắc muốn thu hồi quyền Chủ Workspace của **${item.name}** không?`,
      type: 'confirm',
      confirmText: nextStatus ? 'CẤP QUYỀN' : 'THU HỒI',
      cancelText: 'HỦY BỎ',
      onConfirm: async () => {
        try {
          const response = await api.put(`/admin/users/${item.id}/workspace-owner`, {
            isWorkspaceOwner: nextStatus,
          });
          if (response.data && response.data.success) {
            const updatedData = response.data.data;
            popupModalRef.current?.show({
              title: 'Thành công',
              message: response.data.message,
              type: 'success',
              confirmText: 'ĐÓNG',
            });
            // Cập nhật state local ngay lập tức để nhận biết trạng thái CHỦ WORKSPACE
            setUsers((prevUsers) =>
              prevUsers.map((u) =>
                u.id === item.id
                  ? {
                      ...u,
                      isWorkspaceOwner: updatedData.isWorkspaceOwner,
                    }
                  : u
              )
            );
          }
        } catch (err) {
          popupModalRef.current?.show({
            title: 'Thất bại',
            message: err.response?.data?.message || 'Lỗi khi cập nhật quyền Chủ Workspace.',
            type: 'error',
            confirmText: 'ĐÓNG',
          });
        }
      },
    });
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
            users.map((item) => {
              const isDeleted = item.isActive === false;
              const isLinked = item.workspaceMemberships && item.workspaceMemberships.length > 0;
              const workspaceInfo = isLinked ? item.workspaceMemberships[0].workspace : null;

              return (
                <View key={item.id} style={[styles.userCard, isDeleted && { opacity: 0.7, borderColor: '#EF444450' }]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.userInfo}>
                      <Text style={[styles.userName, isDeleted && { color: '#94A3B8', textDecorationLine: 'line-through' }]}>
                        {item.name}
                      </Text>
                      <Text style={styles.userPhone}>{item.phone}</Text>
                      {isLinked && workspaceInfo && (
                        <Text style={{ fontSize: 11, color: '#38BDF8', marginTop: 4, fontWeight: '500' }}>
                          🔗 Nhân viên của: {workspaceInfo.owner.name} ({workspaceInfo.owner.phone})
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {isDeleted && (
                        <View style={styles.deletedBadge}>
                          <Text style={styles.deletedBadgeText}>Còn {getRemainingDays(item.deletedAt)} ngày</Text>
                        </View>
                      )}
                      {item.isWorkspaceOwner && (
                        <TouchableOpacity
                          style={styles.workspaceBadge}
                          onPress={() => ownerDetailModalRef.current?.open(item)}
                        >
                          <Text style={styles.workspaceBadgeText}>👑 CHỦ WORKSPACE</Text>
                        </TouchableOpacity>
                      )}
                      <View style={[
                        styles.roleBadge, 
                        item.isAdmin ? styles.adminRoleBadge : (isLinked ? { backgroundColor: '#0284C720', borderColor: '#0284C7', borderWidth: 1 } : null)
                      ]}>
                        <Text style={[
                          styles.roleBadgeText, 
                          item.isAdmin ? null : (isLinked ? { color: '#38BDF8' } : null)
                        ]}>
                          {item.isAdmin ? 'ADMIN' : (isLinked ? 'NHÂN VIÊN' : 'CHỦ BUÔN')}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Danh sách các quyền được cấp (hoặc thông báo xóa mềm) */}
                  {isDeleted ? (
                    <View style={styles.permissionsList}>
                      <Text style={[styles.permissionsTitle, { color: '#EF4444' }]}>
                        ⚠️ Tài khoản đang bị xóa tạm thời
                      </Text>
                      <Text style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic', lineHeight: 16 }}>
                        Dữ liệu của tài khoản này được bảo toàn đến hết 7 ngày kể từ lúc xóa, sau đó hệ thống sẽ tự động dọn dẹp vĩnh viễn.
                      </Text>
                    </View>
                  ) : (
                    !item.isAdmin && (
                      <View style={styles.permissionsList}>
                        <Text style={styles.permissionsTitle}>
                          Quyền hiện có: {isLinked && <Text style={{ color: '#38BDF8', fontWeight: 'normal', fontSize: 11 }}>(Đồng bộ theo Chủ sạp)</Text>}
                        </Text>
                        <View style={styles.badgesContainer}>
                          {item.isWorkspaceOwner && (
                            <View style={[styles.badge, styles.activeBadge, { backgroundColor: '#8B5CF625', borderColor: '#8B5CF6' }]}>
                              <Text style={[styles.badgeText, { color: '#A78BFA', fontWeight: 'bold' }]}>👑 CHỦ WORKSPACE (TOÀN QUYỀN)</Text>
                            </View>
                          )}
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

                          {item.canManageStore ? (
                            <View style={[styles.badge, styles.activeBadge]}>
                              <Text style={styles.badgeText}>Nhà hàng</Text>
                            </View>
                          ) : (
                            <View style={[styles.badge, styles.inactiveBadge]}>
                              <Text style={styles.badgeText}>Nhà hàng</Text>
                            </View>
                          )}

                          {item.canManageInventory ? (
                            <View style={[styles.badge, styles.activeBadge]}>
                              <Text style={styles.badgeText}>Kho</Text>
                            </View>
                          ) : (
                            <View style={[styles.badge, styles.inactiveBadge]}>
                              <Text style={styles.badgeText}>Kho</Text>
                            </View>
                          )}

                          {item.canManageShop ? (
                            <View style={[styles.badge, styles.activeBadge, { borderColor: '#14B8A6', backgroundColor: '#14B8A615' }]}>
                              <Text style={styles.badgeText}>Cửa hàng</Text>
                            </View>
                          ) : (
                            <View style={[styles.badge, styles.inactiveBadge]}>
                              <Text style={styles.badgeText}>Cửa hàng</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    )
                  )}

                  {/* Các nút hành động */}
                  {!item.isAdmin && (
                    isDeleted ? (
                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={styles.restoreBtn}
                          onPress={() => handleRestoreUser(item)}
                        >
                          <Text style={styles.actionBtnText}>🛡️ Khôi phục</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.logsBtn}
                          onPress={() => logsModalRef.current?.open(item)}
                        >
                          <Text style={styles.actionBtnText}>Xem Logs</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.actions}>
                        {!isLinked ? (
                          <>
                            <TouchableOpacity
                              style={styles.permissionBtn}
                              onPress={() => permissionModalRef.current?.open(item)}
                            >
                              <Text style={styles.actionBtnText}>Phân quyền</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.workspaceOwnerBtn, item.isWorkspaceOwner && styles.workspaceOwnerActiveBtn]}
                              onPress={() => {
                                if (item.isWorkspaceOwner) {
                                  ownerDetailModalRef.current?.open(item);
                                } else {
                                  handleToggleWorkspaceOwner(item);
                                }
                              }}
                            >
                              <Text style={styles.actionBtnText}>
                                {item.isWorkspaceOwner ? '✅ CHỦ WS (QR)' : '👑 Bật Chủ WS'}
                              </Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <View style={{ flex: 1, justifyContent: 'center' }}>
                            <Text style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>
                              🔄 Quyền tự động đồng bộ theo chủ Workspace
                            </Text>
                          </View>
                        )}

                        <TouchableOpacity
                          style={styles.logsBtn}
                          onPress={() => logsModalRef.current?.open(item)}
                        >
                          <Text style={styles.actionBtnText}>Logs</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.aiUsageBtn}
                          onPress={() => aiUsageModalRef.current?.open(item)}
                        >
                          <Text style={styles.actionBtnText}>💰 AI</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDeleteUser(item)}
                        >
                          <Text style={styles.actionBtnText}>🗑️ Xóa</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Khai báo modal phân quyền, logs, workspace và popup sử dụng ref */}
      <AdminPermissionModal
        ref={permissionModalRef}
        onSaveSuccess={handlePermissionSaveSuccess}
      />
      
      <AdminLogsModal
        ref={logsModalRef}
      />
      <AdminAiUsageModal
        ref={aiUsageModalRef}
      />
      <AdminOwnerDetailModal
        ref={ownerDetailModalRef}
      />
      <PopupModal
        ref={popupModalRef}
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
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 12,
    gap: 8,
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
  aiUsageBtn: {
    backgroundColor: '#7C3AED',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  deleteBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  restoreBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  deletedBadge: {
    backgroundColor: '#EF444415',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  deletedBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  workspaceBadge: {
    backgroundColor: '#8B5CF620',
    borderColor: '#8B5CF6',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  workspaceBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#A78BFA',
  },
  workspaceOwnerBtn: {
    backgroundColor: '#6B21A8',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  workspaceOwnerActiveBtn: {
    backgroundColor: '#7C3AED',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
