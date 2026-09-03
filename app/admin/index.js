// meat-management-fe/app/admin/index.js
import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  TextInput,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useAuthStore } from '../../src/store/authStore';
import { api } from '../../src/api/client';
import { matchSearch } from '../../src/utils/searchHelper';
import AdminPermissionModal from '../../src/components/AdminPermissionModal';
import AdminLogsModal from '../../src/components/AdminLogsModal';
import AdminAiUsageModal from '../../src/components/AdminAiUsageModal';
import AdminOwnerDetailModal from '../../src/components/AdminOwnerDetailModal';
import AdminReconciliationModal from '../../src/components/AdminReconciliationModal';
import PopupModal from '../../src/components/PopupModal';

export default function AdminDashboard() {
  const authStore = useAuthStore();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 960;
  const isTablet = screenWidth >= 640 && screenWidth < 960;

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // State bộ lọc và tìm kiếm
  const [searchKeyword, setSearchKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL'); // 'ALL' | 'OWNER' | 'MERCHANT' | 'STAFF' | 'DELETED'

  // Refs của các modal
  const permissionModalRef = useRef(null);
  const logsModalRef = useRef(null);
  const aiUsageModalRef = useRef(null);
  const ownerDetailModalRef = useRef(null);
  const reconciliationModalRef = useRef(null);
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

  // Thống kê nhanh số lượng
  const stats = useMemo(() => {
    const total = users.length;
    const owners = users.filter((u) => u.isWorkspaceOwner && u.isActive !== false).length;
    const staff = users.filter((u) => u.workspaceMemberships?.length > 0 && u.isActive !== false).length;
    const merchants = users.filter((u) => !u.isWorkspaceOwner && (!u.workspaceMemberships || u.workspaceMemberships.length === 0) && u.isActive !== false && !u.isAdmin).length;
    const deleted = users.filter((u) => u.isActive === false).length;
    return { total, owners, staff, merchants, deleted };
  }, [users]);

  // Lọc danh sách người dùng theo từ khóa và vai trò
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Lọc theo vai trò
      const isDeleted = u.isActive === false;
      const isStaff = u.workspaceMemberships && u.workspaceMemberships.length > 0;
      const isOwner = u.isWorkspaceOwner;

      if (roleFilter === 'DELETED' && !isDeleted) return false;
      if (roleFilter === 'OWNER' && (!isOwner || isDeleted)) return false;
      if (roleFilter === 'STAFF' && (!isStaff || isDeleted)) return false;
      if (roleFilter === 'MERCHANT' && (isOwner || isStaff || isDeleted || u.isAdmin)) return false;

      // Lọc theo từ khóa tìm kiếm
      if (!searchKeyword.trim()) return true;
      const matchName = matchSearch(u.name || '', searchKeyword);
      const matchPhone = matchSearch(u.phone || '', searchKeyword);
      return matchName || matchPhone;
    });
  }, [users, roleFilter, searchKeyword]);

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

      {/* Header Quản trị Responsive */}
      <View style={styles.header}>
        <View style={styles.headerContentWrapper}>
          <View>
            <Text style={styles.headerTitle}>🛡️ HỆ THỐNG QUẢN TRỊ ADMIN</Text>
            <Text style={styles.headerSubtitle}>Quản lý tài khoản, phân quyền, nhật ký & đối soát</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchUsers} disabled={loading}>
              <Text style={styles.refreshBtnText}>🔄 Làm mới</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={() => authStore.logout()}>
              <Text style={styles.logoutBtnText}>Đăng xuất</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {errorMsg ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* Thân trang quản trị */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0EA5E9" />
          <Text style={styles.loadingText}>Đang tải dữ liệu hệ thống...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          <View style={styles.mainWrapper}>
            {/* Thẻ thống kê tổng quan nhanh (Responsive Grid) */}
            <View style={styles.statsGrid}>
              <TouchableOpacity
                style={[styles.statCard, roleFilter === 'ALL' && styles.statCardActive]}
                onPress={() => setRoleFilter('ALL')}
                activeOpacity={0.7}
              >
                <Text style={styles.statIcon}>👥</Text>
                <View>
                  <Text style={styles.statLabel}>Tổng tài khoản</Text>
                  <Text style={styles.statValue}>{stats.total}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCard, roleFilter === 'OWNER' && styles.statCardActive]}
                onPress={() => setRoleFilter('OWNER')}
                activeOpacity={0.7}
              >
                <Text style={styles.statIcon}>👑</Text>
                <View>
                  <Text style={styles.statLabel}>Chủ Workspace</Text>
                  <Text style={[styles.statValue, { color: '#C084FC' }]}>{stats.owners}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCard, roleFilter === 'MERCHANT' && styles.statCardActive]}
                onPress={() => setRoleFilter('MERCHANT')}
                activeOpacity={0.7}
              >
                <Text style={styles.statIcon}>🥩</Text>
                <View>
                  <Text style={styles.statLabel}>Chủ buôn độc lập</Text>
                  <Text style={[styles.statValue, { color: '#38BDF8' }]}>{stats.merchants}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCard, roleFilter === 'STAFF' && styles.statCardActive]}
                onPress={() => setRoleFilter('STAFF')}
                activeOpacity={0.7}
              >
                <Text style={styles.statIcon}>🔗</Text>
                <View>
                  <Text style={styles.statLabel}>Nhân viên liên kết</Text>
                  <Text style={[styles.statValue, { color: '#34D399' }]}>{stats.staff}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCard, roleFilter === 'DELETED' && styles.statCardActive]}
                onPress={() => setRoleFilter('DELETED')}
                activeOpacity={0.7}
              >
                <Text style={styles.statIcon}>🗑️</Text>
                <View>
                  <Text style={styles.statLabel}>Đang xóa tạm thời</Text>
                  <Text style={[styles.statValue, { color: '#F87171' }]}>{stats.deleted}</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Thanh tìm kiếm và bộ lọc vai trò */}
            <View style={styles.filterToolbar}>
              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Tìm theo tên hoặc số điện thoại..."
                  placeholderTextColor="#64748B"
                  value={searchKeyword}
                  onChangeText={setSearchKeyword}
                  clearButtonMode="always"
                />
                {searchKeyword.trim() ? (
                  <TouchableOpacity onPress={() => setSearchKeyword('')} style={{ padding: 4 }}>
                    <Text style={{ color: '#94A3B8', fontSize: 16 }}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Bộ lọc Chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {[
                  { key: 'ALL', label: `Tất cả (${stats.total})` },
                  { key: 'OWNER', label: `👑 Chủ Workspace (${stats.owners})` },
                  { key: 'MERCHANT', label: `🥩 Chủ buôn (${stats.merchants})` },
                  { key: 'STAFF', label: `🔗 Nhân viên (${stats.staff})` },
                  { key: 'DELETED', label: `🗑️ Xóa tạm (${stats.deleted})` },
                ].map((chip) => (
                  <TouchableOpacity
                    key={chip.key}
                    style={[styles.filterChip, roleFilter === chip.key && styles.filterChipActive]}
                    onPress={() => setRoleFilter(chip.key)}
                  >
                    <Text style={[styles.filterChipText, roleFilter === chip.key && styles.filterChipTextActive]}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Tiêu đề danh sách */}
            <View style={styles.listHeaderRow}>
              <Text style={styles.sectionTitle}>
                Danh sách người dùng ({filteredUsers.length} tài khoản)
              </Text>
            </View>

            {filteredUsers.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyText}>Không tìm thấy tài khoản người dùng nào phù hợp.</Text>
              </View>
            ) : (
              /* Grid thẻ người dùng (2 cột trên Desktop, 1 cột trên Mobile) */
              <View style={[styles.usersGrid, isDesktop && styles.usersGridDesktop]}>
                {filteredUsers.map((item) => {
                  const isDeleted = item.isActive === false;
                  const isLinked = item.workspaceMemberships && item.workspaceMemberships.length > 0;
                  const workspaceInfo = isLinked ? item.workspaceMemberships[0].workspace : null;

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.userCard,
                        isDesktop && styles.userCardDesktop,
                        isDeleted && { opacity: 0.75, borderColor: '#EF444460' },
                      ]}
                    >
                      {/* Header của thẻ người dùng */}
                      <View style={styles.cardHeader}>
                        <View style={styles.userInfo}>
                          <Text
                            style={[
                              styles.userName,
                              isDeleted && { color: '#94A3B8', textDecorationLine: 'line-through' },
                            ]}
                          >
                            {item.name}
                          </Text>
                          <Text style={styles.userPhone}>📞 {item.phone}</Text>
                          {isLinked && workspaceInfo && (
                            <Text style={styles.linkedOwnerText}>
                              🔗 Nhân viên của: {workspaceInfo.owner.name} ({workspaceInfo.owner.phone})
                            </Text>
                          )}
                        </View>

                        <View style={styles.badgeGroup}>
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
                          <View
                            style={[
                              styles.roleBadge,
                              item.isAdmin
                                ? styles.adminRoleBadge
                                : isLinked
                                ? { backgroundColor: '#0284C720', borderColor: '#0284C7', borderWidth: 1 }
                                : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.roleBadgeText,
                                item.isAdmin ? null : isLinked ? { color: '#38BDF8' } : null,
                              ]}
                            >
                              {item.isAdmin ? 'ADMIN' : isLinked ? 'NHÂN VIÊN' : 'CHỦ BUÔN'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Danh sách các quyền được cấp */}
                      {isDeleted ? (
                        <View style={styles.permissionsList}>
                          <Text style={[styles.permissionsTitle, { color: '#EF4444' }]}>
                            ⚠️ Tài khoản đang bị xóa tạm thời
                          </Text>
                          <Text style={styles.deletedNoticeText}>
                            Dữ liệu của tài khoản này được bảo toàn đến hết 7 ngày kể từ lúc xóa, sau đó hệ thống sẽ tự động dọn dẹp vĩnh viễn.
                          </Text>
                        </View>
                      ) : (
                        !item.isAdmin && (
                          <View style={styles.permissionsList}>
                            <Text style={styles.permissionsTitle}>
                              Quyền hạn:{' '}
                              {isLinked && (
                                <Text style={{ color: '#38BDF8', fontWeight: 'normal', fontSize: 11 }}>
                                  (Đồng bộ theo Chủ sạp)
                                </Text>
                              )}
                            </Text>
                            <View style={styles.badgesContainer}>
                              {item.isWorkspaceOwner && (
                                <View style={[styles.badge, styles.activeBadge, { backgroundColor: '#8B5CF625', borderColor: '#8B5CF6' }]}>
                                  <Text style={[styles.badgeText, { color: '#A78BFA', fontWeight: 'bold' }]}>
                                    👑 CHỦ WORKSPACE
                                  </Text>
                                </View>
                              )}
                              <View style={[styles.badge, item.canManageCustomers ? styles.activeBadge : styles.inactiveBadge]}>
                                <Text style={styles.badgeText}>Khách hàng</Text>
                              </View>
                              <View style={[styles.badge, item.canManageDebt ? styles.activeBadge : styles.inactiveBadge]}>
                                <Text style={styles.badgeText}>Công nợ</Text>
                              </View>
                              <View style={[styles.badge, item.canManageBadDebt ? styles.activeBadge : styles.inactiveBadge]}>
                                <Text style={styles.badgeText}>Nợ xấu</Text>
                              </View>
                              <View style={[styles.badge, item.canManageEmployees ? styles.activeBadge : styles.inactiveBadge]}>
                                <Text style={styles.badgeText}>Nhân viên</Text>
                              </View>
                              <View style={[styles.badge, item.canManageStore ? styles.activeBadge : styles.inactiveBadge]}>
                                <Text style={styles.badgeText}>Nhà hàng</Text>
                              </View>
                              <View style={[styles.badge, item.canManageInventory ? styles.activeBadge : styles.inactiveBadge]}>
                                <Text style={styles.badgeText}>Kho</Text>
                              </View>
                              <View style={[styles.badge, item.canManageShop ? [styles.activeBadge, { borderColor: '#14B8A6', backgroundColor: '#14B8A615' }] : styles.inactiveBadge]}>
                                <Text style={styles.badgeText}>Cửa hàng</Text>
                              </View>
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
                              <Text style={styles.actionBtnText}>📜 Logs</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.actions}>
                            {!isLinked && (
                              <>
                                <TouchableOpacity
                                  style={styles.permissionBtn}
                                  onPress={() => permissionModalRef.current?.open(item)}
                                >
                                  <Text style={styles.actionBtnText}>🔑 Phân quyền</Text>
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
                            )}

                            <TouchableOpacity
                              style={styles.logsBtn}
                              onPress={() => logsModalRef.current?.open(item)}
                            >
                              <Text style={styles.actionBtnText}>📜 Logs</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.aiUsageBtn, { backgroundColor: '#059669' }]}
                              onPress={() => reconciliationModalRef.current?.open(item)}
                            >
                              <Text style={styles.actionBtnText}>📊 Đối soát</Text>
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
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Khai báo các modal sử dụng ref */}
      <AdminPermissionModal
        ref={permissionModalRef}
        onSaveSuccess={handlePermissionSaveSuccess}
      />
      <AdminReconciliationModal
        ref={reconciliationModalRef}
      />
      <AdminLogsModal
        ref={logsModalRef}
      />
      <AdminAiUsageModal
        ref={aiUsageModalRef}
      />
      <AdminOwnerDetailModal
        ref={ownerDetailModalRef}
        isAdminMode={true}
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
    backgroundColor: '#0B1120',
  },
  header: {
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerContentWrapper: {
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  refreshBtn: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  refreshBtnText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  logoutBtn: {
    backgroundColor: '#EF444420',
    borderColor: '#EF4444',
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  logoutBtnText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#EF444415',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    margin: 16,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '95%',
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
    padding: 16,
    paddingBottom: 40,
  },
  mainWrapper: {
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statCardActive: {
    borderColor: '#0EA5E9',
    backgroundColor: '#0F2744',
  },
  statIcon: {
    fontSize: 26,
  },
  statLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginTop: 2,
  },
  filterToolbar: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155',
    height: 42,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#0EA5E920',
    borderColor: '#0EA5E9',
  },
  filterChipText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  listHeaderRow: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#E2E8F0',
  },
  emptyBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
  },
  usersGrid: {
    flexDirection: 'column',
    gap: 12,
  },
  usersGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  userCard: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  userCardDesktop: {
    width: '48.8%',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
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
  linkedOwnerText: {
    fontSize: 11,
    color: '#38BDF8',
    marginTop: 4,
    fontWeight: '500',
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  roleBadge: {
    backgroundColor: '#0EA5E920',
    borderColor: '#0EA5E9',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
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
  deletedBadge: {
    backgroundColor: '#EF444415',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
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
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  workspaceBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#A78BFA',
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
  deletedNoticeText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
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
    alignItems: 'center',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 12,
    gap: 8,
  },
  permissionBtn: {
    backgroundColor: '#0EA5E9',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logsBtn: {
    backgroundColor: '#475569',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiUsageBtn: {
    backgroundColor: '#7C3AED',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    backgroundColor: '#EF4444',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restoreBtn: {
    backgroundColor: '#10B981',
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  workspaceOwnerBtn: {
    backgroundColor: '#6B21A8',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  workspaceOwnerActiveBtn: {
    backgroundColor: '#7C3AED',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

