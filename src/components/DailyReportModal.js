// meat-management-fe/src/components/DailyReportModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';
import DatePickerInput from './DatePickerInput';

const DailyReportModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(''); // Định dạng DD/MM/YYYY
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');

  // 1. Phơi bày hàm open/close ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: () => {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const todayStr = `${dd}/${mm}/${yyyy}`;
      
      setSelectedDate(todayStr);
      setVisible(true);
      setError('');
      fetchDailyData(todayStr);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Định dạng hiển thị tiền VNĐ
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  // Helper chuyển đổi chuỗi ngày ISO sang dạng khóa "DD/MM/YYYY" để so sánh
  const toDateKey = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // 2. Tải toàn bộ giao dịch & thu tiền để lọc theo ngày
  const fetchDailyData = async (dateStr) => {
    setLoading(true);
    setError('');
    try {
      // Gọi API lấy toàn bộ giao dịch và thanh toán của chủ buôn (không lọc theo customerId)
      const [transRes, payRes] = await Promise.all([
        api.get('/transactions'),
        api.get('/payments')
      ]);

      const transList = transRes.data?.data || [];
      const payList = payRes.data?.data || [];

      // Lọc các giao dịch phát sinh trong ngày được chọn
      const dailyTrans = transList.filter(t => toDateKey(t.date) === dateStr);
      // Lọc các khoản thanh toán phát sinh trong ngày được chọn
      const dailyPays = payList.filter(p => toDateKey(p.paidAt) === dateStr);

      setTransactions(dailyTrans);
      setPayments(dailyPays);
    } catch (err) {
      console.error('[DAILY REPORT FETCH ERROR]', err);
      setError('Không thể tải dữ liệu thống kê trong ngày.');
    } finally {
      setLoading(false);
    }
  };

  // Xử lý khi người dùng đổi ngày trên DatePicker
  const handleDateChange = (newDateStr) => {
    setSelectedDate(newDateStr);
    fetchDailyData(newDateStr);
  };

  // Tính tổng nợ phát sinh và tổng đã thu trong ngày
  const totalDebtCreated = transactions.reduce((sum, t) => sum + parseFloat(t.totalAmount || 0), 0);
  const totalPaymentReceived = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  // Gộp chung giao dịch và thanh toán thành một dòng thời gian hiển thị
  const timelineItems = [
    ...transactions.map(t => ({
      id: t.id,
      type: 'debt',
      time: t.date,
      customerName: t.customer?.name || 'Khách ẩn danh',
      amount: parseFloat(t.totalAmount || 0),
      note: t.note,
      details: t.items?.map(item => {
        const qty = parseFloat(item.quantity);
        const name = item.product?.name || 'Thịt';
        return `${qty}${item.product?.unit || 'kg'} ${name}`;
      }).join(', ')
    })),
    ...payments.map(p => ({
      id: p.id,
      type: 'payment',
      time: p.paidAt,
      customerName: p.customer?.name || 'Khách ẩn danh',
      amount: parseFloat(p.amount || 0),
      note: p.note,
      details: p.note || 'Thu tiền nợ'
    }))
  ].sort((a, b) => new Date(b.time) - new Date(a.time)); // Mới nhất xếp trên đầu

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <View style={styles.dragBar} />
        <Text style={styles.modalTitle}>📊 THỐNG KÊ CÔNG NỢ TRONG NGÀY</Text>

        {/* Thanh chọn ngày */}
        <View style={styles.datePickerContainer}>
          <Text style={styles.sectionLabel}>Chọn ngày xem thống kê:</Text>
          <DatePickerInput
            value={selectedDate}
            onChange={handleDateChange}
            allowFuture={true}
          />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Đang tổng hợp dữ liệu...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity
              style={[styles.button, styles.retryButton]}
              onPress={() => fetchDailyData(selectedDate)}
            >
              <Text style={styles.retryButtonText}>TẢI LẠI DỮ LIỆU</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.mainContent}>
            {/* Hộp tổng kết nhanh trong ngày */}
            <View style={styles.summaryContainer}>
              <View style={[styles.summaryBox, styles.debtBox]}>
                <Text style={styles.summaryBoxLabel}>🔴 Nợ phát sinh</Text>
                <Text style={styles.summaryBoxValue}>{formatCurrency(totalDebtCreated)}</Text>
              </View>
              <View style={[styles.summaryBox, styles.paymentBox]}>
                <Text style={styles.summaryBoxLabel}>🟢 Tiền đã thu</Text>
                <Text style={styles.summaryBoxValue}>{formatCurrency(totalPaymentReceived)}</Text>
              </View>
            </View>

            {/* Tiêu đề danh sách chi tiết */}
            <Text style={styles.listTitle}>📝 Danh sách chi tiết ({timelineItems.length}):</Text>

            {timelineItems.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Không có giao dịch công nợ phát sinh trong ngày này.</Text>
              </View>
            ) : (
              <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
                {timelineItems.map((item) => {
                  const isDebt = item.type === 'debt';
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.itemCard,
                        isDebt ? styles.itemCardDebt : styles.itemCardPayment
                      ]}
                    >
                      <View style={styles.itemHeader}>
                        <Text style={styles.customerName}>{item.customerName}</Text>
                        <Text style={[styles.itemAmount, isDebt ? styles.amountDebt : styles.amountPayment]}>
                          {isDebt ? '+' : '-'}{formatCurrency(item.amount)}
                        </Text>
                      </View>
                      
                      {item.details ? (
                        <Text style={styles.itemDetails} numberOfLines={2}>
                          {isDebt ? `🥩 ${item.details}` : `💵 ${item.details}`}
                        </Text>
                      ) : null}

                      {/* Hiển thị thời gian cụ thể (giờ:phút) */}
                      <Text style={styles.itemTime}>
                        🕒 {new Date(item.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* Nút đóng */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => setVisible(false)}
        >
          <Text style={styles.closeButtonText}>ĐÓNG LẠI</Text>
        </TouchableOpacity>
      </View>
    </SmoothModal>
  );
});

export default DailyReportModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  dragBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 15,
  },
  datePickerContainer: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  errorContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 15,
    width: '100%',
  },
  mainContent: {
    flexDirection: 'column',
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  summaryBox: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'flex-start',
    ...SHADOWS.card,
  },
  debtBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  paymentBox: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  summaryBoxLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  summaryBoxValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  emptyText: {
    color: COLORS.textLight,
    fontStyle: 'italic',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  scrollList: {
    maxHeight: 320,
    marginBottom: 16,
  },
  itemCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'column',
    gap: 4,
  },
  itemCardDebt: {
    backgroundColor: COLORS.card,
    borderColor: '#FEE2E2',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.danger,
  },
  itemCardPayment: {
    backgroundColor: COLORS.card,
    borderColor: '#DCFCE7',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  itemAmount: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  amountDebt: {
    color: COLORS.dangerDark,
  },
  amountPayment: {
    color: COLORS.primaryDark,
  },
  itemDetails: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  itemTime: {
    fontSize: 10,
    color: COLORS.textLight,
    marginTop: 2,
  },
  button: {
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
