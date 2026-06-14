// meat-management-fe/app/customer/[id].js
import React, { useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import { COLORS, FONTS, SHADOWS } from '../../src/theme';
import DebtModal from '../../src/components/DebtModal';
import PaymentModal from '../../src/components/PaymentModal';
import TransactionDetailModal from '../../src/components/TransactionDetailModal';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const debtModalRef = useRef(null);
  const paymentModalRef = useRef(null);
  const detailModalRef = useRef(null);

  // 1. Tải thông tin chi tiết khách hàng (bao gồm công nợ hiện tại)
  const {
    data: customerResponse,
    isLoading: isLoadingCustomer,
    refetch: refetchCustomer,
  } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const res = await api.get(`/customers/${id}`);
      return res.data;
    },
  });

  // 2. Tải lịch sử các đơn nợ (Transactions) của khách hàng này
  const {
    data: transactionsResponse,
    isLoading: isLoadingTrans,
    refetch: refetchTrans,
  } = useQuery({
    queryKey: ['transactions', id],
    queryFn: async () => {
      const res = await api.get(`/transactions?customerId=${id}`);
      return res.data;
    },
  });

  // 3. Tải lịch sử các lượt trả tiền (Payments) của khách hàng này
  const {
    data: paymentsResponse,
    isLoading: isLoadingPayments,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: ['payments', id],
    queryFn: async () => {
      const res = await api.get(`/payments?customerId=${id}`);
      return res.data;
    },
  });

  const customer = customerResponse?.data;
  const transactions = transactionsResponse?.data || [];
  const payments = paymentsResponse?.data || [];

  // 4. Làm mới toàn bộ dữ liệu cùng lúc
  const handleRefreshAll = () => {
    refetchCustomer();
    refetchTrans();
    refetchPayments();
  };

  // 5. Trộn và sắp xếp lịch sử nợ + thu tiền theo thứ tự thời gian mới nhất lên đầu
  const formattedTransactions = transactions.map((t) => ({
    id: t.id,
    type: 'debt',
    date: t.date,
    amount: parseFloat(t.totalAmount),
    note: t.note,
    items: t.items || [],
  }));

  const formattedPayments = payments.map((p) => ({
    id: p.id,
    type: 'payment',
    date: p.paidAt,
    amount: parseFloat(p.amount),
    note: p.note,
  }));

  const history = [...formattedTransactions, ...formattedPayments].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  // ─── Các hàm định dạng hiển thị ─────────────────────────────────────────

  // Định dạng tiền VNĐ đầy đủ (Ví dụ: 670.000 đ)
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount)
      .replace('₫', 'đ');

  // Định dạng tiền rút gọn để hiện trong tile (Ví dụ: 280k / 1.5tr)
  const formatAmountShort = (amount) => {
    if (amount >= 1_000_000) {
      const v = (amount / 1_000_000).toFixed(1).replace(/\.0$/, '');
      return `${v}tr`;
    }
    return `${Math.round(amount / 1_000)}k`;
  };

  // Định dạng ngày/tháng ngắn để hiện trong tile (Ví dụ: 10/06)
  const formatShortDate = (dateStr) => {
    const d = new Date(dateStr);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${dd}/${mm}`;
  };

  // Lấy thứ viết tắt tiếng Việt (T2 ~ CN)
  const getWeekday = (dateStr) => {
    const d = new Date(dateStr);
    return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
  };

  // ─── Tính kích thước tile ────────────────────────────────────────────────
  // Lưu ý: contentWrapper maxWidth=600, padding ngang 16px mỗi bên → tổng 32px
  const NUM_COLS = 4;
  const TILE_GAP = 8;
  const SIDE_PAD = 16; // padding ngang của grid wrapper
  const contentWidth = Math.min(width, 600);
  const tileSize = Math.floor(
    (contentWidth - SIDE_PAD * 2 - TILE_GAP * (NUM_COLS - 1)) / NUM_COLS
  );

  const isLoading = isLoadingCustomer || isLoadingTrans || isLoadingPayments;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.contentWrapper}>
        {/* ── HEADER: Nút quay lại + Tên khách hàng ─────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>⬅ QUAY LẠI</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {customer ? customer.name : 'Đang tải...'}
          </Text>
        </View>

        {/* ── NỘI DUNG CUỘN ───────────────────────────────────────────────── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={handleRefreshAll}
              colors={[COLORS.primaryDark]}
              tintColor={COLORS.primaryDark}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Khung tổng nợ nổi bật */}
          <View style={[
            styles.debtSummaryCard,
            customer?.debt > 0 ? styles.cardHasDebt : styles.cardNoDebt,
          ]}>
            <Text style={styles.debtLabel}>SỐ TIỀN CÒN NỢ HIỆN TẠI:</Text>
            <Text style={[
              styles.debtValue,
              customer?.debt > 0 ? styles.textDebt : styles.textPayment,
            ]}>
              {formatCurrency(customer?.debt || 0)}
            </Text>
          </View>

          {/* Thông tin liên hệ khách hàng */}
          {(customer?.phone || customer?.address || customer?.note) ? (
            <View style={styles.infoSection}>
              {customer?.phone
                ? <Text style={styles.infoRow}>📞 SĐT: {customer.phone}</Text>
                : null}
              {customer?.address
                ? <Text style={styles.infoRow}>📍 Địa chỉ sạp: {customer.address}</Text>
                : null}
              {customer?.note
                ? <Text style={styles.infoRow}>💡 Ghi chú: {customer.note}</Text>
                : null}
            </View>
          ) : null}

          {/* ── LỊCH SỬ GIAO DỊCH (GRID Ô VUÔNG) ──────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📚 LỊCH SỬ MUA BÁN & THANH TOÁN</Text>
            {history.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{history.length}</Text>
              </View>
            )}
          </View>

          {/* Chú thích loại giao dịch */}
          {history.length > 0 && (
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS.danger }]} />
                <Text style={styles.legendText}>Ghi nợ</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
                <Text style={styles.legendText}>Thu tiền</Text>
              </View>
              <Text style={styles.legendHint}>• Bấm vào ô để xem chi tiết</Text>
            </View>
          )}

          {isLoading && !history.length ? (
            <ActivityIndicator
              size="large"
              color={COLORS.primaryDark}
              style={{ marginTop: 40 }}
            />
          ) : history.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyText}>
                Chưa có lịch sử mua bán hay thu tiền nào.
              </Text>
            </View>
          ) : (
            /* ── GRID ô vuông tự xuống dòng ── */
            <View style={[styles.grid, { paddingHorizontal: SIDE_PAD }]}>
              {history.map((item) => {
                const isDebt = item.type === 'debt';
                const bgColor  = isDebt ? '#FFF1F1' : '#F0FDF4';
                const bdColor  = isDebt ? '#FECACA' : '#86EFAC';
                const txtColor = isDebt ? COLORS.danger : COLORS.primary;

                return (
                  <TouchableOpacity
                    key={`${item.id}-${item.type}`}
                    style={[
                      styles.tile,
                      {
                        width: tileSize,
                        height: tileSize,
                        backgroundColor: bgColor,
                        borderColor: bdColor,
                      },
                    ]}
                    onPress={() => detailModalRef.current?.open(item)}
                    activeOpacity={0.7}
                  >
                    {/* Icon loại giao dịch */}
                    <Text style={styles.tileIcon}>
                      {isDebt ? '🔴' : '🟢'}
                    </Text>
                    {/* Thứ viết tắt */}
                    <Text style={[styles.tileWeekday, { color: txtColor }]}>
                      {getWeekday(item.date)}
                    </Text>
                    {/* Ngày/Tháng */}
                    <Text style={styles.tileDate}>
                      {formatShortDate(item.date)}
                    </Text>
                    {/* Số tiền rút gọn */}
                    <Text style={[styles.tileAmount, { color: txtColor }]}>
                      {formatAmountShort(item.amount)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* ── 2 NÚT GHI NỢ / THU TIỀN CỐ ĐỊNH ĐÁY MÀN HÌNH ──────────── */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.actionButton, styles.btnDebt]}
            onPress={() => debtModalRef.current?.open()}
          >
            <Text style={styles.actionButtonText}>🔴 GHI NỢ MỚI</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.btnPayment]}
            onPress={() => paymentModalRef.current?.open()}
          >
            <Text style={styles.actionButtonText}>🟢 THU TIỀN NỢ</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* MODAL GHI NỢ THỊT MỚI */}
      <DebtModal ref={debtModalRef} customerId={id} onRefresh={handleRefreshAll} />

      {/* MODAL THU TIỀN TRẢ NỢ */}
      <PaymentModal ref={paymentModalRef} customerId={id} onRefresh={handleRefreshAll} />

      {/* MODAL CHI TIẾT GIAO DỊCH */}
      <TransactionDetailModal ref={detailModalRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: COLORS.background,
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: COLORS.border,
  },
  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: COLORS.inputBg,
    marginRight: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backButtonText: {
    fontSize: FONTS.body,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  headerTitle: {
    flex: 1,
    fontSize: FONTS.title,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
  },
  // ── Scroll ──────────────────────────────────────────────────────────────
  scrollContent: {
    paddingBottom: 130, // Khoảng trống tránh đè lên 2 nút đáy
  },
  // ── Thẻ tổng nợ ─────────────────────────────────────────────────────────
  debtSummaryCard: {
    margin: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    ...SHADOWS.card,
  },
  cardHasDebt: {
    backgroundColor: COLORS.dangerLight,
    borderColor: '#FECACA',
  },
  cardNoDebt: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#A7F3D0',
  },
  debtLabel: {
    fontSize: FONTS.body,
    fontWeight: FONTS.weightBold,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  debtValue: {
    fontSize: 34,
    fontWeight: 'bold',
  },
  // ── Thông tin khách ──────────────────────────────────────────────────────
  infoSection: {
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoRow: {
    fontSize: FONTS.body,
    color: COLORS.text,
    marginBottom: 6,
    lineHeight: 22,
  },
  // ── Tiêu đề section lịch sử ──────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
    gap: 10,
  },
  sectionTitle: {
    flex: 1,
    fontSize: FONTS.subtitle,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
  },
  countBadge: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  countText: {
    fontSize: FONTS.caption,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  // ── Chú thích màu sắc ────────────────────────────────────────────────────
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: FONTS.caption,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  legendHint: {
    fontSize: FONTS.caption,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
  // ── Grid ô vuông ─────────────────────────────────────────────────────────
  grid: {
    flexDirection: 'row',   // Xếp ngang
    flexWrap: 'wrap',       // Tự xuống dòng khi hết chiều rộng
    gap: 8,                 // Khoảng cách đều nhau giữa các ô
  },
  // ── Ô tile hình vuông ────────────────────────────────────────────────────
  tile: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 8,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...SHADOWS.card,
  },
  tileIcon: {
    fontSize: 13,
  },
  tileWeekday: {
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 2,
  },
  tileDate: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  tileAmount: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  // ── Trạng thái rỗng ──────────────────────────────────────────────────────
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: FONTS.body,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
  // ── Bottom action bar ────────────────────────────────────────────────────
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(248, 250, 252, 0.97)',
    padding: 16,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  actionButton: {
    flex: 1,
    height: 60,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  btnDebt: {
    backgroundColor: COLORS.danger,
    marginRight: 12,
  },
  btnPayment: {
    backgroundColor: COLORS.primary,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // ── Màu chữ chung ────────────────────────────────────────────────────────
  textDebt: {
    color: COLORS.danger,
  },
  textPayment: {
    color: COLORS.primary,
  },
});
