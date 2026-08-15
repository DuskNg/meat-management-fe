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

// Modal phân quyền thành viên workspace — chủ nhà hàng sử dụng (Giao diện Sáng)
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
    open: (memberData, onSave, ownerPermissions = {}) => {
      setMember(memberData);
      setPerms({
        canManageCustomers: memberData.canManageCustomers !== undefined ? !!memberData.canManageCustomers : (ownerPermissions.canManageCustomers ?? false),
        canManageDebt: memberData.canManageDebt !== undefined ? !!memberData.canManageDebt : (ownerPermissions.canManageDebt ?? false),
        canManageBadDebt: memberData.canManageBadDebt !== undefined ? !!memberData.canManageBadDebt : (ownerPermissions.canManageBadDebt ?? false),
        canManageEmployees: memberData.canManageEmployees !== undefined ? !!memberData.canManageEmployees : (ownerPermissions.canManageEmployees ?? false),
        canManageStore: memberData.canManageStore !== undefined ? !!memberData.canManageStore : (ownerPermissions.canManageStore ?? false),
        canManageInventory: memberData.canManageInventory !== undefined ? !!memberData.canManageInventory : (ownerPermissions.canManageInventory ?? false),
        canManageShop: memberData.canManageShop !== undefined ? !!memberData.canManageShop : (ownerPermissions.canManageShop ?? false),
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
          onConfirm: () => {
            closeModal();
          },
        });
        if (onSaveRef.current) onSaveRef.current(member.id, perms);
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
                  trackColor={{ false: '#E2E8F0', true: '#DDD6FE' }}
                  thumbColor={perms[perm.key] ? '#7C3AED' : '#94A3B8'}
                />
              </View>
            ))}
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
  body: { padding: 16, backgroundColor: '#FFFFFF' },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  permIcon: { fontSize: 18, marginRight: 12 },
  permLabel: { flex: 1, fontSize: 15, color: '#0F172A', fontWeight: '500' },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  kickBtn: {
    flex: 1,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  kickBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    backgroundColor: '#7C3AED',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
});
