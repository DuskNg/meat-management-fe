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
  StatusBar 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import { COLORS, FONTS, SHADOWS } from '../../src/theme';
import DebtModal from '../../src/components/DebtModal';
import PaymentModal from '../../src/components/PaymentModal';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  
  const debtModalRef = useRef(null);
  const paymentModalRef = useRef(null);

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

  // Định dạng hiển thị tiền VNĐ (Ví dụ: 1.500.000 đ)
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND' 
    }).format(amount).replace('₫', 'đ');
  };

  // Định dạng ngày tháng giờ Việt Nam dễ đọc
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} - Ngày ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  const renderHistoryItem = ({ item }) => {
    const isDebt = item.type === 'debt';
    return (
      <View style={[styles.historyCard, isDebt ? styles.historyCardDebt : styles.historyCardPayment]}>
        <View style={styles.historyCardHeader}>
          <Text style={[styles.historyType, isDebt ? styles.textDebt : styles.textPayment]}>
            {isDebt ? '🔴 GHI NỢ THỊT' : '🟢 KHÁCH TRẢ TIỀN'}
          </Text>
          <Text style={[styles.historyAmount, isDebt ? styles.textDebt : styles.textPayment]}>
            {isDebt ? '+' : '-'} {formatCurrency(item.amount)}
          </Text>
        </View>

        <Text style={styles.historyDate}>{formatDate(item.date)}</Text>

        {isDebt && item.items && item.items.length > 0 ? (
          <View style={styles.itemList}>
            {item.items.map((it, idx) => (
              <Text key={idx} style={styles.itemRow}>
                • {it.product?.name}: {parseFloat(it.quantity)} {it.product?.unit} x {formatCurrency(parseFloat(it.price))}
              </Text>
            ))}
          </View>
        ) : null}

        {item.note ? (
          <Text style={styles.historyNote}>📝 Ghi chú: {item.note}</Text>
        ) : null}
      </View>
    );
  };

  const isLoading = isLoadingCustomer || isLoadingTrans || isLoadingPayments;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* HEADER: Nút quay lại & Tên khách hàng */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>⬅ SỔ NỢ CHÍNH</Text>
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
          renderItem={renderHistoryItem}
          keyExtractor={(item, index) => `${item.id}-${index}`}
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

              <Text style={styles.sectionTitle}>📚 LỊCH SỬ MUA BÁN & THANH TOÁN</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
  sectionTitle: {
    fontSize: FONTS.subtitle,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginHorizontal: 20,
    marginTop: 25,
    marginBottom: 15,
  },
  listContent: {
    paddingBottom: 120, // Tránh đè lên 2 nút khổng lồ ở đáy
  },
  historyCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    ...SHADOWS.card,
  },
  historyCardDebt: {
    borderColor: '#FECACA',
    borderLeftWidth: 5,
    borderLeftColor: COLORS.danger,
  },
  historyCardPayment: {
    borderColor: COLORS.border,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.primary,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyType: {
    fontSize: FONTS.body,
    fontWeight: FONTS.weightBold,
  },
  historyAmount: {
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
  },
  historyDate: {
    fontSize: FONTS.caption,
    color: COLORS.textLight,
    marginBottom: 10,
  },
  itemList: {
    backgroundColor: COLORS.inputBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  itemRow: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  historyNote: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  textDebt: {
    color: COLORS.danger,
  },
  textPayment: {
    color: COLORS.primary,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONTS.body,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
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
});
