// meat-management-fe/src/components/AdminOwnerDetailModal.js
import React, { forwardRef, useImperativeHandle, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Modal, Animated, Dimensions, Platform, TextInput, Image,
} from 'react-native';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import WorkspaceMemberPermModal from './WorkspaceMemberPermModal';
import PopupModal from './PopupModal';

const { height: SCREEN_H } = Dimensions.get('window');

// Modal chi tiết Chủ Workspace — hiển thị QR, danh sách thành viên và yêu cầu đang chờ
const AdminOwnerDetailModal = forwardRef(function AdminOwnerDetailModal(props, ref) {
  const auth = useAuthStore();
  const [visible, setVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  const memberPermModalRef = useRef(null);
  const popupModalRef = useRef(null);

  useImperativeHandle(ref, () => ({
    open: (userData) => {
      setUser(userData);
      setWorkspace(null);
      setWorkspaceName('');
      setVisible(true);
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, tension: 65, friction: 11,
      }).start();
      if (userData?.ownedWorkspace) {
        setWorkspace(userData.ownedWorkspace);
        fetchWorkspaceDetail(userData.ownedWorkspace.id);
      } else {
        // Lấy lại chi tiết đề phòng chủ buôn đã tự tạo từ trước
        fetchWorkspaceDetail();
      }
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

  const fetchWorkspaceDetail = async () => {
    setLoading(true);
    try {
      const res = await api.get('/workspace/my', {
        headers: { 'X-User-Override': user?.id },
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
        fetchWorkspaceDetail();
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

  const handleOpenMemberPerms = (member) => {
    memberPermModalRef.current?.open(member, () => {
      // Tải lại chi tiết sau khi cập nhật quyền hoặc kick
      fetchWorkspaceDetail();
    });
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
        fetchWorkspaceDetail();
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

  const getQRValue = () => {
    if (!workspace?.inviteCode) return '';
    // QR encode URL để nhân viên quét sẽ mở app/web tại login với invite code
    return `https://meat-management-fe.vercel.app/login?invite=${workspace.inviteCode}`;
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
              <Text style={styles.headerTitle}>👑 Chi tiết Chủ Workspace</Text>
              <Text style={styles.headerSub}>{user?.name} — {user?.phone}</Text>
            </View>
            <TouchableOpacity onPress={closeModal} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text style={styles.loadingText}>Đang tải thông tin Workspace...</Text>
              </View>
            ) : workspace ? (
              <>
                {/* Thông tin Workspace */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>🏢 Thông tin Workspace</Text>
                  <Text style={styles.wsName}>{workspace.name}</Text>
                  <View style={styles.inviteRow}>
                    <View>
                      <Text style={styles.inviteLabel}>Mã mời</Text>
                      <Text style={styles.inviteCode}>{workspace.inviteCode}</Text>
                    </View>
                    <View style={[styles.statusBadge, workspace.isActive ? styles.activeBadge : styles.inactiveBadge]}>
                      <Text style={styles.statusBadgeText}>
                        {workspace.isActive ? 'Hoạt động' : 'Tắt'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* QR Code */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>📱 Mã QR mời nhân viên</Text>
                  <Text style={styles.qrHint}>Nhân viên quét mã này để đăng nhập và gửi yêu cầu tham gia</Text>
                  <View style={styles.qrContainer}>
                    {workspace?.inviteCode ? (
                      <Image
                        source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(getQRValue())}` }}
                        style={{ width: 180, height: 180 }}
                      />
                    ) : (
                      <View style={styles.qrPlaceholder}>
                        <Text style={styles.qrPlaceholderText}>📲</Text>
                        <Text style={styles.qrPlaceholderLabel}>QR: {getQRValue()}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.qrUrl} numberOfLines={2}>{getQRValue()}</Text>
                </View>

                {/* Thành viên */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>
                    👥 Thành viên ({workspace.members?.length || 0})
                  </Text>
                  {(!workspace.members || workspace.members.length === 0) ? (
                    <Text style={styles.emptyText}>Chưa có thành viên nào</Text>
                  ) : (
                    workspace.members.map((member) => (
                      <View key={member.id} style={styles.memberRow}>
                        <View style={styles.memberInfo}>
                          <Text style={styles.memberName}>{member.user?.name}</Text>
                          <Text style={styles.memberPhone}>{member.user?.phone}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.kickBtn}
                          onPress={() => handleOpenMemberPerms(member)}
                        >
                          <Text style={styles.kickBtnText}>Xem quyền</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>
 
                {/* Yêu cầu đang chờ */}
                {workspace.joinRequests && workspace.joinRequests.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                      ⏳ Yêu cầu chờ phê duyệt ({workspace.joinRequests.length})
                    </Text>
                    {workspace.joinRequests.map((req) => (
                      <View key={req.id} style={styles.requestRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{req.user?.name}</Text>
                          <Text style={styles.memberPhone}>{req.user?.phone}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            style={[styles.kickBtn, { backgroundColor: '#10B98120', borderColor: '#10B981' }]}
                            onPress={() => handleProcessRequest(req.id, 'approve')}
                          >
                            <Text style={[styles.kickBtnText, { color: '#34D399' }]}>Duyệt</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.kickBtn, { backgroundColor: '#EF444420', borderColor: '#EF4444' }]}
                            onPress={() => handleProcessRequest(req.id, 'reject')}
                          >
                            <Text style={[styles.kickBtnText, { color: '#F87171' }]}>Từ chối</Text>
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
                <Text style={styles.cardTitle}>🏢 Khởi tạo Workspace mới</Text>
                <Text style={styles.qrHint}>Tạo một không gian làm việc chung để nhân viên có thể đồng bộ dữ liệu với bạn.</Text>
                <TextInput
                  style={{
                    color: '#F8FAFC',
                    backgroundColor: '#0F172A',
                    borderWidth: 1,
                    borderColor: '#334155',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 14,
                    marginBottom: 12,
                  }}
                  placeholder="Nhập tên Workspace (VD: Nhà hàng Anh Tú)..."
                  placeholderTextColor="#64748B"
                  value={workspaceName}
                  onChangeText={setWorkspaceName}
                />
                <TouchableOpacity
                  style={{
                    backgroundColor: '#7C3AED',
                    paddingVertical: 12,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 48,
                  }}
                  onPress={handleCreateWorkspace}
                  disabled={creating}
                >
                  {creating ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 }}>TẠO WORKSPACE</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>

      <WorkspaceMemberPermModal ref={memberPermModalRef} />
      <PopupModal ref={popupModalRef} />
    </Modal>
  );
});

export default AdminOwnerDetailModal;

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#0F172A',
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
    borderBottomColor: '#1E293B',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#A78BFA' },
  headerSub: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  closeBtn: {
    backgroundColor: '#1E293B',
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  closeBtnText: { color: '#94A3B8', fontSize: 16 },
  body: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingText: { color: '#94A3B8', fontSize: 14, marginTop: 8 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: '#94A3B8', marginBottom: 12 },
  wsName: { fontSize: 20, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 12 },
  inviteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inviteLabel: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  inviteCode: { fontSize: 22, fontWeight: 'bold', color: '#A78BFA', letterSpacing: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  activeBadge: { backgroundColor: '#10B98120', borderColor: '#10B981' },
  inactiveBadge: { backgroundColor: '#EF444420', borderColor: '#EF4444' },
  statusBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#E2E8F0' },
  qrHint: { fontSize: 12, color: '#64748B', marginBottom: 16, lineHeight: 18 },
  qrContainer: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, marginBottom: 12 },
  qrPlaceholder: { alignItems: 'center', padding: 20 },
  qrPlaceholderText: { fontSize: 48, marginBottom: 8 },
  qrPlaceholderLabel: { fontSize: 10, color: '#64748B', textAlign: 'center' },
  qrUrl: { fontSize: 10, color: '#475569', textAlign: 'center', lineHeight: 14 },
  emptyText: { fontSize: 13, color: '#64748B', fontStyle: 'italic' },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '600', color: '#F1F5F9' },
  memberPhone: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  kickBtn: {
    backgroundColor: '#7C3AED20',
    borderColor: '#7C3AED',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  kickBtnText: { fontSize: 12, color: '#A78BFA', fontWeight: '600' },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  pendingBadge: {
    backgroundColor: '#F59E0B20',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#F59E0B' },
});
