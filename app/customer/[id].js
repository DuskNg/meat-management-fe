// meat-management-fe/app/customer/[id].js
import React, { useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
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
    refetch: refetchCustomer
  } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const response = await api.get(`/customers/${id}`);
      return response.data;
    },
  });

  // 2. Tải lịch sử các đơn nợ (Transactions) của khách hàng này
  const {
    data: transactionsResponse,
    isLoading: isLoadingTrans,
    refetch: refetchTrans
  } = useQuery({
    queryKey: ['transactions', id],
    queryFn: async () => {
      const response = await api.get(`/transactions?customerId=${id}`);
      return response.data;
    },
  });

  // 3. Tải lịch sử các lượt trả tiền (Payments) của khách hàng này
  const {
    data: paymentsResponse,
    isLoading: isLoadingPayments,
    refetch: refetchPayments
  } = useQuery({
    queryKey: ['payments', id],
    queryFn: async () => {
      const response = await api.get(`/payments?customerId=${id}`);
      return response.data;
    },
  });

  const customer = customerResponse?.data;
  const transactions = transactionsResponse?.data || [];
  const payments = paymentsResponse?.data || [];

  // 4. Đồng bộ làm mới toàn bộ dữ liệu khi kéo thả hoặc khi thao tác xong
  const handleRefreshAll = () => {
    refetchCustomer();
    refetchTrans();
    refetchPayments();
  };

  // 5. Trộn (merge) hóa đơn nợ và phiếu thu tiền trả nợ thành 1 danh sách thời gian duy nhất
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

  // Định dạng hiển thị tiền VNĐ (Ví dụ: 280.000 đ)
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  // Định dạng số tiền ngắn gọn để hiển thị trong ô tile (Ví dụ: 280k, 1.5tr)
  const formatAmountShort = (amount) => {
    if (amount >= 1_000_000) {
      const val = (amount / 1_000_000).toFixed(1).replace(/\.0$/, '');
      return `${val}tr`;
    }
    if (amount >= 1_000) {
      return `${Math.round(amount / 1_000)}k`;
    }
    return `${Math.round(amount)}`;
  };

  // Định dạng ngày ngắn để hiển thị trong tile (Ví dụ: 10/06)
  const formatShortDate = (dateStr) => {
    const d = new Date(dateStr);
    const date = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${date}/${month}`;
  };

  // Lấy tên thứ ngắn gọn (T2, T3 ... CN)
  const formatWeekday = (dateStr) => {
    const d = new Date(dateStr);
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return days[d.getDay()];
  };

  // ─── Tính kích thước ô tile theo số cột cố định ──────────────────────────
  // Tổng chiều rộng content = width màn hình - 2*paddingNgoài - gap giữa các cột
  const NUM_COLS = 4;     // Số cột ô vuông
  const OUTER_PAD = 20;  // Padding 2 bên ngoài grid
  const TILE_GAP = 8;    // Khoảng cách giữa các tile
  const containerWidth = Math.min(width, 600); // Giới hạn maxWidth=600 như contentWrapper
  const tileSize =
    (containerWidth - OUTER_PAD * 2 - TILE_GAP * (NUM_COLS - 1)) / NUM_COLS;

  // ─── Render từng ô tile trong grid ───────────────────────────────────────
  const renderTile = ({ item }) => {
    const isDebt = item.type === 'debt';
    const bgColor = isDebt ? '#FFF1F1' : '#F0FDF4';
    const borderColor = isDebt ? '#FECACA' : '#BBF7D0';
    const accentColor = isDebt ? COLORS.danger : COLORS.primary;
    const typeIcon = isDebt ? '🔴' : '🟢';

    return (
      <TouchableOpacity
        style={[
          styles.tile,
          {
            width: tileSize,
            height: tileSize,
            backgroundColor: bgColor,
            borderColor,
          },
        ]}
        onPress={() => detailModalRef.current?.open(item)}
        activeOpacity={0.75}
      >
        {/* Icon loại giao dịch ở góc trên trái */}
        <Text style={styles.tileIcon}>{typeIcon}</Text>

        {/* Thứ ngắn (T2, CN...) */}
        <Text style={[styles.tileWeekday, { color: accentColor }]}>
          {formatWeekday(item.date)}
        </Text>

        {/* Ngày/Tháng */}
        <Text style={styles.tileDate}>{formatShortDate(item.date)}</Text>

        {/* Số tiền ngắn gọn */}
        <Text style={[styles.tileAmount, { color: accentColor }]}>
          {formatAmountShort(item.amount)}
        </Text>
      </TouchableOpacity>
    );
  };

  const isLoading = isLoadingCustomer || isLoadingTrans || isLoadingPayments;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.contentWrapper}>
        {/* HEADER: Nút quay lại & Tên khách hàng */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>⬅ QUAY LẠI</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {customer ? customer.name : 'Đang tải...'}
          </Text>
        </View>

        {isLoading && !customer ? (
          <ActivityIndicator size="large" color={COLORS.primaryDark} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={history}
            renderItem={renderTile}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            numColumns={NUM_COLS}             // Grid nhiều cột tự xuống dòng
            columnWrapperStyle={styles.tileRow} // Khoảng cách dọc giữa các hàng
            contentContainerStyle={styles.listContent}
            refreshing={isLoading}
            onRefresh={handleRefreshAll}
            ListHeaderComponent={
              <View>
                {/* KHUNG TỔNG NỢ CỦA KHÁCH: Thiết kế cực kỳ to, dễ nhìn */}
                <View style={[styles.debtSummaryCard, customer?.debt > 0 ? styles.cardHasDebt : styles.cardNoDebt]}>
                  <Text style={styles.debtLabel}>SỐ TIỀN CÒN NỢ HIỆN TẠI:</Text>
                  <Text style={[styles.debtValue, customer?.debt > 0 ? styles.textDebt : styles.textPayment]}>
                    {formatCurrency(customer?.debt || 0)}
                  </Text>
                </View>

                {/* Thông tin khách hàng (Liên hệ, địa chỉ, thói quen) */}
                <View style={styles.infoSection}>
                  {customer?.phone ? <Text style={styles.infoRow}>📞 SĐT: {customer.phone}</Text> : null}
                  {customer?.address ? <Text style={styles.infoRow}>📍 Địa chỉ sạp: {customer.address}</Text> : null}
                  {customer?.note ? <Text style={styles.infoRow}>💡 Ghi chú khách quen: {customer.note}</Text> : null}
                </View>

                {/* Tiêu đề phần grid lịch sử */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>📚 LỊCH SỬ MUA BÁN & THANH TOÁN</Text>
                  {history.length > 0 ? (
                    <Text style={styles.sectionCount}>{history.length} giao dịch</Text>
                  ) : null}
                </View>

                {/* Chú thích màu sắc ô tile */}
                {history.length > 0 ? (
                  <View style={styles.legend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: COLORS.danger }]} />
                      <Text style={styles.legendText}>Ghi nợ</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
                      <Text style={styles.legendText}>Thu tiền</Text>
                    </View>
                    <Text style={styles.legendHint}>Bấm vào ô để xem chi tiết</Text>
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>📋</Text>
                <Text style={styles.emptyText}>Chưa có lịch sử mua bán hay thu tiền nào cho khách hàng này.</Text>
              </View>
            }
          />
        )}

        {/* 2 NÚT HÀNH ĐỘNG KHỔNG LỒ Ở DƯỚI ĐÁY (Một Đỏ ghi nợ - Một Xanh thu tiền) */}
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
      <DebtModal
        ref={debtModalRef}
        customerId={id}
        onRefresh={handleRefreshAll}
      />

      {/* MODAL THU TIỀN TRẢ NỢ */}
      <PaymentModal
        ref={paymentModalRef}
        customerId={id}
        onRefresh={handleRefreshAll}
      />

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
    position: 'relative',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 15,
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
  debtSummaryCard: {
    margin: 20,
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
    borderColor: COLORS.primaryLight,
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
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoRow: {
    fontSize: FONTS.body,
    color: COLORS.text,
    marginBottom: 8,
    lineHeight: 22,
  },
  // Tiêu đề section lịch sử
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 25,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: FONTS.subtitle,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    flex: 1,
  },
  sectionCount: {
    fontSize: FONTS.caption,
    fontWeight: '600',
    color: COLORS.textSecondary,
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  // Chú thích màu sắc
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 14,
    gap: 12,
    flexWrap: 'wrap',
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
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  legendHint: {
    fontSize: FONTS.caption,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
  // Grid tile layout
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 130, // Tránh đè lên 2 nút khổng lồ ở đáy
  },
  tileRow: {
    gap: 8,           // Khoảng cách ngang giữa các tile
    marginBottom: 8,  // Khoảng cách dọc giữa các hàng
  },
  // Ô tile hình vuông
  tile: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 8,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...SHADOWS.card,
  },
  tileIcon: {
    fontSize: 14,
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
    lineHeight: 18,
  },
  tileAmount: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 2,
  },
  // Trạng thái rỗng
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
  // Bottom action bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: 'rgba(248, 250, 252, 0.95)',
    padding: 20,
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
  // Màu chữ
  textDebt: {
    color: COLORS.danger,
  },
  textPayment: {
    color: COLORS.primary,
  },
});
