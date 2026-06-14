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
 * Modal hiển thị chi tiết một giao dịch (ghi nợ hoặc thu tiền).
 * Được mở từ bên ngoài qua ref.open(item).
 *
 * Props: không có (dữ liệu được truyền qua ref.open)
 * Ref methods:
 *   - open(item)  : mở modal với dữ liệu giao dịch
 *   - close()     : đóng modal
 */
const TransactionDetailModal = forwardRef((_, ref) => {
  const [visible, setVisible] = useState(false);
  const [item, setItem] = useState(null);

  // Phơi bày open/close ra ngoài component cha
  useImperativeHandle(ref, () => ({
    open: (selectedItem) => {
      setItem(selectedItem);
      setVisible(true);
    },
    close: () => setVisible(false),
  }));

  // Định dạng tiền VNĐ
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount)
      .replace('₫', 'đ');

  // Định dạng ngày giờ đầy đủ tiếng Việt
  const formatFullDate = (dateStr) => {
    const d = new Date(dateStr);
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const weekday = days[d.getDay()];
    const date = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const hour = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${weekday}, ${date}/${month}/${year} lúc ${hour}:${min}`;
  };

  if (!item) return null;

  const isDebt = item.type === 'debt';
  const accentColor = isDebt ? COLORS.danger : COLORS.primary;
  const accentLight = isDebt ? COLORS.dangerLight : COLORS.primaryLight;
  const sign = isDebt ? '+' : '-';
  const typeLabel = isDebt ? '🔴 GHI NỢ THỊT' : '🟢 KHÁCH TRẢ TIỀN';

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
        {/* Lớp nền bấm ngoài để đóng modal */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        />

        <View style={styles.modalView}>
          {/* Thanh kéo nhỏ trên cùng (drag indicator) */}
          <View style={styles.dragBar} />

          {/* Tiêu đề loại giao dịch */}
          <Text style={[styles.typeLabel, { color: accentColor }]}>{typeLabel}</Text>

          {/* Số tiền nổi bật */}
          <View style={[styles.amountBadge, { backgroundColor: accentLight }]}>
            <Text style={[styles.amountText, { color: accentColor }]}>
              {sign} {formatCurrency(item.amount)}
            </Text>
          </View>

          {/* Ngày giờ */}
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>🗓️</Text>
            <Text style={styles.infoValue}>{formatFullDate(item.date)}</Text>
          </View>

          <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
            {/* Danh sách mặt hàng (chỉ có ở giao dịch ghi nợ) */}
            {isDebt && item.items && item.items.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🥩 Mặt hàng đã mua</Text>
                {item.items.map((it, idx) => (
                  <View key={idx} style={styles.itemCard}>
                    {/* Tên sản phẩm */}
                    <View style={styles.itemCardHeader}>
                      <Text style={styles.itemName}>{it.product?.name}</Text>
                      <Text style={styles.itemSubtotal}>
                        {formatCurrency(parseFloat(it.quantity) * parseFloat(it.price))}
                      </Text>
                    </View>
                    {/* Khối lượng × Đơn giá */}
                    <Text style={styles.itemMeta}>
                      {parseFloat(it.quantity)} {it.product?.unit}
                      {'  ×  '}
                      {formatCurrency(parseFloat(it.price))}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Ghi chú */}
            {item.note ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📝 Ghi chú</Text>
                <View style={styles.noteBox}>
                  <Text style={styles.noteText}>{item.note}</Text>
                </View>
              </View>
            ) : null}

            {/* Thông báo không có ghi chú */}
            {!item.note && (!isDebt || !item.items || item.items.length === 0) ? (
              <Text style={styles.emptyNote}>Không có thông tin chi tiết thêm.</Text>
            ) : null}
          </ScrollView>

          {/* Nút đóng */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setVisible(false)}
          >
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
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
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
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 16,
    maxHeight: '80%',
    ...SHADOWS.card,
  },
  // Thanh kéo nhỏ trên đầu
  dragBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  typeLabel: {
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 14,
  },
  // Badge số tiền nổi bật
  amountBadge: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 18,
  },
  amountText: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  // Hàng thông tin ngày giờ
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 8,
  },
  infoIcon: {
    fontSize: 18,
  },
  infoValue: {
    fontSize: FONTS.body,
    fontWeight: '600',
    color: COLORS.textSecondary,
    flex: 1,
  },
  detailScroll: {
    maxHeight: 280,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
  },
  // Card từng mặt hàng thịt
  itemCard: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemName: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
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
  // Ô ghi chú
  noteBox: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noteText: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  emptyNote: {
    fontSize: FONTS.body,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingVertical: 20,
  },
  // Nút đóng
  closeButton: {
    marginTop: 16,
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
});
