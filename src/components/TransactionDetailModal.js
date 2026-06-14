// meat-management-fe/src/components/TransactionDetailModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
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
const TransactionDetailModal = forwardRef(({ onEditTransaction, onEditPayment }, ref) => {
  const [visible, setVisible] = useState(false);
  const [dayGroup, setDayGroup] = useState(null);

  // Phơi bày open/close ra component cha
  useImperativeHandle(ref, () => ({
    open: (group) => {
      setDayGroup(group);
      setVisible(true);
    },
    close: () => setVisible(false),
  }));

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
  const net = totalDebt - totalPayment;
  const hasDebt = totalDebt > 0;
  const hasPayment = totalPayment > 0;

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={() => setVisible(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.centeredView}
      >
        {/* Lớp nền bấm ngoài để đóng */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        />

        <View style={styles.modalView}>
          {/* Thanh kéo (drag indicator) */}
          <View style={styles.dragBar} />

          {/* ── NGÀY TIÊU ĐỀ ── */}
          <View style={styles.dateHeader}>
            <Text style={styles.weekdayText}>{getFullWeekday(dayGroup.date)}</Text>
            <Text style={styles.dateText}>Ngày {dateKey}</Text>
          </View>

          {/* ── TỔNG KẾT NGÀY (debt + payment badges) ── */}
          <View style={styles.summaryRow}>
            {hasDebt && (
              <View style={[styles.summaryBadge, styles.debtBadge]}>
                <Text style={styles.summaryBadgeLabel}>🔴 Ghi nợ</Text>
                <Text style={styles.summaryBadgeAmount}>+{formatCurrency(totalDebt)}</Text>
              </View>
            )}
            {hasPayment && (
              <View style={[styles.summaryBadge, styles.paymentBadge]}>
                <Text style={styles.summaryBadgeLabel}>🟢 Thu tiền</Text>
                <Text style={[styles.summaryBadgeAmount, { color: COLORS.primaryDark }]}>
                  -{formatCurrency(totalPayment)}
                </Text>
              </View>
            )}
          </View>

          {/* ── NET của ngày (nếu có cả nợ lẫn thu) ── */}
          {hasDebt && hasPayment && (
            <View style={[styles.netRow, net > 0 ? styles.netRowDebt : styles.netRowOk]}>
              <Text style={styles.netLabel}>Còn lại trong ngày:</Text>
              <Text style={[styles.netAmount, { color: net > 0 ? COLORS.danger : COLORS.primary }]}>
                {formatCurrency(Math.abs(net))}
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
                      t.items.map((it, iIdx) => (
                        <View key={iIdx} style={styles.itemRow}>
                          {/* Tên sản phẩm + thành tiền */}
                          <View style={styles.itemRowHeader}>
                            <Text style={styles.itemName}>{it.product?.name}</Text>
                            <Text style={styles.itemSubtotal}>
                              {formatCurrency(parseFloat(it.quantity) * parseFloat(it.price))}
                            </Text>
                          </View>
                          {/* Khối lượng × đơn giá */}
                          <Text style={styles.itemMeta}>
                            {parseFloat(it.quantity)} {it.product?.unit}
                            {'  ×  '}
                            {formatCurrency(parseFloat(it.price))}
                          </Text>
                        </View>
                      ))
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

          {/* ── NÚT ĐÓNG ── */}
          <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeButtonText}>ĐÓNG</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    ...SHADOWS.card,
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

  // ── Nút đóng ─────────────────────────────────────────────────────────────
  closeButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
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
