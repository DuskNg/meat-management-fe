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
  };

  const formatPaymentNote = (note, paidAt) => {
    if (!note) return 'Thu tiền nợ';
    const trimNote = note.trim();
    if (trimNote.startsWith('Thanh toán nợ Tháng') && !trimNote.includes('ngày')) {
      const d = new Date(paidAt);
      if (!isNaN(d.getTime())) {
        const dd = d.getDate().toString().padStart(2, '0');
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${trimNote} (ngày ${dd}/${mm}/${yyyy})`;
      }
    }
    return trimNote;
  };

  // Helper xác định tháng mục tiêu của khoản thanh toán dựa trên ghi chú
  const getPaymentTargetMonth = (p) => {
    const trimNote = (p.note || '').trim();
    const monthMatch = trimNote.match(/^Thanh toán nợ Tháng (\d{2})\/(\d{4})/);
    const dateMatch = trimNote.match(/^Thanh toán nợ ngày (\d{2})\/(\d{2})\/(\d{4})/);

    if (monthMatch) {
      return `${monthMatch[1]}/${monthMatch[2]}`;
    }
    if (dateMatch) {
      return `${dateMatch[2]}/${dateMatch[3]}`;
    }
    const d = new Date(p.paidAt);
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${yyyy}`;
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
      
      // Lọc các khoản thanh toán phát sinh trong ngày được chọn VÀ thuộc về tháng tương ứng
      const selectedMonthKey = dateStr.substring(3); // "DD/MM/YYYY" -> "MM/YYYY"
      const dailyPays = payList.filter(p => {
        return toDateKey(p.paidAt) === dateStr && getPaymentTargetMonth(p) === selectedMonthKey;
      });

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
      details: formatPaymentNote(p.note, p.paidAt)
    }))
  ].sort((a, b) => new Date(b.time) - new Date(a.time)); // Mới nhất xếp trên đầu

  // Xử lý xuất công nợ trong ngày dạng ảnh bằng Canvas HTML5
  const handleExportImage = () => {
    if (Platform.OS !== 'web') {
      alert('Chức năng xuất ảnh hiện hỗ trợ trên giao diện Web.');
      return;
    }

    try {
      // 1. Chuẩn bị canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const width = 600;
      const rowHeight = 60;
      const headerHeight = 260;
      const footerHeight = 80;
      const listHeight = timelineItems.length === 0 ? 100 : timelineItems.length * rowHeight;
      const height = headerHeight + listHeight + footerHeight;
      
      canvas.width = width;
      canvas.height = height;

      // Nền trắng toàn ảnh
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // Viền khung ngoài cùng
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, width - 20, height - 20);

      // 2. Vẽ Header nền xanh nhạt sang trọng
      ctx.fillStyle = '#ECFDF5';
      ctx.fillRect(12, 12, width - 24, 130);
      
      // Viền phân cách dưới header
      ctx.strokeStyle = '#A7F3D0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, 142);
      ctx.lineTo(width - 12, 142);
      ctx.stroke();

      // Tiêu đề
      ctx.fillStyle = '#065F46';
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BÁO CÁO CÔNG NỢ TRONG NGÀY', width / 2, 55);

      // Ngày báo cáo
      ctx.fillStyle = '#047857';
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText(`Ngày thống kê: ${selectedDate}`, width / 2, 90);

      // Lời chào/Thời gian xuất
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      ctx.fillStyle = '#64748B';
      ctx.font = 'italic 12px Arial, sans-serif';
      ctx.fillText(`Thời gian xuất: ${timeStr}`, width / 2, 120);

      // 3. Vẽ hộp Tổng kết (Nợ phát sinh & Tiền đã thu)
      const boxY = 165;
      const boxWidth = 265;
      const boxHeight = 70;
      
      // Hộp Nợ phát sinh (bên trái)
      ctx.fillStyle = '#FEF2F2';
      ctx.fillRect(25, boxY, boxWidth, boxHeight);
      ctx.strokeStyle = '#FECACA';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(25, boxY, boxWidth, boxHeight);
      
      ctx.fillStyle = '#991B1B';
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('🔴 Nợ phát sinh trong ngày', 40, boxY + 25);
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText(formatCurrency(totalDebtCreated), 40, boxY + 52);

      // Hộp Tiền đã thu (bên phải)
      ctx.fillStyle = '#F0FDF4';
      ctx.fillRect(310, boxY, boxWidth, boxHeight);
      ctx.strokeStyle = '#BBF7D0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(310, boxY, boxWidth, boxHeight);
      
      ctx.fillStyle = '#166534';
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.fillText('🟢 Tiền đã thu trong ngày', 325, boxY + 25);
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText(formatCurrency(totalPaymentReceived), 325, boxY + 52);

      // 4. Vẽ danh sách chi tiết
      let currentY = boxY + boxHeight + 45;
      
      ctx.fillStyle = '#1E293B';
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.fillText(`Chi tiết giao dịch (${timelineItems.length}):`, 25, currentY - 10);

      if (timelineItems.length === 0) {
        ctx.fillStyle = '#64748B';
        ctx.font = 'italic 14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Không có giao dịch công nợ phát sinh trong ngày.', width / 2, currentY + 45);
      } else {
        timelineItems.forEach((item) => {
          const isDebt = item.type === 'debt';
          
          // Vẽ đường kẻ ngăn cách trên mỗi item
          ctx.strokeStyle = '#F1F5F9';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(25, currentY);
          ctx.lineTo(width - 25, currentY);
          ctx.stroke();

          // Tên khách hàng (căn trái)
          ctx.fillStyle = '#1E293B';
          ctx.font = 'bold 14px Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(item.customerName, 30, currentY + 24);

          // Chi tiết (mặt hàng/ghi chú)
          ctx.fillStyle = '#64748B';
          ctx.font = '12px Arial, sans-serif';
          ctx.fillText(isDebt ? `🥩 ${item.details}` : `💵 ${item.details}`, 30, currentY + 45);

          // Số tiền (căn phải)
          ctx.fillStyle = isDebt ? '#DC2626' : '#16A34A';
          ctx.font = 'bold 14px Arial, sans-serif';
          ctx.textAlign = 'right';
          const amtStr = `${isDebt ? '+' : '-'}${formatCurrency(item.amount)}`;
          ctx.fillText(amtStr, width - 30, currentY + 34);

          currentY += rowHeight;
        });
      }

      // 5. Vẽ Footer
      const footerY = height - 55;
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(25, footerY - 10);
      ctx.lineTo(width - 25, footerY - 10);
      ctx.stroke();

      ctx.fillStyle = '#94A3B8';
      ctx.font = '11px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Hệ thống Quản lý Giao dịch & Công nợ Sạp thịt', width / 2, footerY + 15);
      ctx.fillText('Cảm ơn bạn đã tin dùng dịch vụ!', width / 2, footerY + 32);

      // 6. Thực hiện download ảnh
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `CongNo_Ngay_${selectedDate.replace(/\//g, '_')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('[EXPORT IMAGE ERROR]', err);
      alert('Đã xảy ra lỗi khi xuất ảnh công nợ.');
    }
  };

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
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* Nhóm nút hành động dưới đáy */}
        <View style={styles.footerButtons}>
          {Platform.OS === 'web' && !loading && !error && timelineItems.length > 0 && (
            <TouchableOpacity
              style={styles.exportButton}
              onPress={handleExportImage}
              activeOpacity={0.7}
            >
              <Text style={styles.exportButtonText}>XUẤT ẢNH BÁO CÁO 📸</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.closeButtonNew}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonTextNew}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
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
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  exportButton: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#E0F2FE', // Màu xanh dương nhạt pastel
    borderColor: '#BAE6FD',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  exportButtonText: {
    color: '#0369A1', // Xanh dương đậm
    fontSize: 13,
    fontWeight: 'bold',
  },
  closeButtonNew: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonTextNew: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
