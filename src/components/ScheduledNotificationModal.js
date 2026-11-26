// meat-management-fe/src/components/ScheduledNotificationModal.js
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { api } from '../api/client';
import SmoothModal from './SmoothModal';
import DatePickerInput from './DatePickerInput';
import PopupModal from './PopupModal';
import { showGlobalToast } from '../store/toastStore';

// Chuyển YYYY-MM-DD sang DD/MM/YYYY
const formatYMDToDMY = (ymd) => {
  if (!ymd || typeof ymd !== 'string') return '';
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// Chuyển DD/MM/YYYY sang YYYY-MM-DD
const formatDMYToYMD = (dmy) => {
  if (!dmy || typeof dmy !== 'string') return '';
  const parts = dmy.split('/');
  if (parts.length !== 3) return dmy;
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
};

// Lấy ngày hôm nay theo múi giờ Việt Nam (DD/MM/YYYY và YYYY-MM-DD)
const getTodayVNStrings = () => {
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = vnTime.getUTCFullYear();
  const m = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(vnTime.getUTCDate()).padStart(2, '0');
  return { dmy: `${d}/${m}/${y}`, ymd: `${y}-${m}-${d}` };
};

// Modal tạo và quản lý danh sách thông báo hẹn ngày hiển thị
const ScheduledNotificationModal = forwardRef(({ onChanged }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [targetDateDMY, setTargetDateDMY] = useState(() => getTodayVNStrings().dmy);
  const [content, setContent] = useState('');
  const [errorText, setErrorText] = useState('');

  const popupRef = useRef(null);

  // Tải danh sách thông báo từ máy chủ
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await api.get('/scheduled-notifications');
      if (res.data?.success) {
        setNotifications(Array.isArray(res.data.data) ? res.data.data : []);
      } else {
        setLoadError(res.data?.message || 'Không thể tải danh sách thông báo.');
      }
    } catch (err) {
      console.error('Lỗi tải danh sách thông báo:', err);
      const msg =
        err.response?.status === 404
          ? 'Máy chủ Backend chưa cập nhật API thông báo hoặc chưa khởi động lại.'
          : err.response?.data?.message || 'Không thể tải danh sách thông báo.';
      setLoadError(msg);
      showGlobalToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Đặt lại form về trạng thái tạo mới
  const resetForm = () => {
    setEditingId(null);
    setTargetDateDMY(getTodayVNStrings().dmy);
    setContent('');
    setErrorText('');
  };

  useImperativeHandle(ref, () => ({
    open: () => {
      resetForm();
      setVisible(true);
      fetchNotifications();
    },
    close: () => {
      setVisible(false);
    },
    submit: () => {
      handleSave();
    },
  }));

  // Lưu tạo mới hoặc cập nhật thông báo
  const handleSave = async () => {
    const trimmed = content.trim();
    if (!targetDateDMY) {
      setErrorText('Vui lòng chọn ngày hiển thị thông báo.');
      return;
    }
    if (!trimmed) {
      setErrorText('Vui lòng nhập nội dung thông báo.');
      return;
    }

    setErrorText('');
    setSaving(true);
    try {
      const targetDate = formatDMYToYMD(targetDateDMY);
      if (editingId) {
        const res = await api.put(`/scheduled-notifications/${editingId}`, {
          targetDate,
          content: trimmed,
        });
        if (res.data?.success) {
          showGlobalToast('Đã cập nhật thông báo hẹn ngày.', 'success');
          resetForm();
          await fetchNotifications();
          onChanged?.();
        }
      } else {
        const res = await api.post('/scheduled-notifications', {
          targetDate,
          content: trimmed,
        });
        if (res.data?.success) {
          showGlobalToast(`Đã lưu thông báo cho ngày ${targetDateDMY}.`, 'success');
          resetForm();
          await fetchNotifications();
          onChanged?.();
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Không thể lưu thông báo.';
      setErrorText(msg);
      showGlobalToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Nạp dữ liệu vào form để chỉnh sửa
  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setTargetDateDMY(formatYMDToDMY(item.targetDate));
    setContent(item.content || '');
    setErrorText('');
  };

  // Đóng/mở lại trạng thái hiển thị của thông báo
  const handleToggleDismiss = async (item) => {
    try {
      const res = await api.put(`/scheduled-notifications/${item.id}`, {
        isDismissed: !item.isDismissed,
      });
      if (res.data?.success) {
        showGlobalToast(
          !item.isDismissed ? 'Đã đánh dấu hoàn thành thông báo.' : 'Đã bật hiển thị lại thông báo.',
          'success'
        );
        await fetchNotifications();
        onChanged?.();
      }
    } catch (err) {
      showGlobalToast('Không thể cập nhật trạng thái thông báo.', 'error');
    }
  };

  // Hỏi xác nhận xóa thông báo
  const handleDelete = (item) => {
    popupRef.current?.show({
      type: 'confirm',
      title: 'Xóa thông báo',
      message: `Bạn có chắc chắn muốn xóa thông báo ngày ${formatYMDToDMY(item.targetDate)} không?`,
      onConfirm: async () => {
        try {
          const res = await api.delete(`/scheduled-notifications/${item.id}`);
          if (res.data?.success) {
            showGlobalToast('Đã xóa thông báo.', 'success');
            if (editingId === item.id) resetForm();
            await fetchNotifications();
            onChanged?.();
          }
        } catch (err) {
          showGlobalToast('Lỗi khi xóa thông báo.', 'error');
        }
      },
    });
  };

  const todayYMD = getTodayVNStrings().ymd;

  // Xác định nhãn trạng thái theo ngày
  const getStatusBadge = (item) => {
    if (item.isDismissed) {
      return { label: 'Đã đóng', bg: '#F1F5F9', color: '#64748B' };
    }
    if (item.targetDate === todayYMD) {
      return { label: 'Hôm nay', bg: '#DCFCE7', color: '#15803D' };
    }
    if (item.targetDate > todayYMD) {
      return { label: 'Sắp tới', bg: '#DBEAFE', color: '#1D4ED8' };
    }
    return { label: 'Đã qua', bg: '#FEF3C7', color: '#B45309' };
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)} zIndex={88000}>
        <View style={styles.modalView}>
          {/* Header chuẩn Bottom-Sheet */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>🔔 TẠO THÔNG BÁO HẸN NGÀY</Text>
              <Text style={styles.headerSub}>Tự động hiển thị nhắc việc đúng ngày đã chọn</Text>
            </View>
            <TouchableOpacity
              onPress={() => setVisible(false)}
              style={styles.closeBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            {/* Khối Form tạo / sửa thông báo */}
            <View style={styles.formCard}>
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>NGÀY HIỂN THỊ THÔNG BÁO *</Text>
                  <DatePickerInput
                    value={targetDateDMY}
                    onChange={setTargetDateDMY}
                    allowFuture={true}
                    dense={true}
                    showIcon={true}
                  />
                </View>
              </View>

              <Text style={[styles.label, { marginTop: 10 }]}>NỘI DUNG THÔNG BÁO *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                value={content}
                onChangeText={(val) => {
                  setContent(val);
                  if (errorText) setErrorText('');
                }}
                placeholder="Nhập nội dung cần nhắc vào ngày đã chọn (VD: Chuyển tiền lò mổ, Thu nợ quán A, Nhập hàng...)"
                placeholderTextColor="#94A3B8"
                textAlignVertical="top"
              />

              {Boolean(errorText) && <Text style={styles.errorText}>{errorText}</Text>}

              <View style={styles.formActions}>
                {editingId && (
                  <TouchableOpacity
                    style={styles.cancelEditBtn}
                    onPress={resetForm}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.cancelEditText}>Hủy sửa</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.65 }]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>
                      {editingId ? '💾 Cập nhật thông báo' : '💾 Lưu thông báo'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Danh sách thông báo đã tạo dạng bảng cô đọng Mobile-First */}
            <View style={styles.listHeaderRow}>
              <Text style={styles.listTitle}>DANH SÁCH THÔNG BÁO ({notifications.length})</Text>
            </View>

            {loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.emptyText}>Đang tải thông báo...</Text>
              </View>
            ) : loadError ? (
              <View style={styles.centerBox}>
                <Text style={[styles.emptyText, { color: '#DC2626', textAlign: 'center' }]}>
                  ⚠️ {loadError}
                </Text>
                <TouchableOpacity
                  style={styles.cancelEditBtn}
                  onPress={fetchNotifications}
                  activeOpacity={0.75}
                >
                  <Text style={styles.cancelEditText}>🔄 Thử tải lại</Text>
                </TouchableOpacity>
              </View>
            ) : notifications.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyText}>Chưa có thông báo hẹn ngày nào.</Text>
              </View>
            ) : (
              <View style={styles.tableBox}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.thText, { width: 82 }]}>Ngày hẹn</Text>
                  <Text style={[styles.thText, { flex: 1 }]}>Nội dung</Text>
                  <Text style={[styles.thText, { width: 64, textAlign: 'center' }]}>Trạng thái</Text>
                  <Text style={[styles.thText, { width: 78, textAlign: 'right' }]}>Thao tác</Text>
                </View>

                {notifications.map((item, idx) => {
                  const badge = getStatusBadge(item);
                  return (
                    <View
                      key={item.id}
                      style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
                    >
                      <Text style={[styles.tdDate, { width: 82 }]}>
                        {formatYMDToDMY(item.targetDate)}
                      </Text>
                      <Text
                        style={[
                          styles.tdContent,
                          { flex: 1 },
                          item.isDismissed && styles.tdContentDismissed,
                        ]}
                      >
                        {item.content}
                      </Text>
                      <View style={{ width: 64, alignItems: 'center' }}>
                        <TouchableOpacity
                          onPress={() => handleToggleDismiss(item)}
                          style={[styles.statusBadge, { backgroundColor: badge.bg }]}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.statusBadgeText, { color: badge.color }]}>
                            {badge.label}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.rowActions}>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => handleStartEdit(item)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.iconBtnText}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.iconBtn, styles.iconBtnDanger]}
                          onPress={() => handleDelete(item)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.iconBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* Footer chân modal chuẩn */}
          <TouchableOpacity
            style={styles.footerCloseBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.footerCloseText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </SmoothModal>

      {/* Popup xác nhận đặt độc lập bên ngoài SmoothModal ở tầng cao nhất */}
      <PopupModal ref={popupRef} />
    </>
  );
});

ScheduledNotificationModal.displayName = 'ScheduledNotificationModal';
export default ScheduledNotificationModal;

const styles = StyleSheet.create({
  modalView: {
    width: '100%',
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flex: 1,
    paddingRight: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#475569',
  },
  bodyScroll: {
    flexShrink: 1,
    marginTop: 12,
    marginBottom: 10,
  },
  formCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 5,
  },
  textArea: {
    minHeight: 84,
    maxHeight: 140,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  cancelEditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  cancelEditText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  listHeaderRow: {
    marginTop: 14,
    marginBottom: 6,
  },
  listTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
  },
  centerBox: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
  },
  tableBox: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 6,
  },
  thText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  tableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tdDate: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  tdContent: {
    fontSize: 13,
    color: '#1E293B',
  },
  tdContentDismissed: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  rowActions: {
    width: 78,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 5,
  },
  iconBtn: {
    width: 30,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDanger: {
    backgroundColor: '#FEF2F2',
  },
  iconBtnText: {
    fontSize: 13,
  },
  footerCloseBtn: {
    height: 46,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCloseText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
  },
});
