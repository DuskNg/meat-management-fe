// meat-management-fe/app/customer/[id].js
import React, { useRef, useMemo } from 'react';
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
import EditDebtModal from '../../src/components/EditDebtModal';
import EditPaymentModal from '../../src/components/EditPaymentModal';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const debtModalRef = useRef(null);
  const paymentModalRef = useRef(null);
  const detailModalRef = useRef(null);
  const editDebtModalRef = useRef(null);
  const editPaymentModalRef = useRef(null);

  // Xử lý quay lại an toàn khi tải lại trang trực tiếp
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // 1. Tải thông tin chi tiết khách hàng
  const {
    data: customerResponse,
    isLoading: isLoadingCustomer,
    refetch: refetchCustomer,
  } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => (await api.get(`/customers/${id}`)).data,
  });

  // 2. Tải lịch sử đơn ghi nợ
  const {
    data: transactionsResponse,
    isLoading: isLoadingTrans,
    refetch: refetchTrans,
  } = useQuery({
    queryKey: ['transactions', id],
    queryFn: async () => (await api.get(`/transactions?customerId=${id}`)).data,
  });

  // 3. Tải lịch sử thu tiền
  const {
    data: paymentsResponse,
    isLoading: isLoadingPayments,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: ['payments', id],
    queryFn: async () => (await api.get(`/payments?customerId=${id}`)).data,
  });

  const customer = customerResponse?.data;
  const transactions = transactionsResponse?.data || [];
  const payments = paymentsResponse?.data || [];

  // 4. Làm mới toàn bộ dữ liệu
  const handleRefreshAll = () => {
    refetchCustomer();
    refetchTrans();
    refetchPayments();
  };

  // ─── Helper: tạo date key "DD/MM/YYYY" từ ISO string ────────────────────
  const toDateKey = (dateStr) => {
    const d = new Date(dateStr);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // 5. Nhóm tất cả giao dịch theo ngày (DD/MM/YYYY)
  //    Mỗi ngày là 1 ô tile duy nhất trên grid
  const dayGroups = useMemo(() => {
    const map = new Map();

    // Xử lý đơn ghi nợ
    transactions.forEach((t) => {
      const key = toDateKey(t.date);
      if (!map.has(key)) {
        map.set(key, {
          dateKey: key,
          date: t.date,         // Dùng để sắp xếp và hiển thị thứ
          transactions: [],
          payments: [],
          totalDebt: 0,
          totalPayment: 0,
        });
      }
      const g = map.get(key);
      g.transactions.push({
        id: t.id,
        type: 'debt',
        date: t.date,
        amount: parseFloat(t.totalAmount),
        note: t.note,
        items: t.items || [],
      });
      g.totalDebt += parseFloat(t.totalAmount);
    });

    // Xử lý lượt thu tiền
    payments.forEach((p) => {
      const key = toDateKey(p.paidAt);
      if (!map.has(key)) {
        map.set(key, {
          dateKey: key,
          date: p.paidAt,
          transactions: [],
          payments: [],
          totalDebt: 0,
          totalPayment: 0,
        });
      }
      const g = map.get(key);
      g.payments.push({
        id: p.id,
        type: 'payment',
        date: p.paidAt,
        amount: parseFloat(p.amount),
        note: p.note,
      });
      g.totalPayment += parseFloat(p.amount);
    });

    // Sắp xếp từ mới nhất → cũ nhất
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
  }, [transactions, payments]);

  // ─── Helper: định dạng tiền VNĐ ─────────────────────────────────────────
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount)
      .replace('₫', 'đ');

  // ─── Helper: tiền rút gọn cho tile (280k / 1.5tr) ───────────────────────
  const formatAmountShort = (amount) => {
    if (amount >= 1_000_000) {
      const v = (amount / 1_000_000).toFixed(1).replace(/\.0$/, '');
      return `${v}tr`;
    }
    return `${Math.round(amount / 1_000)}k`;
  };

  // ─── Helper: ngày/tháng ngắn (10/06) ────────────────────────────────────
  const formatShortDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  // ─── Helper: thứ viết tắt (T2 … CN) ────────────────────────────────────
  const getWeekday = (dateStr) =>
    ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(dateStr).getDay()];

  // ─── Tính kích thước tile ────────────────────────────────────────────────
  const NUM_COLS = 4;
  const TILE_GAP = 8;
  const SIDE_PAD = 16;
  const contentWidth = Math.min(width, 600);
  const tileSize = Math.floor(
    (contentWidth - SIDE_PAD * 2 - TILE_GAP * (NUM_COLS - 1)) / NUM_COLS
  );

  const isLoading = isLoadingCustomer || isLoadingTrans || isLoadingPayments;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.contentWrapper}>
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>⬅ QUAY LẠI</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {customer ? customer.name : 'Đang tải...'}
          </Text>
        </View>

        {/* ── NỘI DUNG CUỘN ──────────────────────────────────────────────── */}
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
          {/* Thẻ tổng nợ */}
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

          {/* Thông tin liên hệ */}
          {(customer?.phone || customer?.address || customer?.note) ? (
            <View style={styles.infoSection}>
              {customer?.phone
                ? <Text style={styles.infoRow}>📞 SĐT: {customer.phone}</Text>
                : null}
              {customer?.address
                ? <Text style={styles.infoRow}>📍 Địa chỉ: {customer.address}</Text>
                : null}
              {customer?.note
                ? <Text style={styles.infoRow}>💡 Ghi chú: {customer.note}</Text>
                : null}
            </View>
          ) : null}

          {/* ── TIÊU ĐỀ LỊCH SỬ ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📚 LỊCH SỬ MUA BÁN</Text>
          </View>

          {/* Chú thích */}
          {dayGroups.length > 0 && (
            <View style={styles.legend}>
              <Text style={styles.legendHint}>• Bấm vào ô để xem chi tiết</Text>
            </View>
          )}

          {/* ── GRID Ô VUÔNG NHÓM THEO NGÀY ── */}
          {isLoading && dayGroups.length === 0 ? (
            <ActivityIndicator
              size="large"
              color={COLORS.primaryDark}
              style={{ marginTop: 40 }}
            />
          ) : dayGroups.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyText}>
                Chưa có lịch sử mua bán hay thu tiền nào.
              </Text>
            </View>
          ) : (
            <View style={[styles.grid, { paddingHorizontal: SIDE_PAD }]}>
              {dayGroups.map((group) => {
                // Xác định màu tile dựa trên loại giao dịch trong ngày
                const hasDebt = group.totalDebt > 0;
                const hasPay = group.totalPayment > 0;
                const isMixed = hasDebt && hasPay;

                let bgColor, bdColor, txtColor;
                if (isMixed) {
                  // Có cả ghi nợ lẫn thu tiền → màu cam
                  bgColor = '#FFF7ED';
                  bdColor = '#FED7AA';
                  txtColor = '#C2410C';
                } else if (hasDebt) {
                  bgColor = '#FFF1F1';
                  bdColor = '#FECACA';
                  txtColor = COLORS.danger;
                } else {
                  bgColor = '#F0FDF4';
                  bdColor = '#86EFAC';
                  txtColor = COLORS.primary;
                }

                // Số tiền hiển thị trên tile
                // Nếu chỉ có nợ: tổng nợ; chỉ thu: tổng thu; cả 2: tổng nợ
                const displayAmount = hasDebt ? group.totalDebt : group.totalPayment;

                return (
                  <TouchableOpacity
                    key={group.dateKey}
                    style={[
                      styles.tile,
                      { width: tileSize, height: tileSize, backgroundColor: bgColor, borderColor: bdColor },
                    ]}
                    onPress={() => detailModalRef.current?.open(group)}
                    activeOpacity={0.7}
                  >
                    {/* Thứ viết tắt */}
                    <Text style={[styles.tileWeekday, { color: txtColor }]}>
                      {getWeekday(group.date)}
                    </Text>
                    {/* Ngày/Tháng */}
                    <Text style={styles.tileDate}>
                      {formatShortDate(group.date)}
                    </Text>
                    {/* Số tiền rút gọn */}
                    <Text style={[styles.tileAmount, { color: txtColor }]}>
                      {isMixed ? `🔴${formatAmountShort(group.totalDebt)}` : formatAmountShort(displayAmount)}
                    </Text>
                    {/* Badge nhỏ khi có thu tiền kèm theo */}
                    {isMixed && (
                      <Text style={styles.tileMixedBadge}>
                        🟢{formatAmountShort(group.totalPayment)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* ── 2 NÚT CỐ ĐỊNH DƯỚI ĐÁY ── */}
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

      <DebtModal ref={debtModalRef} customerId={id} onRefresh={handleRefreshAll} />
      <PaymentModal ref={paymentModalRef} customerId={id} onRefresh={handleRefreshAll} />
      <TransactionDetailModal
        ref={detailModalRef}
        onEditTransaction={(transaction) => editDebtModalRef.current?.open(transaction)}
        onEditPayment={(payment) => editPaymentModalRef.current?.open(payment)}
      />
      <EditDebtModal ref={editDebtModalRef} onRefresh={handleRefreshAll} />
      <EditPaymentModal ref={editPaymentModalRef} onRefresh={handleRefreshAll} />
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
  scrollContent: {
    paddingBottom: 130,
  },
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
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 9,
    height: 9,
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 8,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...SHADOWS.card,
  },
  tileWeekday: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  tileDate: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  tileAmount: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  tileMixedBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.primaryDark,
    marginTop: -2,
  },
  // ── Trạng thái rỗng ───────────────────────────────────────────────────────
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
  // ── Bottom bar ────────────────────────────────────────────────────────────
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
  textDebt: { color: COLORS.danger },
  textPayment: { color: COLORS.primary },
});
