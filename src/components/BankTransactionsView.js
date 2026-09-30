// meat-management-fe/src/components/BankTransactionsView.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { api } from '../api/client';
import { COLORS } from '../theme';
import { showGlobalToast } from '../store/toastStore';
import { getSocket } from '../utils/socket';
import AssignBankTransactionModal from './AssignBankTransactionModal';
import PopupModal from './PopupModal';

const TouchableOpacity = AnimatedPressable;

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0));

// Định dạng ngày giờ hiển thị
const formatDateTime = (isoDate) => {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes} ${day}/${month}/${year}`;
};

export default function BankTransactionsView({ onBack, auth }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, UNPROCESSED, PROCESSED, IGNORED
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState({ totalIn: 0, totalOut: 0, unprocessedCount: 0 });

  const assignModalRef = useRef(null);
  const popupRef = useRef(null);

  // Lấy URL Webhook SePay để hiển thị cho người dùng sao chép
  const webhookUrl = useMemo(() => {
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.protocol}//${window.location.host}/api/v1/bank-transactions/webhook`;
    }
    return 'https://domain-cua-ban.com/api/v1/bank-transactions/webhook';
  }, []);

  // Tải danh sách giao dịch từ Backend
  const fetchTransactions = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const params = {};
      if (filterStatus !== 'ALL') {
        params.status = filterStatus;
      }
      if (search.trim()) {
        params.search = search.trim();
      }

      const res = await api.get('/bank-transactions', { params });
      if (res.data?.success) {
        setTransactions(res.data?.data || []);
        if (res.data?.summary) {
          setSummary(res.data.summary);
        }
      }
    } catch (err) {
      console.error('Lỗi tải giao dịch ngân hàng:', err);
      showGlobalToast(err.response?.data?.message || 'Không thể tải danh sách giao dịch.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Gọi API khi thay đổi bộ lọc hoặc tìm kiếm
  useEffect(() => {
    fetchTransactions();
  }, [filterStatus]);

  // Lắng nghe Socket sự kiện có biến động số dư SePay tức thì
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleBankTxReceived = (payload) => {
      const tx = payload?.transaction;
      if (tx) {
        showGlobalToast(
          `🔔 Biến động số dư mới: +${formatCurrency(tx.transferAmount)} đ (${tx.gateway || 'NH'})`,
          'info'
        );
      }
      fetchTransactions(true);
    };

    const handleBankTxUpdated = () => {
      fetchTransactions(true);
    };

    socket.on('BANK_TRANSACTION_RECEIVED', handleBankTxReceived);
    socket.on('BANK_TRANSACTION_UPDATED', handleBankTxUpdated);

    return () => {
      socket.off('BANK_TRANSACTION_RECEIVED', handleBankTxReceived);
      socket.off('BANK_TRANSACTION_UPDATED', handleBankTxUpdated);
    };
  }, []);

  // Sao chép Webhook URL
  const handleCopyWebhookUrl = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(webhookUrl);
      showGlobalToast('Đã sao chép link Webhook SePay!', 'success');
    } else {
      showGlobalToast(`URL Webhook: ${webhookUrl}`, 'info');
    }
  };

  // Xử lý bỏ qua giao dịch
  const handleIgnore = (item) => {
    popupRef.current?.show({
      type: 'confirm',
      title: 'BỎ QUA GIAO DỊCH',
      message: `Bạn có chắc chắn muốn bỏ qua giao dịch +${formatCurrency(item.transferAmount)} đ này không? Giao dịch sẽ không được dùng để gán trừ nợ.`,
      onConfirm: async () => {
        try {
          const res = await api.put(`/bank-transactions/${item.id}/ignore`);
          if (res.data?.success) {
            showGlobalToast('Đã chuyển giao dịch sang trạng thái bỏ qua', 'success');
            fetchTransactions(true);
          }
        } catch (err) {
          showGlobalToast(err.response?.data?.message || 'Không thể bỏ qua giao dịch', 'error');
        }
      },
    });
  };

  // Xử lý khôi phục giao dịch về Chờ xử lý
  const handleRestore = (item) => {
    const isProcessed = item.status === 'PROCESSED';
    const message = isProcessed
      ? `Giao dịch này đã được gán trừ nợ cho khách hàng. Nếu khôi phục về "Chờ xử lý", phiếu thu nợ tương ứng sẽ được tự động xóa hoàn nợ. Bạn có muốn tiếp tục?`
      : `Khôi phục giao dịch này về trạng thái "Chờ xử lý"?`;

    popupRef.current?.show({
      type: 'confirm',
      title: 'KHÔI PHỤC GIAO DỊCH',
      message,
      onConfirm: async () => {
        try {
          const res = await api.put(`/bank-transactions/${item.id}/restore`);
          if (res.data?.success) {
            showGlobalToast('Đã khôi phục giao dịch về Chờ xử lý', 'success');
            fetchTransactions(true);
          }
        } catch (err) {
          showGlobalToast(err.response?.data?.message || 'Không thể khôi phục giao dịch', 'error');
        }
      },
    });
  };

  // Render từng thẻ giao dịch ngân hàng
  const renderItem = ({ item }) => {
    const isIncome = item.transferType === 'in';
    const isUnprocessed = item.status === 'UNPROCESSED';
    const isProcessed = item.status === 'PROCESSED';
    const isIgnored = item.status === 'IGNORED';

    return (
      <View style={styles.card}>
        {/* Dòng 1: Ngân hàng + Số tài khoản + Ngày giờ */}
        <View style={styles.cardHeader}>
          <View style={styles.gatewayBadge}>
            <Text style={styles.gatewayText}>🏦 {item.gateway || 'Ngân hàng'}</Text>
            {item.accountNumber ? (
              <Text style={styles.accountNumberText}>({item.accountNumber})</Text>
            ) : null}
          </View>
          <Text style={styles.dateText}>{formatDateTime(item.transactionDate)}</Text>
        </View>

        {/* Dòng 2: Số tiền & Trạng thái */}
        <View style={styles.amountRow}>
          <Text style={[styles.amountText, isIncome ? styles.amountIncome : styles.amountExpense]}>
            {isIncome ? '+' : '-'}{formatCurrency(item.transferAmount)} đ
          </Text>

          {isUnprocessed && (
            <View style={[styles.statusBadge, styles.statusUnprocessed]}>
              <Text style={styles.statusUnprocessedText}>⏳ Chờ xử lý</Text>
            </View>
          )}
          {isProcessed && (
            <View style={[styles.statusBadge, styles.statusProcessed]}>
              <Text style={styles.statusProcessedText}>✓ Đã xử lý</Text>
            </View>
          )}
          {isIgnored && (
            <View style={[styles.statusBadge, styles.statusIgnored]}>
              <Text style={styles.statusIgnoredText}>✕ Bỏ qua</Text>
            </View>
          )}
        </View>

        {/* Dòng 3: Nội dung chuyển khoản */}
        <View style={styles.contentBox}>
          <Text style={styles.contentLabel}>Nội dung:</Text>
          <Text style={styles.contentText} numberOfLines={3}>
            {item.content || item.description || '(Không có nội dung)'}
          </Text>
        </View>

        {/* Dòng 4: Nếu đã gán cho khách hàng */}
        {isProcessed && item.customer && (
          <View style={styles.assignedBox}>
            <Text style={styles.assignedLabel}>Đã gán cho khách:</Text>
            <Text style={styles.assignedCustomerName}>
              👤 {item.customer.name} {item.customer.phone ? `(${item.customer.phone})` : ''}
            </Text>
          </View>
        )}

        {/* Dòng 5: Các nút hành động thao tác */}
        <View style={styles.actionRow}>
          {isUnprocessed && (
            <>
              <TouchableOpacity
                style={styles.assignBtn}
                onPress={() => assignModalRef.current?.open(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.assignBtnText}>👤 Gán khách & trừ nợ</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.ignoreBtn}
                onPress={() => handleIgnore(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.ignoreBtnText}>Bỏ qua</Text>
              </TouchableOpacity>
            </>
          )}

          {(isProcessed || isIgnored) && (
            <TouchableOpacity
              style={styles.restoreBtn}
              onPress={() => handleRestore(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.restoreBtnText}>↺ Khôi phục về Chờ xử lý</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

        <View style={styles.contentWrapper}>
          {/* HEADER: Nút quay lại & Tiêu đề */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
              <Text style={styles.backBtnText}>← Quay lại</Text>
            </TouchableOpacity>

            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>QUẢN LÝ GIAO DỊCH</Text>
              <Text style={styles.headerSubtitle}>Tự động nhận biến động số dư qua SePay</Text>
            </View>

            <View style={styles.headerRightAvatar}>
              <Text style={styles.avatarText}>
                {(auth.user?.name || 'A').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>

          {/* KHỐI TỔNG QUAN KPIs (2 cột Mobile-First) */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiCardIncome}>
              <Text style={styles.kpiLabel}>TỔNG TIỀN VÀO</Text>
              <Text style={styles.kpiValueIncome}>+{formatCurrency(summary.totalIn)} đ</Text>
            </View>
            <View style={styles.kpiCardPending}>
              <Text style={styles.kpiLabel}>CHỜ XỬ LÝ</Text>
              <Text style={styles.kpiValuePending}>{summary.unprocessedCount} giao dịch</Text>
            </View>
          </View>

          {/* KHỐI WEBHOOK SEPAY NHANH */}
          <View style={styles.webhookBanner}>
            <View style={styles.webhookInfo}>
              <Text style={styles.webhookTitle}>🔗 SePay Webhook Endpoint</Text>
              <Text style={styles.webhookDesc} numberOfLines={1}>
                {webhookUrl}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.copyWebhookBtn}
              onPress={handleCopyWebhookUrl}
              activeOpacity={0.7}
            >
              <Text style={styles.copyWebhookBtnText}>Sao chép</Text>
            </TouchableOpacity>
          </View>

          {/* TABS LỌC TRẠNG THÁI */}
          <View style={styles.tabBar}>
            {[
              { key: 'ALL', label: 'Tất cả' },
              { key: 'UNPROCESSED', label: `Chờ xử lý (${summary.unprocessedCount})` },
              { key: 'PROCESSED', label: 'Đã gán' },
              { key: 'IGNORED', label: 'Bỏ qua' },
            ].map((tab) => {
              const active = filterStatus === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabItem, active && styles.tabItemActive]}
                  onPress={() => setFilterStatus(tab.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Ô TÌM KIẾM NHANH */}
          <View style={styles.searchBar}>
            <TextInput
              style={styles.searchInput}
              placeholder="🔍 Tìm theo nội dung, STK, mã giao dịch..."
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => fetchTransactions()}
            />
            {search ? (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => {
                  setSearch('');
                  fetchTransactions();
                }}
              >
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* DANH SÁCH GIAO DỊCH */}
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loadingText}>Đang tải danh sách giao dịch...</Text>
            </View>
          ) : (
            <FlatList
              data={transactions}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderItem}
              refreshing={refreshing}
              onRefresh={() => fetchTransactions(true)}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyIcon}>💳</Text>
                  <Text style={styles.emptyTitle}>Chưa có giao dịch ngân hàng nào</Text>
                  <Text style={styles.emptyDesc}>
                    Cấu hình Webhook SePay để tự động nhận giao dịch bắn sang hệ thống theo thời gian thực.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </SafeAreaView>

      {/* Modal gán giao dịch và Popup xác nhận độc lập ở tầng cao nhất */}
      <AssignBankTransactionModal
        ref={assignModalRef}
        onAssigned={() => fetchTransactions(true)}
      />
      <PopupModal ref={popupRef} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentWrapper: {
    flex: 1,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 1,
  },
  headerRightAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  kpiCardIncome: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  kpiCardPending: {
    flex: 1,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  kpiValueIncome: {
    fontSize: 16,
    fontWeight: '800',
    color: '#059669',
  },
  kpiValuePending: {
    fontSize: 16,
    fontWeight: '800',
    color: '#D97706',
  },
  webhookBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  webhookInfo: {
    flex: 1,
    marginRight: 8,
  },
  webhookTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  webhookDesc: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 2,
  },
  copyWebhookBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  copyWebhookBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 10,
    gap: 6,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  tabItemActive: {
    backgroundColor: '#059669',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  gatewayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gatewayText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  accountNumberText: {
    fontSize: 12,
    color: '#64748B',
  },
  dateText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  amountText: {
    fontSize: 18,
    fontWeight: '800',
  },
  amountIncome: {
    color: '#059669',
  },
  amountExpense: {
    color: '#DC2626',
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusUnprocessed: {
    backgroundColor: '#FEF3C7',
  },
  statusUnprocessedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  statusProcessed: {
    backgroundColor: '#DCFCE7',
  },
  statusProcessedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  statusIgnored: {
    backgroundColor: '#F1F5F9',
  },
  statusIgnoredText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  contentBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
  },
  contentLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  contentText: {
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 18,
  },
  assignedBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  assignedLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  assignedCustomerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  assignBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  ignoreBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ignoreBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  restoreBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  restoreBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
});
