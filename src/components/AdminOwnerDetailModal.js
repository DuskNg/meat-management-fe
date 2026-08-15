// meat-management-fe/src/components/AdminOwnerDetailModal.js
import React, { forwardRef, useImperativeHandle, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Modal, Animated, Dimensions, Platform, TextInput, Image, Share,
} from 'react-native';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import WorkspaceMemberPermModal from './WorkspaceMemberPermModal';
import WorkspaceMemberActionsModal from './WorkspaceMemberActionsModal';
import PopupModal from './PopupModal';

const { height: SCREEN_H } = Dimensions.get('window');

// Modal chi tiết Chủ Workspace — hiển thị QR, danh sách thành viên và yêu cầu đang chờ (Giao diện Sáng)
const AdminOwnerDetailModal = forwardRef(function AdminOwnerDetailModal(props, ref) {
  const { isAdminMode = false } = props;
  const [visible, setVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  
  // Các state hỗ trợ chỉnh sửa tên Workspace trực tiếp
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);

  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const memberPermModalRef = useRef(null);
  const memberActionsModalRef = useRef(null);
  const popupModalRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: (userData) => {
      setUser(userData);
      setWorkspace(userData?.ownedWorkspace || null);
      setWorkspaceName('');
      setIsEditingName(false);
      setVisible(true);
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, tension: 65, friction: 11,
      }).start();
      fetchWorkspaceDetail(userData?.id);
    },
    close: () => closeModal(),
  }));

  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_H, duration: 250, useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      setUser(null);
      setWorkspace(null);
    });
  };

  const fetchWorkspaceDetail = async (targetUserId) => {
    setLoading(true);
    try {
      const uId = targetUserId || user?.id;
      const res = await api.get('/workspace/my', {
        headers: { 'X-User-Override': uId },
      });
      if (res.data?.success && res.data?.data) {
        setWorkspace(res.data.data);
      }
    } catch (e) {
      console.error('Lỗi tải workspace detail:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkspace = async () => {
    if (!workspaceName.trim()) {
      popupModalRef.current?.show({
        title: 'Thiếu thông tin',
        message: 'Vui lòng nhập tên Workspace.',
        type: 'warning',
        confirmText: 'ĐÓNG',
      });
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/workspace/create', { name: workspaceName.trim() }, {
        headers: { 'X-User-Override': user?.id }
      });
      if (res.data?.success) {
        popupModalRef.current?.show({
          title: 'Thành công',
          message: 'Đã tạo Workspace thành công!',
          type: 'success',
          confirmText: 'ĐÓNG',
        });
        fetchWorkspaceDetail(user?.id);
      }
    } catch (e) {
      popupModalRef.current?.show({
        title: 'Thất bại',
        message: e.response?.data?.message || 'Có lỗi xảy ra khi tạo Workspace.',
        type: 'error',
        confirmText: 'ĐÓNG',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleStartEdit = () => {
    setEditNameValue(workspace?.name || '');
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!editNameValue.trim()) {
      popupModalRef.current?.show({
        title: 'Thiếu thông tin',
        message: 'Tên Workspace không được để trống.',
        type: 'warning',
        confirmText: 'ĐÓNG',
      });
      return;
    }
    setSavingName(true);
    try {
      const res = await api.put('/workspace/update', { name: editNameValue.trim() }, {
        headers: { 'X-User-Override': user?.id }
      });
      if (res.data?.success) {
        popupModalRef.current?.show({
          title: 'Thành công',
          message: 'Đã cập nhật tên Workspace thành công!',
          type: 'success',
          confirmText: 'ĐÓNG',
        });
        setIsEditingName(false);
        fetchWorkspaceDetail(user?.id);
      }
    } catch (e) {
      popupModalRef.current?.show({
        title: 'Thất bại',
        message: e.response?.data?.message || 'Có lỗi xảy ra khi cập nhật tên Workspace.',
        type: 'error',
        confirmText: 'ĐÓNG',
      });
    } finally {
      setSavingName(false);
    }
  };

  const handleOpenMemberPerms = (member) => {
    const perms = user?.permissions || user || {};
    const ownerPermissions = {
      canManageCustomers: perms.canManageCustomers ?? false,
      canManageDebt: perms.canManageDebt ?? false,
      canManageBadDebt: perms.canManageBadDebt ?? false,
      canManageEmployees: perms.canManageEmployees ?? false,
      canManageStore: perms.canManageStore ?? false,
      canManageInventory: perms.canManageInventory ?? false,
      canManageShop: perms.canManageShop ?? false,
    };
    memberPermModalRef.current?.open(member, () => {
      fetchWorkspaceDetail(user?.id);
    }, ownerPermissions);
  };

  const handleProcessRequest = async (requestId, action) => {
    try {
      const url = `/workspace/${action}/${requestId}`;
      const res = await api.post(url, {}, {
        headers: { 'X-User-Override': user?.id }
      });
      if (res.data?.success) {
        popupModalRef.current?.show({
          title: 'Thành công',
          message: res.data.message,
          type: 'success',
          confirmText: 'ĐÓNG',
        });
        fetchWorkspaceDetail(user?.id);
      }
    } catch (e) {
      popupModalRef.current?.show({
        title: 'Thất bại',
        message: e.response?.data?.message || 'Không thể xử lý yêu cầu.',
        type: 'error',
        confirmText: 'ĐÓNG',
      });
    }
  };

  // Hàm tạo link mời vào workspace (tự động nhận diện theo domain thực tế đang chạy)
  const getInviteLink = () => {
    if (!workspace || !workspace.inviteCode) return '';
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return `${window.location.origin}/login?invite=${workspace.inviteCode}`;
    }
    return `https://meat-management-fe.vercel.app/login?invite=${workspace.inviteCode}`;
  };

  // Xử lý chia sẻ liên kết qua giao diện hệ thống
  const handleShare = async () => {
    const inviteLink = getInviteLink();
    if (!inviteLink) return;

    try {
      await Share.share({
        message: `Liên kết tham gia Workspace của cửa hàng: ${inviteLink}`,
        url: inviteLink,
      });
    } catch (error) {
      console.error('Lỗi khi chia sẻ liên kết:', error);
    }
  };

  // Xử lý sao chép liên kết vào bộ nhớ tạm (Clipboard)
  const handleCopyLink = async () => {
    const inviteLink = getInviteLink();
    if (!inviteLink) return;

    try {
      if (Platform.OS === 'web') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(inviteLink);
        } else {
          // Phương án dự phòng cho trình duyệt cũ
          const textArea = document.createElement('textarea');
          textArea.value = inviteLink;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        }
        popupModalRef.current?.show({
          title: 'Thành công',
          message: 'Đã sao chép liên kết mời thành viên vào bộ nhớ tạm.',
          type: 'success',
        });
      } else {
        // Trên điện thoại, mở hộp thoại chia sẻ có sẵn tuỳ chọn sao chép
        await Share.share({
          message: `Liên kết tham gia Workspace: ${inviteLink}`,
          url: inviteLink,
        });
      }
    } catch (error) {
      console.error('Lỗi khi sao chép liên kết:', error);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeModal}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={closeModal} activeOpacity={1} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>👑 Quản lý Workspace</Text>
              <Text style={styles.headerSub}>{user?.name} — {user?.phone}</Text>
            </View>
            <TouchableOpacity onPress={closeModal} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
            {loading && !workspace ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#7C3AED" />
                <Text style={styles.loadingText}>Đang tải thông tin Workspace...</Text>
              </View>
            ) : workspace ? (
              <>
                {/* Thông tin Workspace */}
                <View style={styles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={styles.cardTitle}>🏢 THÔNG TIN WORKSPACE</Text>
                    <View style={[styles.statusBadge, workspace.isActive ? styles.activeBadge : styles.inactiveBadge]}>
                      <Text style={styles.statusBadgeText}>
                        {workspace.isActive ? 'Đang hoạt động' : 'Tạm tắt'}
                      </Text>
                    </View>
                  </View>

                  {isEditingName ? (
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <TextInput
                        style={styles.editInput}
                        value={editNameValue}
                        onChangeText={setEditNameValue}
                        placeholder="Nhập tên Workspace mới..."
                        placeholderTextColor="#94A3B8"
                      />
                      <TouchableOpacity
                        style={styles.saveNameBtn}
                        onPress={handleSaveName}
                        disabled={savingName}
                      >
                        {savingName ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 }}>Lưu</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cancelNameBtn}
                        onPress={() => setIsEditingName(false)}
                        disabled={savingName}
                      >
                        <Text style={{ color: '#475569', fontWeight: 'bold', fontSize: 13 }}>Hủy</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.wsName} numberOfLines={2}>{workspace.name}</Text>
                      <TouchableOpacity
                        style={styles.editNameBtn}
                        onPress={handleStartEdit}
                      >
                        <Text style={styles.editNameBtnText}>✏️ Sửa tên</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {!isAdminMode && (
                    <View style={[styles.inviteRow, { marginTop: 12 }]}>
                      <View>
                        <Text style={styles.inviteLabel}>Mã mời gia nhập:</Text>
                        <Text style={styles.inviteCode}>{workspace.inviteCode}</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Nút bấm xem Nhật ký thao tác thành viên (Dành riêng cho Chủ Workspace) */}
                <TouchableOpacity
                  style={styles.actionLogsBtn}
                  onPress={() => memberActionsModalRef.current?.open(user, 'ALL')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionLogsIcon}>📜</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionLogsTitle}>Nhật ký thao tác thành viên</Text>
                    <Text style={styles.actionLogsSubtitle}>Xem, chỉnh sửa hoặc xóa các thao tác ghi nợ, thu tiền trong ngày</Text>
                  </View>
                  <Text style={styles.actionLogsArrow}>➔</Text>
                </TouchableOpacity>

                {/* QR Code (Chỉ hiển thị với Workspace Owner thường, ẩn đối với Admin tối cao) */}
                {!isAdminMode && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>📱 MÃ QR MỜI NHÂN VIÊN</Text>
                    <Text style={styles.qrHint}>Nhân viên quét mã này để đăng nhập và gửi yêu cầu tham gia</Text>
                    <View style={styles.qrContainer}>
                      {workspace?.inviteCode ? (
                        <Image
                          source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(getInviteLink())}` }}
                          style={{ width: 180, height: 180 }}
                        />
                      ) : (
                        <View style={styles.qrPlaceholder}>
                          <Text style={styles.qrPlaceholderText}>📲</Text>
                          <Text style={styles.qrPlaceholderLabel}>QR: {getInviteLink()}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.qrUrl} numberOfLines={2}>{getInviteLink()}</Text>

                    <View style={styles.shareActions}>
                      <TouchableOpacity
                        style={styles.shareBtn}
                        onPress={handleShare}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.shareBtnText}>📤 Chia sẻ liên kết</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.copyBtn}
                        onPress={handleCopyLink}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.copyBtnText}>📋 Sao chép link</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Thành viên */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>
                    👥 THÀNH VIÊN ({workspace.members?.length || 0})
                  </Text>
                  {(!workspace.members || workspace.members.length === 0) ? (
                    <Text style={styles.emptyText}>Chưa có thành viên nào tham gia</Text>
                  ) : (
                    workspace.members.map((member) => (
                      <View key={member.id} style={styles.memberRow}>
                        <View style={styles.memberInfo}>
                          <Text style={styles.memberName}>{member.user?.name}</Text>
                          <Text style={styles.memberPhone}>{member.user?.phone}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            style={styles.memberActionBtn}
                            onPress={() => memberActionsModalRef.current?.open(user, member.userId)}
                          >
                            <Text style={styles.memberActionBtnText}>👁️ Thao tác</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.memberPermBtn}
                            onPress={() => handleOpenMemberPerms(member)}
                          >
                            <Text style={styles.memberPermBtnText}>Xem quyền</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>

                {/* Yêu cầu đang chờ */}
                {workspace.joinRequests && workspace.joinRequests.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                      ⏳ YÊU CẦU CHỜ DUYỆT ({workspace.joinRequests.length})
                    </Text>
                    {workspace.joinRequests.map((req) => (
                      <View key={req.id} style={styles.requestRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{req.user?.name}</Text>
                          <Text style={styles.memberPhone}>{req.user?.phone}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            style={[styles.reqBtn, styles.approveBtn]}
                            onPress={() => handleProcessRequest(req.id, 'approve')}
                          >
                            <Text style={styles.approveBtnText}>Duyệt</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.reqBtn, styles.rejectBtn]}
                            onPress={() => handleProcessRequest(req.id, 'reject')}
                          >
                            <Text style={styles.rejectBtnText}>Từ chối</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              /* Chưa có workspace - Hiển thị form tạo mới */
              <View style={styles.card}>
                <Text style={styles.cardTitle}>🏢 KHỞI TẠO WORKSPACE MỚI</Text>
                <Text style={styles.qrHint}>Tạo một không gian làm việc chung để nhân viên có thể đồng bộ dữ liệu với bạn.</Text>
                <TextInput
                  style={styles.createInput}
                  placeholder="Nhập tên Workspace (VD: Nhà hàng Anh Tú)..."
                  placeholderTextColor="#94A3B8"
                  value={workspaceName}
                  onChangeText={setWorkspaceName}
                />
                <TouchableOpacity
                  style={styles.createSubmitBtn}
                  onPress={handleCreateWorkspace}
                  disabled={creating}
                >
                  {creating ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.createSubmitBtnText}>TẠO WORKSPACE</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>

      <WorkspaceMemberPermModal ref={memberPermModalRef} />
      <WorkspaceMemberActionsModal ref={memberActionsModalRef} />
      <PopupModal ref={popupModalRef} />
    </Modal>
  );
});

export default AdminOwnerDetailModal;

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_H * 0.92,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#7C3AED' },
  headerSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  closeBtn: {
    backgroundColor: '#F1F5F9',
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  closeBtnText: { color: '#64748B', fontSize: 16, fontWeight: 'bold' },
  body: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingText: { color: '#64748B', fontSize: 14, marginTop: 8 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: { fontSize: 12, fontWeight: 'bold', color: '#64748B', marginBottom: 12, letterSpacing: 0.5 },
  wsName: { fontSize: 20, fontWeight: 'bold', color: '#0F172A', marginBottom: 6 },
  editInput: {
    flex: 1,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  saveNameBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelNameBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editNameBtn: {
    backgroundColor: '#FAF5FF',
    borderColor: '#C084FC',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editNameBtnText: { fontSize: 12, color: '#7C3AED', fontWeight: 'bold' },
  inviteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAF5FF',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  inviteLabel: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  inviteCode: { fontSize: 22, fontWeight: 'bold', color: '#7C3AED', letterSpacing: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  activeBadge: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  inactiveBadge: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  statusBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#059669' },
  actionLogsBtn: {
    backgroundColor: '#FAF5FF',
    borderColor: '#C084FC',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  actionLogsIcon: { fontSize: 26 },
  actionLogsTitle: { fontSize: 15, fontWeight: 'bold', color: '#7C3AED' },
  actionLogsSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  actionLogsArrow: { fontSize: 16, color: '#7C3AED', fontWeight: 'bold' },
  qrHint: { fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 18 },
  qrContainer: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrPlaceholder: { alignItems: 'center', padding: 20 },
  qrPlaceholderText: { fontSize: 48, marginBottom: 8 },
  qrPlaceholderLabel: { fontSize: 11, color: '#64748B', textAlign: 'center' },
  qrUrl: { fontSize: 11, color: '#64748B', textAlign: 'center', lineHeight: 16 },
  emptyText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', paddingVertical: 8 },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: 'bold', color: '#0F172A' },
  memberPhone: { fontSize: 12, color: '#64748B', marginTop: 2 },
  memberActionBtn: {
    backgroundColor: '#E0F2FE',
    borderColor: '#BAE6FD',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  memberActionBtnText: { fontSize: 12, color: '#0284C7', fontWeight: 'bold' },
  memberPermBtn: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  memberPermBtnText: { fontSize: 12, color: '#7C3AED', fontWeight: 'bold' },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  reqBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  approveBtn: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  approveBtnText: { fontSize: 12, color: '#059669', fontWeight: 'bold' },
  rejectBtn: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  rejectBtnText: { fontSize: 12, color: '#DC2626', fontWeight: 'bold' },
  createInput: {
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  createSubmitBtn: {
    backgroundColor: '#7C3AED',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  createSubmitBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  shareActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 16,
  },
  shareBtn: {
    flex: 1,
    backgroundColor: '#7C3AED',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  copyBtn: {
    flex: 1,
    backgroundColor: '#FAF5FF',
    borderColor: '#C084FC',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnText: {
    color: '#7C3AED',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
