// meat-management-fe/src/components/WorkspaceMemberPermModal.js
import React, { forwardRef, useImperativeHandle, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch,
  Modal, Animated, Dimensions, ActivityIndicator,
} from 'react-native';
import { api } from '../api/client';
import PopupModal from './PopupModal';

const { height: SCREEN_H } = Dimensions.get('window');

// Danh sách các quyền hiển thị
const PERMISSIONS = [
  { key: 'canManageCustomers', label: 'Khách hàng', icon: '👥' },
  { key: 'canManageDebt', label: 'Công nợ', icon: '💰' },
  { key: 'canManageBadDebt', label: 'Nợ xấu', icon: '⚠️' },
  { key: 'canManageEmployees', label: 'Nhân viên', icon: '🧑‍💼' },
  { key: 'canManageStore', label: 'Nhà hàng', icon: '🍽️' },
  { key: 'canManageInventory', label: 'Kho', icon: '📦' },
  { key: 'canManageShop', label: 'Cửa hàng giờ', icon: '🎱' },
];

// Modal phân quyền thành viên workspace — chủ nhà hàng sử dụng
const WorkspaceMemberPermModal = forwardRef(function WorkspaceMemberPermModal(_, ref) {
  const [visible, setVisible] = useState(false);
  const [member, setMember] = useState(null);
  const [perms, setPerms] = useState({});
  const [ownerPerms, setOwnerPerms] = useState({});
  const [saving, setSaving] = useState(false);
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const popupRef = useRef(null);
  const onSaveRef = useRef(null);

  useImperativeHandle(ref, () => ({
    // ownerPermissions: object chứa quyền của chủ WS, dùng để lọc quyền hiển thị
    open: (memberData, onSave, ownerPermissions = {}) => {
      setMember(memberData);
      setPerms({
        canManageCustomers: memberData.canManageCustomers || false,
        canManageDebt: memberData.canManageDebt || false,
        canManageBadDebt: memberData.canManageBadDebt || false,
        canManageEmployees: memberData.canManageEmployees || false,
        canManageStore: memberData.canManageStore || false,
        canManageInventory: memberData.canManageInventory || false,
        canManageShop: memberData.canManageShop || false,
      });
      setOwnerPerms(ownerPermissions);
      onSaveRef.current = onSave;
      setVisible(true);
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, tension: 65, friction: 11,
      }).start();
    },
    close: () => closeModal(),
  }));

  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_H, duration: 250, useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      setMember(null);
    });
  };

  const handleSave = async () => {
    if (!member?.id) return;
    setSaving(true);
    try {
      const res = await api.put(`/workspace/members/${member.id}/permissions`, perms);
      if (res.data?.success) {
        popupRef.current?.show({
          title: 'Thành công',
          message: `Đã cập nhật quyền cho **${member.user?.name}**.`,
          type: 'success',
          confirmText: 'ĐÓNG',
        });
        if (onSaveRef.current) onSaveRef.current(member.id, perms);
        closeModal();
      }
    } catch (e) {
      popupRef.current?.show({
        title: 'Lỗi',
        message: e.response?.data?.message || 'Không thể cập nhật quyền.',
        type: 'error',
        confirmText: 'ĐÓNG',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleKick = async () => {
    if (!member?.id) return;
    popupRef.current?.show({
      title: '⚠️ Loại thành viên',
      message: `Bạn có chắc muốn loại **${member.user?.name}** khỏi Workspace?`,
      type: 'confirm',
      confirmText: 'LOẠI RA',
      cancelText: 'HỦY',
      onConfirm: async () => {
        try {
          await api.delete(`/workspace/members/${member.id}`);
          if (onSaveRef.current) onSaveRef.current(member.id, null, 'kicked');
          closeModal();
        } catch (e) {
          popupRef.current?.show({
            title: 'Lỗi',
            message: e.response?.data?.message || 'Không thể loại thành viên.',
            type: 'error',
            confirmText: 'ĐÓNG',
          });
        }
      },
    });
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeModal}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={closeModal} activeOpacity={1} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Phân quyền thành viên</Text>
              <Text style={styles.headerSub}>{member?.user?.name} — {member?.user?.phone}</Text>
            </View>
            <TouchableOpacity onPress={closeModal} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {/* Chỉ hiển thị các quyền mà chủ workspace đang được admin cấp */}
            {PERMISSIONS.filter((perm) => ownerPerms[perm.key] === true).map((perm) => (
              <View key={perm.key} style={styles.permRow}>
                <Text style={styles.permIcon}>{perm.icon}</Text>
                <Text style={styles.permLabel}>{perm.label}</Text>
                <Switch
                  value={!!perms[perm.key]}
                  onValueChange={(val) => setPerms((p) => ({ ...p, [perm.key]: val }))}
                  trackColor={{ false: '#334155', true: '#7C3AED50' }}
                  thumbColor={perms[perm.key] ? '#8B5CF6' : '#64748B'}
                />
              </View>
            ))}
            {/* Thông báo nếu chủ không có quyền nào để phân */}
            {PERMISSIONS.filter((perm) => ownerPerms[perm.key] === true).length === 0 && (
              <Text style={{ color: '#64748B', fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
                Chủ Workspace chưa được Admin cấp quyền nào để phân cho thành viên.
              </Text>
            )}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.kickBtn} onPress={handleKick}>
              <Text style={styles.kickBtnText}>🚫 Loại khỏi Workspace</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>Lưu quyền</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
      <PopupModal ref={popupRef} />
    </Modal>
  );
});

export default WorkspaceMemberPermModal;

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
  body: { padding: 16 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  permIcon: { fontSize: 18, marginRight: 12 },
  permLabel: { flex: 1, fontSize: 15, color: '#E2E8F0', fontWeight: '500' },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  kickBtn: {
    flex: 1,
    backgroundColor: '#EF444420',
    borderColor: '#EF4444',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  kickBtnText: { color: '#F87171', fontSize: 13, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    backgroundColor: '#7C3AED',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
});
