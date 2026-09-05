// meat-management-fe/src/components/TransactionDetailModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import PinInputModal from './PinInputModal';
import PinSetupModal from './PinSetupModal';
import PopupModal from './PopupModal';
import { hasPin, isSessionValid } from '../store/pinStore';

/**
 * Modal hiển thị chi tiết tất cả giao dịch trong một ngày.
 *
 * Nhận dayGroup qua ref.open(dayGroup):
 * {
 *   dateKey:      string,    "10/06/2026"
 *   date:         string,    ISO date đại diện
 *   transactions: Array,     đơn ghi nợ trong ngày
 *   payments:     Array,     lượt thu tiền trong ngày
 *   totalDebt:    number,
 *   totalPayment: number,
 * }
 */
const TransactionDetailModal = forwardRef(({ customerId, monthGroups, onRefresh, onEditTransaction, onEditPayment }, ref) => {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [dayGroupState, setDayGroupState] = useState(null);
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Tự động phân tích và lấy dayGroup mới nhất từ monthGroups (đồng bộ hoàn hảo với Grid bên ngoài)
  const dayGroup = React.useMemo(() => {
    if (monthGroups && selectedDateKey) {
      for (const m of monthGroups) {
        const found = m.days.find(d => d.dateKey === selectedDateKey);
        if (found) return found;
      }
    }
    return dayGroupState;
  }, [monthGroups, selectedDateKey, dayGroupState]);

  // Các refs cho Modal PIN và Popup thông báo
  const pinInputRef = useRef(null);
  const pinSetupRef = useRef(null);
  const popupModalRef = useRef(null);
  const isSubmittingRef = useRef(false);

  // Kiểm tra mã PIN trước khi thực hiện thao tác nhạy cảm
  const requirePin = async (action) => {
    const pinExists = await hasPin();
    if (!pinExists) {
      pinSetupRef.current?.open(action);
      return;
    }
    const sessionOk = await isSessionValid();
    if (sessionOk) {
      action();
    } else {
      pinInputRef.current?.open(action, 'xác nhận xóa');
    }
  };

  // Xóa đơn ghi nợ thịt
  const handleDeleteTransaction = (transactionId) => {
    popupModalRef.current?.show({
      title: 'Xác nhận xóa đơn nợ',
      message: 'Bạn có chắc chắn muốn xóa đơn ghi nợ thịt này không? Hành động này không thể hoàn tác.',
      type: 'confirm',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      onConfirm: () => {
        requirePin(async () => {
          if (loading || isSubmittingRef.current) return;
          setLoading(true);
          setError('');
          isSubmittingRef.current = true;
          try {
            const response = await api.delete(`/transactions/${transactionId}`);
            if (response.data.success) {
              Alert.alert('Thành công', 'Đã xóa đơn ghi nợ thịt.');
              // Cập nhật ngay React Query Cache để màn hình cha và drawer tháng đổi số tức thì
              queryClient.setQueryData(['transactions', customerId], (oldData) => {
                if (!oldData || !oldData.data) return oldData;
                return {
                  ...oldData,
                  data: oldData.data.filter(t => t.id !== transactionId)
                };
              });

              setDayGroupState(prev => {
                if (!prev) return null;
                const updatedTransactions = prev.transactions.filter(t => t.id !== transactionId);
                if (updatedTransactions.length === 0 && prev.payments.length === 0) {
                  setVisible(false);
                  return null;
                }
                const newTotalDebt = updatedTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
                const remaining = newTotalDebt - prev.totalPayment;
                return {
                  ...prev,
                  transactions: updatedTransactions,
                  totalDebt: newTotalDebt,
                  remainingDebt: remaining >= 0 ? remaining : 0
                };
              });
              if (onRefresh) onRefresh();
            } else {
              Alert.alert('Lỗi', response.data.message || 'Lỗi xóa đơn nợ.');
              setError(response.data.message || 'Lỗi xóa đơn nợ. Vui lòng thử lại.');
            }
          } catch (err) {
            const errMsg = err.response?.data?.message || err.message || 'Lỗi kết nối mạng';
            Alert.alert('Lỗi', errMsg);
            setError(errMsg);
          } finally {
            setLoading(false);
            isSubmittingRef.current = false;
          }
        });
      }
    });
  };

  // Xóa lượt thu tiền
  const handleDeletePayment = (paymentId) => {
    popupModalRef.current?.show({
      title: 'Xác nhận xóa lượt thu tiền',
      message: 'Bạn có chắc chắn muốn xóa lượt thu tiền trả nợ này không? Hành động này không thể hoàn tác.',
      type: 'confirm',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      onConfirm: () => {
        requirePin(async () => {
          if (loading || isSubmittingRef.current) return;
          setLoading(true);
          setError('');
          isSubmittingRef.current = true;
          try {
            const response = await api.delete(`/payments/${paymentId}`);
            if (response.data.success) {
              Alert.alert('Thành công', 'Đã xóa lượt thu tiền.');
              // Cập nhật ngay React Query Cache để màn hình cha và drawer tháng đổi số tức thì
              queryClient.setQueryData(['payments', customerId], (oldData) => {
                if (!oldData || !oldData.data) return oldData;
                return {
                  ...oldData,
                  data: oldData.data.filter(p => p.id !== paymentId)
                };
              });

              setDayGroupState(prev => {
                if (!prev) return null;
                const updatedPayments = prev.payments.filter(p => p.id !== paymentId);
                if (prev.transactions.length === 0 && updatedPayments.length === 0) {
                  setVisible(false);
                  return null;
                }
                const newTotalPayment = updatedPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
                const remaining = prev.totalDebt - newTotalPayment;
                return {
                  ...prev,
                  payments: updatedPayments,
                  totalPayment: newTotalPayment,
                  remainingDebt: remaining >= 0 ? remaining : 0
                };
              });
              if (onRefresh) onRefresh();
            } else {
              Alert.alert('Lỗi', response.data.message || 'Lỗi xóa lượt thu tiền.');
              setError(response.data.message || 'Lỗi xóa lượt thu tiền. Vui lòng thử lại.');
            }
          } catch (err) {
            const errMsg = err.response?.data?.message || err.message || 'Lỗi kết nối mạng';
            Alert.alert('Lỗi', errMsg);
            setError(errMsg);
          } finally {
            setLoading(false);
            isSubmittingRef.current = false;
          }
        });
      }
    });
  };

  // Phơi bày open/close ra component cha
  useImperativeHandle(ref, () => ({
    open: (group) => {
      setDayGroupState(group);
      setSelectedDateKey(group.dateKey);
      setVisible(true);
      setError('');
      setLoading(false);
    },
    close: () => setVisible(false),
  }));

  const formatPaymentNote = (note, paidAt) => {
    if (!note) return 'Thu tiền nợ';
    const trimNote = note.trim();
    if (trimNote === '[Trả hàng nhanh] Trừ tiền công nợ đơn trong ngày' || trimNote === 'Trả hàng' || trimNote === 'Trả lại hàng') {
      return 'Trả lại hàng';
    }
    if (trimNote.startsWith('[Trả hàng nhanh]')) {
      return trimNote.replace('[Trả hàng nhanh]', '[Trả lại hàng]');
    }
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

  const handleMarkAsPaid = async () => {
    if (loading || isSubmittingRef.current || !dayGroup || !customerId) {
      Alert.alert('Thông báo', `Bị chặn gửi: loading=${loading}, isSubmitting=${isSubmittingRef.current}, hasDayGroup=${!!dayGroup}, customerId=${customerId}`);
      return;
    }
    setLoading(true);
    setError('');
    isSubmittingRef.current = true;
    try {
      // Lấy số nợ còn lại thực tế của ngày sau khi đã phân bổ
      const remainingDebt = dayGroup.remainingDebt !== undefined ? dayGroup.remainingDebt : (dayGroup.totalDebt - dayGroup.totalPayment);
      
      const response = await api.post('/payments', {
        customerId,
        amount: remainingDebt,
        note: `Thanh toán nợ ngày ${dayGroup.dateKey}`,
      });

      if (response.data.success) {
        Alert.alert('Thành công', 'Đã thanh toán nợ ngày hôm nay.');
        const newPayment = response.data.data;
        // Cập nhật ngay React Query Cache để màn hình cha và drawer tháng đổi số tức thì
        queryClient.setQueryData(['payments', customerId], (oldData) => {
          if (!oldData) return { success: true, data: [newPayment] };
          const oldList = oldData.data || [];
          return {
            ...oldData,
            data: [...oldList, newPayment]
          };
        });

        setDayGroupState(prev => {
          if (!prev) return null;
          const updatedPayments = [...prev.payments, newPayment];
          const newTotalPayment = updatedPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
          const remaining = prev.totalDebt - newTotalPayment;
          return {
            ...prev,
            payments: updatedPayments,
            totalPayment: newTotalPayment,
            remainingDebt: remaining >= 0 ? remaining : 0
          };
        });
        if (onRefresh) onRefresh();
      } else {
        Alert.alert('Thất bại', response.data.message || 'Lỗi thanh toán.');
        setError(response.data.message || 'Lỗi thanh toán. Vui lòng thử lại.');
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Lỗi kết nối mạng';
      Alert.alert('Lỗi mạng/máy chủ', errMsg);
      setError(errMsg);
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // ─── Helper: định dạng tiền VNĐ ────────────────────────────────────────
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount)
      .replace('₫', 'đ');

  // Helper chuyển đổi chuỗi ngày ISO thành dạng khóa "DD/MM/YYYY"
  const toDateKey = (dateStr) => {
    const d = new Date(dateStr);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // ─── Helper: lấy thứ trong tuần tiếng Việt đầy đủ ─────────────────────
  const getFullWeekday = (dateStr) => {
    const d = new Date(dateStr);
    return ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][d.getDay()];
  };

  if (!dayGroup) return null;

  const { transactions = [], payments = [], totalDebt = 0, totalPayment = 0, dateKey } = dayGroup;
  // Số nợ còn lại của ngày sau phân bổ FIFO
  const remainingDebt = dayGroup.remainingDebt !== undefined ? dayGroup.remainingDebt : (totalDebt - totalPayment);
  const hasDebt = totalDebt > 0;

  // Helper phân loại Trả hàng
  const isReturnGoodsItem = (item) => {
    if (!item) return false;
    const note = item.note || '';
    return note.includes('Trả hàng') || note.includes('Trả lại');
  };

  // Tính toán riêng biệt số tiền Hàng trả về (cam) và số tiền Đã thanh toán (xanh)
  let returnDeducted = 0;
  let paymentDeducted = 0;

  if (hasDebt) {
    transactions.forEach((t) => {
      (t.allocations || []).forEach((alloc) => {
        if (isReturnGoodsItem(alloc)) {
          returnDeducted += parseFloat(alloc.amount || 0);
        } else {
          paymentDeducted += parseFloat(alloc.amount || 0);
        }
      });
    });

    const returnPaymentsOnDay = payments.filter((p) => isReturnGoodsItem(p)).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const normalPaymentsOnDay = payments.filter((p) => !isReturnGoodsItem(p)).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    if (returnDeducted === 0 && returnPaymentsOnDay > 0) {
      returnDeducted = Math.min(returnPaymentsOnDay, totalDebt);
    }
    if (paymentDeducted === 0 && normalPaymentsOnDay > 0) {
      paymentDeducted = Math.min(normalPaymentsOnDay, Math.max(0, totalDebt - returnDeducted));
    }
  } else {
    returnDeducted = payments.filter((p) => isReturnGoodsItem(p)).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    paymentDeducted = payments.filter((p) => !isReturnGoodsItem(p)).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  }

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* Thanh kéo (drag indicator) */}
        <View style={styles.dragBar} />

        {/* ── NGÀY TIÊU ĐỀ ── */}
        <View style={styles.dateHeader}>
          <Text style={styles.weekdayText}>{getFullWeekday(dayGroup.date)}</Text>
          <Text style={styles.dateText}>Ngày {dateKey}</Text>
        </View>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        {/* ── TỔNG KẾT NGÀY (Ghi nợ + Hàng trả về màu cam + Đã thanh toán màu xanh) ── */}
        <View style={styles.summaryRow}>
          {hasDebt && (
            <View style={[styles.summaryBadge, styles.debtBadge]}>
              <Text style={styles.summaryBadgeLabel}>🔴 Ghi nợ</Text>
              <Text style={styles.summaryBadgeAmount}>+{formatCurrency(totalDebt)}</Text>
            </View>
          )}

          {returnDeducted > 0 && (
            <View style={[styles.summaryBadge, styles.returnBadge]}>
              <Text style={[styles.summaryBadgeLabel, { color: '#C2410C' }]}>🟠 Hàng trả về</Text>
              <Text style={[styles.summaryBadgeAmount, { color: '#EA580C' }]}>
                -{formatCurrency(returnDeducted)}
              </Text>
            </View>
          )}

          {paymentDeducted > 0 && (
            <View style={[styles.summaryBadge, styles.paymentBadge]}>
              <Text style={styles.summaryBadgeLabel}>{hasDebt ? '🟢 Đã thanh toán' : '🟢 Thu tiền'}</Text>
              <Text style={[styles.summaryBadgeAmount, { color: COLORS.primaryDark }]}>
                -{formatCurrency(paymentDeducted)}
              </Text>
            </View>
          )}
        </View>

        {/* ── HIỂN THỊ NỢ CÒN LẠI CỦA NGÀY (nếu có phát sinh nợ và có phân bổ thanh toán hoặc trả hàng) ── */}
        {hasDebt && (remainingDebt < totalDebt) && (
          <View style={[styles.netRow, remainingDebt > 0 ? styles.netRowDebt : styles.netRowOk]}>
            <Text style={styles.netLabel}>Còn lại chưa thanh toán:</Text>
            <Text style={[styles.netAmount, { color: remainingDebt > 0 ? COLORS.danger : COLORS.primary }]}>
              {formatCurrency(remainingDebt)}
            </Text>
          </View>
        )}

        <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>

          {/* ── DANH SÁCH ĐƠN GHI NỢ ── */}
          {transactions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🥩 Đơn ghi nợ thịt</Text>
              {transactions.map((t, tIdx) => (
                <View key={t.id} style={styles.transactionCard}>
                  {/* Header đơn: số thứ tự + nút sửa + tổng tiền đơn */}
                  <View style={styles.transCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.transCardNum}>Đơn #{tIdx + 1}</Text>
                      <TouchableOpacity
                        style={styles.editCardBtn}
                        onPress={() => {
                          setVisible(false);
                          if (onEditTransaction) onEditTransaction(t);
                        }}
                      >
                        <Text style={styles.editCardText}>✏️ Sửa</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteCardBtn}
                        onPress={() => handleDeleteTransaction(t.id)}
                      >
                        <Text style={styles.deleteCardText}>🗑️ Xóa</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.transCardTotal}>{formatCurrency(t.amount)}</Text>
                  </View>

                  {/* Danh sách mặt hàng trong đơn */}
                  {t.items && t.items.length > 0 ? (
                    (() => {
                      // Nhóm và cộng dồn các mặt hàng cùng loại thịt để hiển thị gộp
                      const displayItemsMap = {};
                      t.items.forEach((it) => {
                        const key = it.productId;
                        const qty = parseFloat(it.quantity);
                        const priceVal = parseFloat(it.price);
                        if (displayItemsMap[key]) {
                          // Cộng dồn khối lượng
                          displayItemsMap[key].quantity += qty;
                          // Cập nhật đơn giá mới nhất
                          displayItemsMap[key].price = priceVal;
                        } else {
                          // Khởi tạo phần tử mới
                          displayItemsMap[key] = {
                            ...it,
                            quantity: qty,
                            price: priceVal,
                          };
                        }
                      });
                      return Object.values(displayItemsMap).map((it, iIdx) => (
                        <View key={iIdx} style={styles.itemRow}>
                          {/* Tên sản phẩm + thành tiền */}
                          <View style={styles.itemRowHeader}>
                            <Text style={styles.itemName}>{it.product?.name}</Text>
                            <Text style={styles.itemSubtotal}>
                              {formatCurrency(it.quantity * it.price)}
                            </Text>
                          </View>
                          {/* Khối lượng × đơn giá */}
                          {!(it.product?.name === 'Tiền hàng' || (it.product?.name && it.product.name.toLowerCase().startsWith('tiền')) || t.note === 'Ghi nợ nhanh') && (
                            <Text style={styles.itemMeta}>
                              {it.quantity} {it.product?.unit}
                              {'  ×  '}
                              {formatCurrency(it.price)}
                            </Text>
                          )}
                        </View>
                      ));
                    })()
                  ) : null}

                  {/* Ghi chú đơn hàng (nếu có) */}
                  {t.note ? (
                    <Text style={styles.transNote}>📝 {t.note}</Text>
                  ) : null}

                  {/* Lịch sử khấu trừ thanh toán / trả hàng */}
                  {t.allocations && t.allocations.length > 0 && (
                    <View style={styles.allocationBox}>
                      <Text style={styles.allocationTitle}>🔗 Đã khấu trừ từ các lần trả:</Text>
                      {t.allocations.map((alloc, aIdx) => {
                        const isRet = alloc.note?.includes('Trả hàng') || alloc.note?.includes('Trả lại');
                        return (
                          <Text key={aIdx} style={styles.allocationItem}>
                            • {isRet ? 'Trừ trả hàng' : 'Đã trả'} <Text style={styles.boldText}>{formatCurrency(alloc.amount)}</Text> vào ngày {toDateKey(alloc.date)}
                          </Text>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* ── DANH SÁCH HÀNG TRẢ LẠI ── */}
          {payments.filter((p) => isReturnGoodsItem(p)).length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: '#C2410C' }]}>↩️ Hàng khách trả lại</Text>
              {payments.filter((p) => isReturnGoodsItem(p)).map((p, pIdx) => (
                <View key={p.id || pIdx} style={[styles.paymentCard, styles.paymentCardReturnGoods]}>
                  <View style={styles.transCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                      <Text style={[styles.paymentLabel, { color: '#C2410C' }]}>
                        Trả hàng #{pIdx + 1}
                      </Text>
                      <TouchableOpacity
                        style={styles.editCardBtn}
                        onPress={() => {
                          setVisible(false);
                          if (onEditPayment) onEditPayment(p);
                        }}
                      >
                        <Text style={styles.editCardText}>✏️ Sửa</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteCardBtn}
                        onPress={() => handleDeletePayment(p.id)}
                      >
                        <Text style={styles.deleteCardText}>🗑️ Xóa</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.transCardTotal, { color: '#EA580C' }]}>
                      -{formatCurrency(p.amount)}
                    </Text>
                  </View>
                  {p.note ? (
                    <Text style={styles.transNote}>📝 {formatPaymentNote(p.note, p.paidAt)}</Text>
                  ) : null}

                  {/* Lịch sử khấu trừ hóa đơn nợ */}
                  {p.allocations && p.allocations.length > 0 && (
                    <View style={styles.allocationBox}>
                      <Text style={styles.allocationTitle}>🔗 Khấu trừ cho các đơn nợ:</Text>
                      {p.allocations.map((alloc, aIdx) => (
                        <Text key={aIdx} style={styles.allocationItem}>
                          • Khấu trừ <Text style={styles.boldText}>{formatCurrency(alloc.amount)}</Text> cho đơn nợ ngày {toDateKey(alloc.date)}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* ── DANH SÁCH LƯỢT THU TIỀN ── */}
          {payments.filter((p) => !isReturnGoodsItem(p)).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💵 Thu tiền khách trả nợ</Text>
              {payments.filter((p) => !isReturnGoodsItem(p)).map((p, pIdx) => (
                <View key={p.id || pIdx} style={styles.paymentCard}>
                  <View style={styles.transCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                      <Text style={styles.paymentLabel}>
                        Lượt #{pIdx + 1}
                      </Text>
                      <TouchableOpacity
                        style={styles.editCardBtn}
                        onPress={() => {
                          setVisible(false);
                          if (onEditPayment) onEditPayment(p);
                        }}
                      >
                        <Text style={styles.editCardText}>✏️ Sửa</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteCardBtn}
                        onPress={() => handleDeletePayment(p.id)}
                      >
                        <Text style={styles.deleteCardText}>🗑️ Xóa</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.transCardTotal, { color: COLORS.primaryDark }]}>
                      -{formatCurrency(p.amount)}
                    </Text>
                  </View>
                  {p.note ? (
                    <Text style={styles.transNote}>📝 {formatPaymentNote(p.note, p.paidAt)}</Text>
                  ) : null}

                  {/* Lịch sử khấu trừ hóa đơn nợ */}
                  {p.allocations && p.allocations.length > 0 && (
                    <View style={styles.allocationBox}>
                      <Text style={styles.allocationTitle}>🔗 Khấu trừ cho các đơn nợ:</Text>
                      {p.allocations.map((alloc, aIdx) => (
                        <Text key={aIdx} style={styles.allocationItem}>
                          • Khấu trừ <Text style={styles.boldText}>{formatCurrency(alloc.amount)}</Text> cho đơn nợ ngày {toDateKey(alloc.date)}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* ── NÚT HÀNH ĐỘNG ── */}
        <View style={styles.buttonContainer}>
          {remainingDebt > 0 && (
            <TouchableOpacity
              style={[styles.button, styles.payButton]}
              onPress={handleMarkAsPaid}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.payButtonText}>🟢 ĐÃ TRẢ ĐỦ</Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.button, styles.closeButton]}
            onPress={() => setVisible(false)}
            disabled={loading}
          >
            <Text style={styles.closeButtonText}>ĐÓNG</Text>
          </TouchableOpacity>
        </View>
      </View>
      {/* Modal nhập PIN khi phiên hết hạn */}
      <PinInputModal ref={pinInputRef} />
      {/* Modal tạo PIN lần đầu */}
      <PinSetupModal ref={pinSetupRef} />
      {/* Popup thông báo dùng chung */}
      <PopupModal ref={popupModalRef} />
    </SmoothModal>
  );
});

export default TransactionDetailModal;

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'transparent',
  },
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 14,
    maxHeight: '85%',
  },
  dragBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 18,
  },

  // ── Header ngày ──────────────────────────────────────────────────────────
  dateHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  weekdayText: {
    fontSize: FONTS.caption,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  dateText: {
    fontSize: FONTS.title,
    fontWeight: 'bold',
    color: COLORS.text,
  },

  // ── Badge tổng kết ngày ──────────────────────────────────────────────────
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  summaryBadge: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  debtBadge: {
    backgroundColor: COLORS.dangerLight,
    borderColor: '#FECACA',
  },
  returnBadge: {
    backgroundColor: '#FFF7ED', // Nền cam nhạt cho Hàng trả về
    borderColor: '#FED7AA',     // Viền cam
  },
  paymentBadge: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#A7F3D0',
  },
  summaryBadgeLabel: {
    fontSize: FONTS.caption,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  summaryBadgeAmount: {
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
    color: COLORS.danger,
  },

  // ── Số dư net trong ngày ─────────────────────────────────────────────────
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  netRowDebt: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  netRowOk: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  netLabel: {
    fontSize: FONTS.body,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  netAmount: {
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
  },

  // ── Scroll nội dung ──────────────────────────────────────────────────────
  detailScroll: {
    maxHeight: 340,
    marginBottom: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
  },

  // ── Card đơn ghi nợ ─────────────────────────────────────────────────────
  transactionCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.danger,
  },
  transCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  transCardNum: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  transCardTotal: {
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  itemRow: {
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: '#FEE2E2',
  },
  itemRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  itemName: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  itemSubtotal: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  itemMeta: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
  },
  transNote: {
    marginTop: 8,
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },

  // ── Card thu tiền ────────────────────────────────────────────────────────
  paymentCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  paymentCardReturnGoods: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderLeftWidth: 4,
    borderLeftColor: '#EA580C',
  },
  paymentLabel: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },

  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 10,
    borderRadius: 8,
    fontSize: FONTS.body,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  // ── Buttons ──────────────────────────────────────────────────────────────
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  button: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeButtonText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  payButton: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  payButtonText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  editCardBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  editCardText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  deleteCardBtn: {
    backgroundColor: '#FFF1F1',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  deleteCardText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  allocationBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  allocationTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  allocationItem: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  boldText: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
});
