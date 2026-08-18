// meat-management-fe/src/components/EmployeeDailyDebtModal.js
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';
import PopupModal from './PopupModal';
import DatePickerInput from './DatePickerInput';

/**
 * Modal hiển thị danh sách đơn ghi nợ do nhân viên này tạo trong ngày hôm nay.
 * Chỉ dành cho tài khoản thành viên workspace, không hiện với chủ tài khoản.
 */
const EmployeeDailyDebtModal = forwardRef(({ onRefresh, onEditTransaction, popupModalRef }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [userId, setUserId] = useState(null);

  // Lấy chuỗi ngày hôm nay định dạng YYYY-MM-DD theo múi giờ Việt Nam (UTC+7)
  const getTodayDateString = () => {
    const now = new Date();
    const nowVN = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const yyyy = nowVN.getUTCFullYear();
    const mm = String(nowVN.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(nowVN.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [selectedDate, setSelectedDate] = useState(getTodayDateString());

  // Chuyển YYYY-MM-DD sang DD/MM/YYYY để hiển thị trên DatePicker
  const formatIsoToDisplay = (isoStr) => {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    if (parts.length !== 3) return isoStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // Chuyển DD/MM/YYYY sang YYYY-MM-DD để gửi API
  const formatDisplayToIso = (displayStr) => {
    if (!displayStr) return '';
    const parts = displayStr.split('/');
    if (parts.length !== 3) return displayStr;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  // Phơi bày phương thức open ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: (currentUserId) => {
      setUserId(currentUserId);
      const today = getTodayDateString();
      setSelectedDate(today);
      setVisible(true);
      fetchTodayDebts(currentUserId, today);
    },
    close: () => setVisible(false),
    refresh: () => {
      if (userId) {
        fetchTodayDebts(userId, selectedDate);
      }
    },
  }));

  // Lấy danh sách đơn nợ do nhân viên này tạo trong ngày đã chọn
  const fetchTodayDebts = async (createdByUserId, dateStr) => {
    setLoading(true);
    const targetDate = dateStr || selectedDate;
    try {
      const res = await api.get('/transactions', {
        params: {
          createdBy: createdByUserId,
          date: targetDate,
        },
      });
      setTransactions(res.data?.data || []);
    } catch (err) {
      console.error('Lỗi tải danh sách ghi nợ trong ngày:', err);
      popupModalRef.current?.show({
        title: 'Lỗi',
        message: 'Không thể tải danh sách ghi nợ trong ngày.',
        type: 'error',
        confirmText: 'Đóng',
      });
    } finally {
      setLoading(false);
    }
  };

  // Định dạng tiền VNĐ
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount || 0)
      .replace('₫', 'đ');

  // Định dạng giờ tạo đơn
  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const handleEdit = (transaction) => {
    // Không đóng modal danh sách ghi nợ hôm nay khi mở modal sửa, để khi tắt modal sửa thì danh sách vẫn hiển thị
    // setVisible(false);
    if (onEditTransaction) {
      onEditTransaction(transaction);
    }
  };

  const handleDelete = (transactionId) => {
    popupModalRef.current?.show({
      title: 'Xác nhận xóa',
      message: 'Bạn có chắc chắn muốn xóa đơn ghi nợ thịt này không? Hành động này không thể hoàn tác.',
      type: 'confirm',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      onConfirm: async () => {
        setLoading(true);
        try {
          const response = await api.delete(`/transactions/${transactionId}`);
          if (response.data.success) {
            // Xóa trực tiếp khỏi state local (optimistic update) thay vì gọi fetchTodayDebts()
            // để tránh re-render Modal trong khi popup thành công đang hiển thị, gây lỗi portal stacking
            setTransactions((prev) => prev.filter((t) => t.id !== transactionId));
            // Đồng bộ dữ liệu bên ngoài (danh sách khách hàng, số nợ...)
            if (onRefresh) onRefresh();
            popupModalRef.current?.show({
              title: 'Thành công',
              message: 'Đã xóa đơn ghi nợ thịt.',
              type: 'success',
              confirmText: 'Đóng',
            });
          } else {
            popupModalRef.current?.show({
              title: 'Lỗi',
              message: response.data.message || 'Lỗi xóa đơn nợ.',
              type: 'error',
              confirmText: 'Đóng',
            });
          }
        } catch (err) {
          const errMsg = err.response?.data?.message || err.message || 'Lỗi kết nối mạng';
          popupModalRef.current?.show({
            title: 'Lỗi',
            message: errMsg,
            type: 'error',
            confirmText: 'Đóng',
          });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // Tính tổng tiền toàn bộ đơn trong ngày
  const totalAmount = transactions.reduce((sum, t) => sum + (parseFloat(t.totalAmount) || 0), 0);

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          <View style={styles.dragBar} />
          <Text style={styles.modalTitle}>📋 DANH SÁCH GHI NỢ TRONG NGÀY</Text>

          {/* Bộ lọc chọn ngày */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Chọn ngày xem:</Text>
            <DatePickerInput
              value={formatIsoToDisplay(selectedDate)}
              onChange={(newDateDisplay) => {
                const isoDate = formatDisplayToIso(newDateDisplay);
                setSelectedDate(isoDate);
                if (userId) {
                  fetchTodayDebts(userId, isoDate);
                }
              }}
            />
          </View>

          {/* Tổng tiền trong ngày */}
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Tổng đơn đã ghi:</Text>
            <Text style={styles.summaryCount}>{transactions.length} đơn</Text>
            <Text style={styles.summaryLabel}>Tổng tiền:</Text>
            <Text style={styles.summaryAmount}>{formatCurrency(totalAmount)}</Text>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Đang tải...</Text>
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>📭 Bạn chưa ghi nợ nào trong ngày này.</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {transactions.map((t) => (
                <View key={t.id} style={styles.card}>
                  {/* Dòng trên: tên khách + thời gian */}
                  <View style={styles.cardHeader}>
                    <Text style={styles.customerName} numberOfLines={1}>
                      👤 {t.customer?.name || 'Khách hàng'}
                    </Text>
                    <Text style={styles.timeText}>{formatTime(t.createdAt || t.date)}</Text>
                  </View>

                  {/* Danh sách mặt hàng */}
                  {(t.items || []).map((item, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        • {item.product?.name || 'Hàng hóa'}{' '}
                        <Text style={styles.itemDetail}>
                          ({parseFloat(item.quantity)}{item.product?.unit || 'kg'} × {formatCurrency(item.price)} ={' '}
                          <Text style={styles.itemAmountText}>{formatCurrency(item.amount)}</Text>)
                        </Text>
                      </Text>
                    </View>
                  ))}

                  {/* Ghi chú nếu có */}
                  {t.note ? (
                    <Text style={styles.noteText}>📝 {t.note}</Text>
                  ) : null}

                  {/* Tổng tiền đơn & Các nút hành động sửa/xóa */}
                  <View style={styles.cardFooter}>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Tổng đơn:</Text>
                      <Text style={styles.totalAmount}>{formatCurrency(t.totalAmount)}</Text>
                    </View>
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.editBtnMini}
                        onPress={() => handleEdit(t)}
                      >
                        <Text style={styles.editBtnMiniText}>✏️ Sửa</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtnMini}
                        onPress={() => handleDelete(t.id)}
                      >
                        <Text style={styles.deleteBtnMiniText}>🗑️ Xóa</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Nút làm mới và đóng */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => fetchTodayDebts(userId, selectedDate)}
              disabled={loading}
            >
              <Text style={styles.refreshBtnText}>🔄 Làm mới</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setVisible(false)}
            >
              <Text style={styles.closeBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SmoothModal>
    </>
  );
});

export default EmployeeDailyDebtModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '88%',
  },
  dragBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 14,
  },
  // Khung tổng hợp đầu trang
  summaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 6,
    flexWrap: 'wrap',
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  summaryCount: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  summaryAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginLeft: 'auto',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  emptyBox: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textLight,
    fontSize: 14,
    fontStyle: 'italic',
  },
  list: {
    maxHeight: 420,
    marginBottom: 10,
  },
  // Card mỗi đơn ghi nợ
  card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  customerName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
  },
  timeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  itemRow: {
    paddingVertical: 1,
    paddingLeft: 4,
    marginBottom: 0,
  },
  itemName: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
  },
  itemDetail: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '400',
  },
  itemAmountText: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  noteText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginRight: 6,
  },
  totalAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtnMini: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  editBtnMiniText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#D97706',
  },
  deleteBtnMini: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  deleteBtnMiniText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  // Footer buttons
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  refreshBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshBtnText: {
    color: '#1E40AF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  closeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: COLORS.textSecondary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
});
