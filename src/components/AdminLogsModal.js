// meat-management-fe/src/components/AdminLogsModal.js
import React, { useState, useImperativeHandle, forwardRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { api } from '../api/client';
import { matchSearch } from '../utils/searchHelper';

const ACTION_TRANSLATIONS = {
  'ALL': 'Tất cả hoạt động',
  'CREATE_TRANSACTION': 'Ghi nợ mới',
  'UPDATE_TRANSACTION': 'Sửa đơn nợ',
  'DELETE_TRANSACTION': 'Xóa đơn nợ',
  'CREATE_PAYMENT': 'Thu tiền nợ',
  'UPDATE_PAYMENT': 'Sửa lượt thu tiền',
  'DELETE_PAYMENT': 'Xóa lượt thu tiền',
  'CREATE_CUSTOMER': 'Thêm khách hàng',
  'CREATE_BAD_DEBT_CUSTOMER': 'Thêm khách nợ xấu',
  'UPDATE_CUSTOMER': 'Sửa khách hàng',
  'DELETE_CUSTOMER': 'Xóa khách hàng',
  'CREATE_PRODUCT': 'Thêm sản phẩm',
  'UPDATE_PRODUCT': 'Sửa sản phẩm',
  'DELETE_PRODUCT': 'Ẩn sản phẩm',
  'CREATE_SUPPLIER': 'Thêm nhà cung cấp',
  'UPDATE_SUPPLIER': 'Sửa nhà cung cấp',
  'DELETE_SUPPLIER': 'Xóa nhà cung cấp',
  'CREATE_SUPPLIER_TRANSACTION': 'Nhập hàng (Nợ NCC)',
  'CREATE_SUPPLIER_PAYMENT': 'Thanh toán cho NCC',
  'CREATE_EMPLOYEE': 'Thêm nhân viên',
  'UPDATE_EMPLOYEE': 'Sửa nhân viên',
  'DELETE_EMPLOYEE': 'Xóa nhân viên',
  'CLOCK_IN': 'Chấm công vào ca',
  'CLOCK_OUT': 'Chấm công tan ca',
  'CREATE_SALARY_ADVANCE': 'Tạm ứng lương',
  'UPDATE_PERMISSIONS': 'Cập nhật phân quyền'
};

const WebDateInput = (props) => {
  if (Platform.OS !== 'web') return null;
  const { value, onChange, style } = props;
  return React.createElement('input', {
    type: 'date',
    value,
    onChange,
    style,
  });
};

const AdminLogsModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedActionType, setSelectedActionType] = useState('ALL');
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [searchText, setSearchText] = useState('');
  
  // Mặc định chọn ngày hôm nay ở định dạng YYYY-MM-DD
  const getTodayString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [dateInput, setDateInput] = useState(getTodayString());

  // Phơi bày các hàm điều khiển cho component cha gọi qua ref
  useImperativeHandle(ref, () => ({
    open: (targetUser) => {
      setUser(targetUser);
      setDateInput(getTodayString());
      setSelectedActionType('ALL');
      setShowPickerModal(false);
      setSearchText('');
      setErrorMsg('');
      setLogs([]);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Hàm tải dữ liệu logs từ API
  const fetchLogs = async (targetDate) => {
    if (!user) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const response = await api.get(`/admin/users/${user.id}/logs`, {
        params: { date: targetDate || undefined },
      });

      if (response.data && response.data.success) {
        setLogs(response.data.data);
      } else {
        setErrorMsg('Không thể tải nhật ký hoạt động.');
      }
    } catch (error) {
      console.error('Lỗi tải logs:', error);
      setErrorMsg(error.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  // Tự động gọi API tải logs khi chọn user hoặc đổi ngày
  useEffect(() => {
    if (visible && user) {
      fetchLogs(dateInput);
    }
  }, [visible, user, dateInput]);

  // Format hiển thị mốc thời gian giờ phút
  const formatTime = (dateStr) => {
    try {
      const date = new Date(dateStr);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch (e) {
      return '';
    }
  };

  // Lấy màu sắc biểu tượng đại diện cho từng loại hành động
  const getActionBadgeColor = (action) => {
    if (action.includes('CREATE')) return '#10B981'; // Xanh lá cho tạo mới
    if (action.includes('UPDATE')) return '#F59E0B'; // Vàng cho cập nhật
    if (action.includes('DELETE')) return '#EF4444'; // Đỏ cho xóa
    return '#64748B'; // Xám cho hành động khác
  };

  if (!visible || !user) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={() => setVisible(false)}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>

        <View style={styles.card}>
          <Text style={styles.title}>Nhật ký hoạt động</Text>
          <Text style={styles.subtitle}>Tài khoản: {user.name} ({user.phone})</Text>

          {/* Hàng bộ lọc: Chọn ngày, Hôm nay, Loại hoạt động, Tìm kiếm trên cùng một dòng */}
          <View style={styles.filterRow}>
            {/* 1. Bộ lọc Ngày */}
            <View style={[styles.inputContainer, { flex: 1.2 }]}>
              <Text style={styles.filterLabel}>📅 Chọn ngày:</Text>
              {Platform.OS === 'web' ? (
                <WebDateInput
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  style={{
                    backgroundColor: '#1E293B',
                    borderColor: '#334155',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    outline: 'none',
                    width: '100%',
                    height: '38px',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              ) : (
                <TextInput
                  style={styles.dateInput}
                  value={dateInput}
                  onChangeText={setDateInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#64748B"
                />
              )}
            </View>

            <TouchableOpacity
              style={styles.todayBtn}
              onPress={() => setDateInput(getTodayString())}
              activeOpacity={0.7}
            >
              <Text style={styles.todayBtnText}>Hôm nay</Text>
            </TouchableOpacity>

            {/* 2. Bộ lọc Loại hoạt động */}
            <View style={[styles.inputContainer, { flex: 1.5 }]}>
              <Text style={styles.filterLabel}>🔍 Loại hoạt động:</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowPickerModal(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerButtonText} numberOfLines={1}>
                  {ACTION_TRANSLATIONS[selectedActionType] || selectedActionType}
                </Text>
                <Text style={styles.pickerButtonArrow}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* 3. Bộ lọc Từ khóa tìm kiếm */}
            <View style={[styles.inputContainer, { flex: 2 }]}>
              <Text style={styles.filterLabel}>✍️ Từ khóa tìm nhanh:</Text>
              <TextInput
                style={styles.searchInputInRow}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Tìm tên khách, số tiền, loại thịt..."
                placeholderTextColor="#64748B"
                clearButtonMode="always"
                autoCapitalize="none"
              />
            </View>
          </View>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Danh sách logs sau khi lọc */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color="#0EA5E9" size="large" />
              <Text style={styles.loadingText}>Đang tải nhật ký...</Text>
            </View>
          ) : (
            <ScrollView style={styles.logsList} contentContainerStyle={styles.logsScrollContent}>
              {(() => {
                const filteredLogs = logs.filter(log => {
                  const matchesAction = selectedActionType === 'ALL' || log.action === selectedActionType;
                  if (!matchesAction) return false;

                  if (!searchText.trim()) return true;
                  const translatedAction = ACTION_TRANSLATIONS[log.action] || log.action;
                  const details = log.details || '';
                  return matchSearch(details, searchText) || matchSearch(translatedAction, searchText);
                });

                if (filteredLogs.length === 0) {
                  return (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyText}>Không có hoạt động nào thuộc loại này được ghi nhận.</Text>
                    </View>
                  );
                }

                return filteredLogs.map((log) => {
                  const badgeColor = getActionBadgeColor(log.action);
                  const translatedAction = ACTION_TRANSLATIONS[log.action] || log.action;
                  return (
                    <View key={log.id} style={[styles.logItem, { borderLeftColor: badgeColor }]}>
                      <View style={styles.logHeader}>
                        <View style={[styles.badge, { backgroundColor: badgeColor + '20', borderColor: badgeColor }]}>
                          <Text style={[styles.badgeText, { color: badgeColor }]}>{translatedAction}</Text>
                        </View>
                        <Text style={styles.timeText}>{formatTime(log.createdAt)}</Text>
                      </View>
                      <Text style={styles.detailText}>{log.details}</Text>
                    </View>
                  );
                });
              })()}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setVisible(false)}
            >
              <Text style={styles.closeBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Modal bộ chọn loại hoạt động tuỳ chỉnh hỗ trợ đa nền tảng web/app */}
      <Modal
        visible={showPickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPickerModal(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Chọn loại hoạt động</Text>
            <ScrollView style={styles.pickerScroll}>
              {Object.entries(ACTION_TRANSLATIONS).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.pickerItem, selectedActionType === key && styles.pickerItemActive]}
                  onPress={() => {
                    setSelectedActionType(key);
                    setShowPickerModal(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, selectedActionType === key && styles.pickerItemTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.pickerClose}
              onPress={() => setShowPickerModal(false)}
            >
              <Text style={styles.pickerCloseText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '95%',
    maxWidth: 900,
    height: '92%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 10,
    width: '100%',
  },
  inputContainer: {
    flex: 1,
    minWidth: 150,
  },
  filterLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 6,
    fontWeight: '500',
  },
  dateInput: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 38,
    color: '#FFFFFF',
    fontSize: 14,
  },
  todayBtn: {
    backgroundColor: '#334155',
    borderRadius: 6,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  todayBtnText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#EF444415',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
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
  logsList: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
  },
  logsScrollContent: {
    paddingBottom: 16,
  },
  emptyBox: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  logItem: {
    backgroundColor: '#1E293B',
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  timeText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  detailText: {
    fontSize: 13,
    color: '#E2E8F0',
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: '#475569',
    borderRadius: 6,
  },
  closeBtnText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  searchInputInRow: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 38,
    color: '#FFFFFF',
    fontSize: 14,
  },
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 38,
  },
  pickerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  pickerButtonArrow: {
    color: '#94A3B8',
    fontSize: 12,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 15,
    textAlign: 'center',
  },
  pickerScroll: {
    flex: 1,
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  pickerItemActive: {
    backgroundColor: '#0EA5E920',
  },
  pickerItemText: {
    fontSize: 14,
    color: '#E2E8F0',
  },
  pickerItemTextActive: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  pickerClose: {
    marginTop: 15,
    backgroundColor: '#475569',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  pickerCloseText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default AdminLogsModal;
