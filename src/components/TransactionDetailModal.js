// meat-management-fe/src/components/TransactionDetailModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';

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
const TransactionDetailModal = forwardRef(({ customerId, onRefresh, onEditTransaction, onEditPayment }, ref) => {
  const [visible, setVisible] = useState(false);
  const [dayGroup, setDayGroup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Phơi bày open/close ra component cha
  useImperativeHandle(ref, () => ({
    open: (group) => {
      setDayGroup(group);
      setVisible(true);
      setError('');
      setLoading(false);
    },
    close: () => setVisible(false),
  }));

  const handleMarkAsPaid = async () => {
    if (!dayGroup || !customerId) return;
    setLoading(true);
    setError('');
    try {
      // Lấy số nợ còn lại thực tế của ngày sau khi đã phân bổ theo FIFO
      const remainingDebt = dayGroup.remainingDebt !== undefined ? dayGroup.remainingDebt : (dayGroup.totalDebt - dayGroup.totalPayment);
      const response = await api.post('/payments', {
        customerId,
        amount: remainingDebt,
        paidAt: dayGroup.date, // Ghi nhận thanh toán vào đúng ngày của giao dịch
        note: `Thanh toán nợ ngày ${dayGroup.dateKey}`,
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi thanh toán. Vui lòng thử lại.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Helper: định dạng tiền VNĐ ────────────────────────────────────────
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount)
      .replace('₫', 'đ');

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
  const hasPayment = totalPayment > 0;

  // Tính số tiền đã thanh toán (khấu trừ) cho ngày này
  const paidAmount = totalDebt - remainingDebt;
  const hasPaidAmount = paidAmount > 0;

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

        {/* ── TỔNG KẾT NGÀY (debt + payment badges) ── */}
        <View style={styles.summaryRow}>
          {hasDebt && (
            <View style={[styles.summaryBadge, styles.debtBadge]}>
              <Text style={styles.summaryBadgeLabel}>🔴 Ghi nợ</Text>
              <Text style={styles.summaryBadgeAmount}>+{formatCurrency(totalDebt)}</Text>
            </View>
          )}
          {hasDebt ? (
            hasPaidAmount ? (
              <View style={[styles.summaryBadge, styles.paymentBadge]}>
                <Text style={styles.summaryBadgeLabel}>🟢 Đã thanh toán</Text>
                <Text style={[styles.summaryBadgeAmount, { color: COLORS.primaryDark }]}>
                  -{formatCurrency(paidAmount)}
                </Text>
              </View>
            ) : null
          ) : (
            hasPayment ? (
              <View style={[styles.summaryBadge, styles.paymentBadge]}>
                <Text style={styles.summaryBadgeLabel}>🟢 Thu tiền</Text>
                <Text style={[styles.summaryBadgeAmount, { color: COLORS.primaryDark }]}>
                  -{formatCurrency(totalPayment)}
                </Text>
              </View>
            ) : null
          )}
        </View>

        {/* ── HIỂN THỊ NỢ CÒN LẠI CỦA NGÀY (nếu có phát sinh nợ và có phân bổ thanh toán) ── */}
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                          <Text style={styles.itemMeta}>
                            {it.quantity} {it.product?.unit}
                            {'  ×  '}
                            {formatCurrency(it.price)}
                          </Text>
                        </View>
                      ));
                    })()
                  ) : null}

                  {/* Ghi chú đơn hàng (nếu có) */}
                  {t.note ? (
                    <Text style={styles.transNote}>📝 {t.note}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {/* ── DANH SÁCH LƯỢT THU TIỀN ── */}
          {payments.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💵 Thu tiền khách trả nợ</Text>
              {payments.map((p) => (
                <View key={p.id} style={styles.paymentCard}>
                  <View style={styles.transCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.paymentLabel}>Khách đã trả</Text>
                      <TouchableOpacity
                        style={styles.editCardBtn}
                        onPress={() => {
                          setVisible(false);
                          if (onEditPayment) onEditPayment(p);
                        }}
                      >
                        <Text style={styles.editCardText}>✏️ Sửa</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.transCardTotal, { color: COLORS.primaryDark }]}>
                      {formatCurrency(p.amount)}
                    </Text>
                  </View>
                  {p.note ? (
                    <Text style={styles.transNote}>📝 {p.note}</Text>
                  ) : null}
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
});
