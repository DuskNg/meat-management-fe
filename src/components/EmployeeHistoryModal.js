// meat-management-fe/src/components/EmployeeHistoryModal.js
import React, { useState, forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
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
import PopupModal from './PopupModal';
import { showGlobalToast } from '../store/toastStore';

// Modal xem lịch sử tổng hợp của nhân viên (Ngày nghỉ, Tạm ứng, Bảng lương)
const EmployeeHistoryModal = forwardRef(({ employee, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState(employee);
  const [activeTab, setActiveTab] = useState('LEAVES'); // 'LEAVES' (Nghỉ làm), 'ADVANCE' (Tạm ứng), 'PAYMENT' (Lịch sử lương)
  const [historyData, setHistoryData] = useState({ attendances: [], advances: [], payments: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const activeEmployeeIdRef = useRef(null);
  const popupRef = useRef(null);

  // Đồng bộ thông tin nhân viên khi prop employee thay đổi
  useEffect(() => {
    if (employee) {
      setCurrentEmployee(employee);
    }
  }, [employee]);

  useImperativeHandle(ref, () => ({
    open: (targetEmployee) => {
      const activeEmp = targetEmployee || employee || currentEmployee;
      if (activeEmp) {
        setCurrentEmployee(activeEmp);
      }
      setHistoryData({ attendances: [], advances: [], payments: [] });
      setError('');
      setVisible(true);
      setActiveTab('LEAVES');

      if (activeEmp?.id) {
        fetchHistory(activeEmp.id);
      }
    },
    close: () => {
      setVisible(false);
    },
    refresh: () => {
      const activeId = currentEmployee?.id || employee?.id;
      if (activeId) {
        fetchHistory(activeId);
      }
    },
  }));

  const fetchHistory = async (employeeId) => {
    const id = employeeId || currentEmployee?.id || employee?.id;
    if (!id) {
      setLoading(false);
      return;
    }

    activeEmployeeIdRef.current = id;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/employees/${id}/history`);
      if (activeEmployeeIdRef.current === id) {
        if (response.data?.success) {
          setHistoryData(response.data.data);
        } else {
          setError(response.data?.message || 'Không thể tải lịch sử nhân viên.');
        }
      }
    } catch (err) {
      if (activeEmployeeIdRef.current === id) {
        setError(err.response?.data?.message || 'Lỗi kết nối máy chủ.');
      }
    } finally {
      if (activeEmployeeIdRef.current === id) {
        setLoading(false);
      }
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount).replace('₫', 'đ');
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  // Xóa / Hủy ngày xin nghỉ để hoàn lại buổi lương
  const handleDeleteLeave = (leaveItem) => {
    popupRef.current?.show({
      type: 'confirm',
      title: 'Hủy ngày nghỉ',
      message: `Bạn có chắc muốn xóa bản ghi xin nghỉ ngày ${formatDate(leaveItem.date)} không? Buổi lương hôm đó sẽ được hoàn lại vào bảng lương thực lĩnh.`,
      confirmText: 'Xác nhận xóa',
      cancelText: 'Giữ lại',
      onConfirm: async () => {
        try {
          const res = await api.delete(`/employees/leave/${leaveItem.id}`);
          if (res.data?.success) {
            showGlobalToast('Đã xóa ngày nghỉ và hoàn lại buổi lương thành công!', 'success');
            fetchHistory();
            if (onRefresh) onRefresh();
          } else {
            showGlobalToast(res.data?.message || 'Không thể xóa ngày nghỉ.', 'error');
          }
        } catch (err) {
          showGlobalToast(err.response?.data?.message || 'Lỗi khi xóa ngày nghỉ.', 'error');
        }
      },
    });
  };

  // Render từng dòng xin nghỉ
  const renderLeaveItem = ({ item }) => {
    const isHalf = item.shift === 'HALF';
    return (
      <View style={styles.cardItem}>
        <View style={styles.cardLeft}>
          <Text style={styles.dateText}>📅 Ngày nghỉ: {formatDate(item.date)}</Text>
          {item.note ? <Text style={styles.noteText}>Lý do: {item.note}</Text> : null}
        </View>
        <View style={styles.leaveActionGroup}>
          <View style={[styles.badge, isHalf ? styles.badgeYellow : styles.badgeRed]}>
            <Text style={[styles.badgeText, isHalf ? styles.textYellow : styles.textRed]}>
              {isHalf ? 'Nửa ngày (-0.5 buổi)' : 'Cả ngày (-1 buổi)'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.deleteLeaveBtn}
            onPress={() => handleDeleteLeave(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.deleteLeaveBtnText}>🗑️</Text>
          </TouchableOpacity>
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
          {item.fromDate && item.toDate ? (
            <Text style={[styles.detailText, { color: '#0284C7', fontWeight: 'bold' }]}>
              📅 Kỳ chi trả: {formatDate(item.fromDate)} ➜ {formatDate(item.toDate)}
            </Text>
          ) : null}
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
          {item.note ? <Text style={styles.detailText}>Ghi chú: {item.note}</Text> : null}
          <Text style={styles.detailTime}>Thanh toán lúc: {formatDate(item.paidAt)}</Text>
        </View>
      </View>
    );
  };

  // Danh sách chỉ lấy các ngày xin nghỉ
  const leavesList = historyData.attendances?.filter(
    (item) => item.status === 'ABSENT' || (item.status === 'PRESENT' && item.shift === 'HALF')
  ) || [];

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>👁️ LỊCH SỬ NHÂN VIÊN</Text>
          <Text style={styles.employeeName}>
            Nhân viên: {currentEmployee?.name || employee?.name || ''}
          </Text>

          {/* Cụm Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'LEAVES' && styles.tabButtonActive]}
              onPress={() => setActiveTab('LEAVES')}
            >
              <Text style={[styles.tabText, activeTab === 'LEAVES' && styles.tabTextActive]}>
                Nghỉ làm ({leavesList.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'ADVANCE' && styles.tabButtonActive]}
              onPress={() => setActiveTab('ADVANCE')}
            >
              <Text style={[styles.tabText, activeTab === 'ADVANCE' && styles.tabTextActive]}>
                Tạm ứng ({historyData.advances?.length || 0})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'PAYMENT' && styles.tabButtonActive]}
              onPress={() => setActiveTab('PAYMENT')}
            >
              <Text style={[styles.tabText, activeTab === 'PAYMENT' && styles.tabTextActive]}>
                Lịch sử lương
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 40 }} />
          ) : error ? (
            <Text style={styles.errorText}>⚠️ {error}</Text>
          ) : (
            <View style={styles.listContainer}>
              {activeTab === 'LEAVES' && (
                <FlatList
                  data={leavesList}
                  renderItem={renderLeaveItem}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.scrollList}
                  ListEmptyComponent={<Text style={styles.emptyText}>Chưa có ngày xin nghỉ nào.</Text>}
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

      {/* Modal xác nhận độc lập ở tầng cao nhất */}
      <PopupModal ref={popupRef} />
    </>
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
  leaveActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeYellow: {
    backgroundColor: '#FEF3C7',
  },
  badgeRed: {
    backgroundColor: '#FFE2E2',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  textYellow: {
    color: '#D97706',
  },
  textRed: {
    color: '#D32F2F',
  },
  deleteLeaveBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  deleteLeaveBtnText: {
    fontSize: 13,
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
  detailTime: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 4,
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
