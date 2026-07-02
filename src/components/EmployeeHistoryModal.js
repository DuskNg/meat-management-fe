// meat-management-fe/src/components/EmployeeHistoryModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS } from '../theme';
import SmoothModal from './SmoothModal';

// Modal xem lịch sử tổng hợp của nhân viên
const EmployeeHistoryModal = forwardRef(({ employee }, ref) => {
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('ATTENDANCE'); // 'ATTENDANCE', 'ADVANCE', 'PAYMENT'
  const [historyData, setHistoryData] = useState({ attendances: [], advances: [], payments: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useImperativeHandle(ref, () => ({
    open: () => {
      setVisible(true);
      setActiveTab('ATTENDANCE');
      fetchHistory();
    },
    close: () => {
      setVisible(false);
    },
  }));

  const fetchHistory = async () => {
    if (!employee?.id) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/employees/${employee.id}/history`);
      if (response.data.success) {
        setHistoryData(response.data.data);
      } else {
        setError(response.data.message || 'Không thể tải lịch sử nhân viên.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  const renderAttendanceItem = ({ item }) => {
    const isPresent = item.status === 'PRESENT';
    const isHalf = item.shift === 'HALF';
    return (
      <View style={styles.cardItem}>
        <View style={styles.cardLeft}>
          <Text style={styles.dateText}>{formatDate(item.date)}</Text>
          {item.note ? <Text style={styles.noteText}>Ghi chú: {item.note}</Text> : null}
        </View>
        <View style={[styles.badge, isPresent ? styles.badgeGreen : styles.badgeRed]}>
          <Text style={[styles.badgeText, isPresent ? styles.textGreen : styles.textRed]}>
            {isPresent ? (isHalf ? 'Đi làm (Nửa ngày)' : 'Đi làm (Cả ngày)') : 'Nghỉ'}
          </Text>
        </View>
      </View>
    );
  };

  const renderAdvanceItem = ({ item }) => {
    return (
      <View style={styles.cardItem}>
        <View style={styles.cardLeft}>
          <Text style={styles.dateText}>Ngày ứng: {formatDate(item.date)}</Text>
          {item.note ? <Text style={styles.noteText}>Lý do: {item.note}</Text> : null}
        </View>
        <Text style={[styles.amountText, { color: '#B45309' }]}>
          -{formatCurrency(item.amount)}
        </Text>
      </View>
    );
  };

  const renderPaymentItem = ({ item }) => {
    return (
      <View style={styles.cardItemBlock}>
        <View style={styles.paymentHeader}>
          <Text style={styles.paymentMonth}>Tháng {item.monthKey}</Text>
          <Text style={styles.paymentFinal}>{formatCurrency(item.finalAmount)}</Text>
        </View>
        <View style={styles.paymentDetails}>
          <Text style={styles.detailText}>Lương cơ bản: {formatCurrency(item.baseSalary)}</Text>
          <Text style={styles.detailText}>Ngày công thực tế: {item.workingDays} công</Text>
          {parseFloat(item.advancesDeducted) > 0 ? (
            <Text style={styles.detailText}>Khấu trừ tạm ứng: -{formatCurrency(item.advancesDeducted)}</Text>
          ) : null}
          {parseFloat(item.bonus) > 0 ? (
            <Text style={styles.detailText}>Thưởng thêm: +{formatCurrency(item.bonus)}</Text>
          ) : null}
          {parseFloat(item.deductions) > 0 ? (
            <Text style={styles.detailText}>Phạt / Trừ lương: -{formatCurrency(item.deductions)}</Text>
          ) : null}
          {item.note ? <Text style={styles.noteText}>Ghi chú: {item.note}</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>👁️ LỊCH SỬ NHÂN VIÊN</Text>
        <Text style={styles.employeeName}>Nhân viên: {employee?.name}</Text>

        {/* Cụm Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'ATTENDANCE' && styles.tabButtonActive]}
            onPress={() => setActiveTab('ATTENDANCE')}
          >
            <Text style={[styles.tabText, activeTab === 'ATTENDANCE' && styles.tabTextActive]}>Chấm công</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'ADVANCE' && styles.tabButtonActive]}
            onPress={() => setActiveTab('ADVANCE')}
          >
            <Text style={[styles.tabText, activeTab === 'ADVANCE' && styles.tabTextActive]}>Tạm ứng</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'PAYMENT' && styles.tabButtonActive]}
            onPress={() => setActiveTab('PAYMENT')}
          >
            <Text style={[styles.tabText, activeTab === 'PAYMENT' && styles.tabTextActive]}>Lịch sử lương</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 40 }} />
        ) : error ? (
          <Text style={styles.errorText}>⚠️ {error}</Text>
        ) : (
          <View style={styles.listContainer}>
            {activeTab === 'ATTENDANCE' && (
              <FlatList
                data={historyData.attendances}
                renderItem={renderAttendanceItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.scrollList}
                ListEmptyComponent={<Text style={styles.emptyText}>Không có dữ liệu chấm công.</Text>}
              />
            )}
            {activeTab === 'ADVANCE' && (
              <FlatList
                data={historyData.advances}
                renderItem={renderAdvanceItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.scrollList}
                ListEmptyComponent={<Text style={styles.emptyText}>Chưa có tạm ứng nào.</Text>}
              />
            )}
            {activeTab === 'PAYMENT' && (
              <FlatList
                data={historyData.payments}
                renderItem={renderPaymentItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.scrollList}
                ListEmptyComponent={<Text style={styles.emptyText}>Chưa có lịch sử nhận lương.</Text>}
              />
            )}
          </View>
        )}

        <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)}>
          <Text style={styles.closeButtonText}>ĐÓNG LẠI</Text>
        </TouchableOpacity>
      </View>
    </SmoothModal>
  );
});

export default EmployeeHistoryModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  employeeName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 15,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    padding: 4,
    marginBottom: 15,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  listContainer: {
    maxHeight: 320,
    minHeight: 200,
  },
  scrollList: {
    paddingBottom: 15,
  },
  cardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardItemBlock: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardLeft: {
    flex: 1,
  },
  dateText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  noteText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeGreen: {
    backgroundColor: '#E8F5E9',
  },
  badgeRed: {
    backgroundColor: '#FFE2E2',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  textGreen: {
    color: '#388E3C',
  },
  textRed: {
    color: '#D32F2F',
  },
  amountText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingBottom: 6,
    marginBottom: 8,
  },
  paymentMonth: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  paymentFinal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },
  paymentDetails: {
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textLight,
    fontSize: 13,
    paddingVertical: 40,
  },
  closeButton: {
    backgroundColor: COLORS.inputBg,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  errorText: {
    color: COLORS.danger,
    textAlign: 'center',
    marginVertical: 20,
    fontSize: 13,
  },
});
