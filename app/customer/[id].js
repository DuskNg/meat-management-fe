import React, { useRef, useMemo, useState, useEffect } from 'react';
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
  Linking,
  UIManager,
  LayoutAnimation,
} from 'react-native';

// Kích hoạt LayoutAnimation trên Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import { COLORS, FONTS, SHADOWS } from '../../src/theme';
import DebtModal from '../../src/components/DebtModal';
import PaymentModal from '../../src/components/PaymentModal';
import TransactionDetailModal from '../../src/components/TransactionDetailModal';
import EditDebtModal from '../../src/components/EditDebtModal';
import EditPaymentModal from '../../src/components/EditPaymentModal';
import EditCustomerModal from '../../src/components/EditCustomerModal';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const debtModalRef = useRef(null);
  const paymentModalRef = useRef(null);
  const detailModalRef = useRef(null);
  const editDebtModalRef = useRef(null);
  const editPaymentModalRef = useRef(null);
  const editCustomerModalRef = useRef(null);
  const scrollViewRef = useRef(null); // Ref để điều khiển cuộn của ScrollView
  const monthLayouts = useRef({}); // Lưu trữ tọa độ y của các tháng để cuộn

  // Trạng thái các tháng được mở rộng (mặc định không mở rộng tháng nào)
  const [expandedMonths, setExpandedMonths] = useState({});

  const toggleMonth = (monthKey) => {
    // Cấu hình hiệu ứng Spring nảy nhẹ giúp các ô vuông hiển thị sinh động và mượt mà hơn (chỉ chạy trên Mobile)
    if (Platform.OS !== 'web' && LayoutAnimation) {
      LayoutAnimation.configureNext({
        duration: 350,
        create: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.scaleXY,
        },
        update: {
          type: LayoutAnimation.Types.spring,
          springDamping: 0.75, // Độ nảy vừa phải, êm ái
        },
        delete: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        }
      });
    }

    setExpandedMonths((prev) => {
      const nextState = {
        ...prev,
        [monthKey]: !prev[monthKey],
      };

      // Nếu tháng được mở rộng, tiến hành cuộn đến vị trí của tháng đó
      if (nextState[monthKey]) {
        setTimeout(() => {
          const yPos = monthLayouts.current[monthKey];
          if (yPos !== undefined && scrollViewRef.current) {
            scrollViewRef.current.scrollTo({ y: Math.max(0, yPos - 10), animated: true });
          }
        }, 150); // Chờ giao diện hiển thị phần mở rộng trước khi cuộn
      }

      return nextState;
    });
  };

  // Xử lý quay lại an toàn khi tải lại trang trực tiếp
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // Xử lý thực hiện cuộc gọi điện thoại cho khách hàng
  const handleCall = (phoneNumber) => {
    if (phoneNumber) {
      Linking.openURL(`tel:${phoneNumber}`).catch(() => {
        alert('Thiết bị của bạn không hỗ trợ tính năng gọi điện.');
      });
    }
  };

  // Xử lý điều hướng nhắn tin Zalo cho khách hàng
  const handleZalo = (phoneNumber) => {
    if (phoneNumber) {
      // Bỏ các ký tự không phải số
      let cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
      // Chuyển đổi mã quốc gia +84 hoặc 84 về đầu số 0 chuẩn Zalo
      if (cleanPhone.startsWith('+84')) {
        cleanPhone = '0' + cleanPhone.slice(3);
      } else if (cleanPhone.startsWith('84') && cleanPhone.length > 10) {
        cleanPhone = '0' + cleanPhone.slice(2);
      }

      const zaloUrl = `https://zalo.me/${cleanPhone}`;
      Linking.openURL(zaloUrl).catch(() => {
        alert('Không thể mở ứng dụng Zalo.');
      });
    }
  };

  // Xử lý mở địa chỉ khách hàng trên ứng dụng bản đồ (Google Maps / Apple Maps)
  const handleOpenMap = (address) => {
    if (address) {
      const query = encodeURIComponent(address);
      const url = Platform.select({
        ios: `maps://app?q=${query}`,
        android: `geo:0,0?q=${query}`,
        default: `https://www.google.com/maps/search/?api=1&query=${query}`,
      });
      Linking.openURL(url).catch(() => {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
      });
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

  // Tạo hiệu ứng chuyển cảnh mượt mà khi tải dữ liệu xong (chỉ chạy trên Mobile)
  useEffect(() => {
    if (Platform.OS !== 'web' && LayoutAnimation) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [isLoadingCustomer, isLoadingTrans, isLoadingPayments, transactions, payments]);

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
  // 5. Nhóm tất cả giao dịch theo ngày (DD/MM/YYYY) và thực hiện phân bổ thanh toán FIFO
  //    Mỗi ngày là 1 ô tile duy nhất trên grid
  const dayGroups = useMemo(() => {
    // 1. Phân loại các đợt thanh toán (thanh toán cụ thể ngày vs thanh toán chung)
    const specificPaymentsByDate = {}; // key: "DD/MM/YYYY" -> Mảng lượt trả nợ riêng ngày đó
    let generalPaidPool = 0;

    payments.forEach((p) => {
      const match = p.note && p.note.trim().match(/^Thanh toán nợ ngày (\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        const dateKey = `${match[1]}/${match[2]}/${match[3]}`;
        if (!specificPaymentsByDate[dateKey]) {
          specificPaymentsByDate[dateKey] = [];
        }
        specificPaymentsByDate[dateKey].push(p);
      } else {
        generalPaidPool += parseFloat(p.amount || 0);
      }
    });

    // 2. Khởi tạo bản đồ nợ còn lại của từng đơn hàng
    const remainingDebtMap = {};
    transactions.forEach((t) => {
      remainingDebtMap[t.id] = parseFloat(t.totalAmount || 0);
    });

    // 3. Khấu trừ các lượt trả nợ đích danh cho từng ngày (trừ đúng ngày đó)
    Object.keys(specificPaymentsByDate).forEach((dateKey) => {
      const dayPays = specificPaymentsByDate[dateKey];
      let dayPaidPool = dayPays.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      // Lấy toàn bộ giao dịch trong ngày này, xếp từ cũ đến mới
      const dayTransactions = transactions
        .filter((t) => toDateKey(t.date) === dateKey)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      dayTransactions.forEach((t) => {
        const amt = remainingDebtMap[t.id];
        if (dayPaidPool >= amt) {
          remainingDebtMap[t.id] = 0;
          dayPaidPool -= amt;
        } else if (dayPaidPool > 0) {
          remainingDebtMap[t.id] = amt - dayPaidPool;
          dayPaidPool = 0;
        }
      });

      // Nếu người bán ghi nhận thu thừa so với ngày đó, phần dư dồn vào quỹ trả nợ chung
      if (dayPaidPool > 0) {
        generalPaidPool += dayPaidPool;
      }
    });

    // 4. Khấu trừ quỹ trả nợ chung theo FIFO toàn bộ lịch sử (từ xa tới gần)
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    sortedTransactions.forEach((t) => {
      const amt = remainingDebtMap[t.id];
      if (amt > 0) {
        if (generalPaidPool >= amt) {
          remainingDebtMap[t.id] = 0;
          generalPaidPool -= amt;
        } else if (generalPaidPool > 0) {
          remainingDebtMap[t.id] = amt - generalPaidPool;
          generalPaidPool = 0;
        }
      }
    });

    const map = new Map();

    // Xử lý đơn ghi nợ và tính nợ gốc cũng như nợ còn lại thực tế của ngày đó
    transactions.forEach((t) => {
      const key = toDateKey(t.date);
      if (!map.has(key)) {
        map.set(key, {
          dateKey: key,
          date: t.date,         // Dùng để sắp xếp và hiển thị thứ
          transactions: [],
          payments: [],
          totalDebt: 0,
          remainingDebt: 0,
          totalPayment: 0,
        });
      }
      const g = map.get(key);
      const originalAmt = parseFloat(t.totalAmount);
      const remainingAmt = remainingDebtMap[t.id] !== undefined ? remainingDebtMap[t.id] : originalAmt;

      g.transactions.push({
        id: t.id,
        type: 'debt',
        date: t.date,
        amount: originalAmt,
        remainingAmount: remainingAmt,
        note: t.note,
        items: t.items || [],
      });
      g.totalDebt += originalAmt;
      g.remainingDebt += remainingAmt;
    });

    // Xử lý các lượt thu tiền thực tế diễn ra trong ngày
    payments.forEach((p) => {
      const key = toDateKey(p.paidAt);
      if (!map.has(key)) {
        map.set(key, {
          dateKey: key,
          date: p.paidAt,
          transactions: [],
          payments: [],
          totalDebt: 0,
          remainingDebt: 0,
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

    // Sắp xếp từ ngày mới nhất đến cũ nhất để hiển thị
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
  }, [transactions, payments]);

  // Nhóm các ngày (dayGroups) theo tháng (MM/YYYY)
  const monthGroups = useMemo(() => {
    const groups = {}; // key: "MM/YYYY"
    dayGroups.forEach((group) => {
      const d = new Date(group.date);
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const yyyy = d.getFullYear();
      const monthKey = `${mm}/${yyyy}`;

      if (!groups[monthKey]) {
        groups[monthKey] = {
          monthKey,
          monthLabel: `Tháng ${mm}/${yyyy}`,
          days: [],
          totalDebt: 0,
          remainingDebt: 0,
          totalPayment: 0,
        };
      }
      groups[monthKey].days.push(group);
      groups[monthKey].totalDebt += group.totalDebt;
      groups[monthKey].remainingDebt += group.remainingDebt;
      groups[monthKey].totalPayment += group.totalPayment;
    });
    return Object.values(groups);
  }, [dayGroups]);

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

  // ─── Helper: thứ viết rõ (Thứ 2 … Chủ Nhật) ───────────────────────────
  const getWeekday = (dateStr) =>
    ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][new Date(dateStr).getDay()];

  // ─── Tính kích thước tile chính xác để hiển thị khít 4 ô trên 1 hàng ───
  const NUM_COLS = 4;
  const TILE_GAP = 8;
  const SIDE_PAD = 16; // Dùng làm padding cho danh sách ngoài trong JSX render
  const CONTAINER_PADDING = 4; // Padding của container tháng bên trong
  const REAL_SIDE_PAD = SIDE_PAD + CONTAINER_PADDING; // Tổng padding thực tế mỗi bên
  const contentWidth = Math.min(width, 600);
  const tileSize = Math.floor(
    (contentWidth - REAL_SIDE_PAD * 2 - TILE_GAP * (NUM_COLS - 1)) / NUM_COLS
  );

  const isLoading = isLoadingCustomer || isLoadingTrans || isLoadingPayments;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.contentWrapper}>
        {/* ── HEADER: Thiết kế mới đồng bộ, đẹp mắt và trực quan hơn ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {customer ? customer.name : 'Đang tải...'}
          </Text>
          {customer ? (
            <TouchableOpacity
              style={styles.editCustomerButton}
              onPress={() => editCustomerModalRef.current?.open(customer)}
              activeOpacity={0.7}
            >
              <Text style={styles.editCustomerText}>Sửa thông tin ✏️</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── NỘI DUNG CUỘN ──────────────────────────────────────────────── */}
        <ScrollView
          ref={scrollViewRef}
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
              {customer?.phone ? (
                <View style={styles.phoneSectionContainer}>
                  <Text style={[styles.phoneText, { marginBottom: 10 }]}>📞 SĐT: {customer.phone}</Text>
                  <View style={styles.phoneContactActions}>
                    <TouchableOpacity
                      style={[styles.contactActionBtn, styles.callBtn]}
                      onPress={() => handleCall(customer.phone)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.contactActionText, styles.callBtnText]}>Gọi 📞</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.contactActionBtn, styles.zaloBtn]}
                      onPress={() => handleZalo(customer.phone)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.contactActionText, styles.zaloBtnText]}>Zalo 💬</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.contactActionBtn, styles.editBtn]}
                      onPress={() => editCustomerModalRef.current?.open(customer)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.contactActionText, styles.editBtnText]}>Sửa ✏️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
              {customer?.address ? (
                <View style={styles.addressRowContainer}>
                  <Text style={styles.addressText} numberOfLines={2}>📍 Địa chỉ: {customer.address}</Text>
                  <TouchableOpacity
                    style={styles.mapBtn}
                    onPress={() => handleOpenMap(customer.address)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.mapBtnText}>Tìm trên bản đồ 🗺️</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
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
          {monthGroups.length > 0 && (
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
                <Text style={styles.legendText}>Đã tất toán</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS.danger }]} />
                <Text style={styles.legendText}>Còn nợ</Text>
              </View>
              <Text style={styles.legendHint}>• Bấm vào ô để xem chi tiết</Text>
            </View>
          )}

          {/* ── LỊCH SỬ MUA BÁN THEO THÁNG ── */}
          {isLoading && monthGroups.length === 0 ? (
            <ActivityIndicator
              size="large"
              color={COLORS.primaryDark}
              style={{ marginTop: 40 }}
            />
          ) : monthGroups.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyText}>
                Chưa có lịch sử mua bán hay thu tiền nào.
              </Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: SIDE_PAD }}>
              {monthGroups.map((month) => {
                const isExpanded = !!expandedMonths[month.monthKey];
                return (
                  <View
                    key={month.monthKey}
                    style={styles.monthSection}
                    onLayout={(event) => {
                      const { y } = event.nativeEvent.layout;
                      monthLayouts.current[month.monthKey] = y;
                    }}
                  >
                    {/* Tiêu đề tháng dạng nút bấm để đóng/mở */}
                    <TouchableOpacity
                      style={styles.monthHeader}
                      onPress={() => toggleMonth(month.monthKey)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.monthHeaderLeft}>
                        <View style={[
                          styles.monthStatusDot,
                          { backgroundColor: month.remainingDebt === 0 ? COLORS.primary : COLORS.danger }
                        ]} />
                        <Text style={styles.monthTitle}>{month.monthLabel}</Text>
                      </View>

                      <View style={styles.monthHeaderRight}>
                        <Text style={styles.viewDetailText}>
                          {isExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                        </Text>
                        <Text style={styles.monthChevronRight}>
                          {isExpanded ? '▼' : '▶'}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {/* Danh sách ngày của tháng */}
                    {isExpanded && (
                      <View style={styles.monthExpandedContainer}>
                        {/* Dòng hiển thị tổng nợ và nút thanh toán nhanh */}
                        <View style={styles.monthSummaryRow}>
                          <View style={styles.monthDebtSummaryContainer}>
                            <Text style={styles.monthDebtSummaryText}>Còn nợ trong tháng:</Text>
                            <Text style={styles.monthDebtSummaryValue}>
                              {formatCurrency(month.remainingDebt)}
                            </Text>
                          </View>
                          {month.remainingDebt > 0 && (
                            <TouchableOpacity
                              style={styles.monthPaymentBtn}
                              onPress={() => paymentModalRef.current?.open(month.remainingDebt)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.monthPaymentBtnText}>Đã trả 💵</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={styles.monthGrid}>
                          {month.days.map((group) => {
                            // Xác định trạng thái thanh toán của ngày để hiển thị màu và nội dung phù hợp
                            const hasDebt = group.totalDebt > 0;
                            const hasPay = group.totalPayment > 0;

                            // 1. Đã thanh toán hết nợ: có nợ và nợ còn lại thực tế bằng 0
                            const isFullyPaid = hasDebt && group.remainingDebt === 0;
                            // 2. Trả nợ một phần: có nợ, nợ còn lại lớn hơn 0 nhưng đã được trừ bớt
                            const isPartiallyPaid = hasDebt && group.remainingDebt > 0 && group.remainingDebt < group.totalDebt;
                            // 3. Chưa thanh toán: có nợ và nợ còn lại bằng nợ ban đầu
                            const isUnpaidDebt = hasDebt && group.remainingDebt === group.totalDebt;
                            // 4. Chỉ thu nợ cũ: không phát sinh nợ mới, chỉ có lượt thu tiền nợ cũ
                            const isPaymentOnly = !hasDebt && hasPay;

                            let bgColor, bdColor, txtColor;
                            if (isFullyPaid || isPaymentOnly) {
                              // Màu xanh lá: Đã thanh toán hết hoặc chỉ thu nợ cũ
                              bgColor = '#F0FDF4';
                              bdColor = '#86EFAC';
                              txtColor = COLORS.primary;
                            } else if (isPartiallyPaid) {
                              // Màu cam: Trả nợ một phần
                              bgColor = '#FFF7ED';
                              bdColor = '#FED7AA';
                              txtColor = '#C2410C';
                            } else {
                              // Màu đỏ: Chỉ ghi nợ và chưa trả
                              bgColor = '#FFF1F1';
                              bdColor = '#FECACA';
                              txtColor = COLORS.danger;
                            }

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
                                {/* Thứ viết rõ */}
                                <Text
                                  style={[styles.tileWeekday, { color: txtColor }]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                >
                                  {getWeekday(group.date)}
                                </Text>
                                {/* Ngày/Tháng */}
                                <Text style={styles.tileDate}>
                                  {formatShortDate(group.date)}
                                </Text>
                                {/* Số tiền rút gọn hoặc trạng thái */}
                                {isFullyPaid ? (
                                  <Text style={[styles.tileAmount, { color: txtColor }]}>
                                    0đ
                                  </Text>
                                ) : (
                                  <Text style={[styles.tileAmount, { color: txtColor }]}>
                                    {formatAmountShort(hasDebt ? group.remainingDebt : group.totalPayment)}
                                  </Text>
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* ── NÚT CỐ ĐỊNH DƯỚI ĐÁY ── */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.actionButton, styles.btnDebt]}
            onPress={() => debtModalRef.current?.open()}
          >
            <Text style={styles.actionButtonText}>🔴 GHI NỢ MỚI</Text>
          </TouchableOpacity>
        </View>
      </View>

      <DebtModal ref={debtModalRef} customerId={id} onRefresh={handleRefreshAll} />
      <PaymentModal ref={paymentModalRef} customerId={id} onRefresh={handleRefreshAll} />
      <TransactionDetailModal
        ref={detailModalRef}
        customerId={id}
        onRefresh={handleRefreshAll}
        onEditTransaction={(transaction) => editDebtModalRef.current?.open(transaction)}
        onEditPayment={(payment) => editPaymentModalRef.current?.open(payment)}
      />
      <EditDebtModal ref={editDebtModalRef} onRefresh={handleRefreshAll} />
      <EditPaymentModal ref={editPaymentModalRef} onRefresh={handleRefreshAll} />
      <EditCustomerModal ref={editCustomerModalRef} onRefresh={handleRefreshAll} />
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
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9', // Viền siêu mỏng nhạt màu
    ...SHADOWS.card,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9', // Nền xám Slate 100 nhã nhặn
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  backButtonText: {
    marginBottom: 6,
    fontSize: 21, // Tăng từ 20
    fontWeight: 'bold',
    color: '#475569', // Slate 600
  },
  headerTitle: {
    flex: 1,
    fontSize: 19, // Tăng từ 18
    fontWeight: 'bold',
    color: COLORS.text,
  },
  editCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5', // Màu xanh lục nhạt
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  editCustomerText: {
    fontSize: 15, // Tăng từ 14
    fontWeight: 'bold',
    color: '#047857',
  },
  phoneSectionContainer: {
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingBottom: 12,
  },
  phoneRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  phoneText: {
    fontSize: FONTS.body + 1, // Tăng thêm 1
    color: COLORS.text,
    fontWeight: '500',
    flex: 1,
  },
  phoneActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtn: {
    backgroundColor: COLORS.inputBg,
    borderColor: COLORS.border,
  },
  editBtnText: {
    color: COLORS.textSecondary,
  },
  phoneActionText: {
    fontSize: FONTS.caption + 1, // Tăng thêm 1
    fontWeight: 'bold',
  },
  phoneContactActions: {
    flexDirection: 'row',
    gap: 10,
  },
  contactActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callBtn: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#A7F3D0',
  },
  callBtnText: {
    color: COLORS.primaryDark,
  },
  zaloBtn: {
    backgroundColor: '#EBF5FF',
    borderColor: '#BFE0FF',
  },
  zaloBtnText: {
    color: '#0068FF',
  },
  contactActionText: {
    fontSize: 15, // Tăng từ 14
    fontWeight: 'bold',
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
    fontSize: FONTS.body + 1, // Tăng thêm 1
    fontWeight: FONTS.weightBold,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  debtValue: {
    fontSize: 35, // Tăng từ 34
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
    fontSize: FONTS.body + 1, // Tăng thêm 1
    color: COLORS.text,
    marginTop: 8,
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
    fontSize: FONTS.subtitle + 1, // Tăng thêm 1
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
    fontSize: FONTS.caption + 1, // Tăng thêm 1
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
    fontSize: FONTS.caption + 1, // Tăng thêm 1
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  legendHint: {
    fontSize: FONTS.caption + 1, // Tăng thêm 1
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
    fontSize: 14, // Tăng từ 13
    fontWeight: 'bold',
  },
  tileDate: {
    fontSize: 14, // Tăng từ 13
    fontWeight: '700',
    color: COLORS.text,
  },
  tileAmount: {
    fontSize: 17, // Tăng từ 16
    fontWeight: 'bold',
  },
  tileMixedBadge: {
    fontSize: 11, // Tăng từ 10
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
    fontSize: 49, // Tăng từ 48
    marginBottom: 16,
  },
  emptyText: {
    fontSize: FONTS.body + 1, // Tăng thêm 1
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
  },
  addressRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingBottom: 8,
  },
  addressText: {
    fontSize: FONTS.body + 1, // Tăng thêm 1
    color: COLORS.text,
    flex: 1,
    marginRight: 10,
    lineHeight: 22,
  },
  mapBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapBtnText: {
    fontSize: FONTS.caption + 1, // Tăng thêm 1
    fontWeight: 'bold',
    color: '#1D4ED8',
  },
  monthExpandedContainer: {
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  monthSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  monthDebtSummaryContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    marginRight: 10,
  },
  monthDebtSummaryText: {
    fontSize: 14, // Tăng từ 13
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  monthDebtSummaryValue: {
    color: COLORS.danger,
    fontWeight: 'bold',
    fontSize: 19, // Tăng từ 18
  },
  monthPaymentBtn: {
    backgroundColor: '#ECFDF5', // Xanh lá pastel siêu nhẹ cao cấp
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20, // Bo tròn dạng capsule mềm mại
  },
  monthPaymentBtnText: {
    color: '#047857', // Chữ xanh lá đậm sang trọng
    fontSize: 14, // Tăng từ 13
    fontWeight: 'bold',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 19, // Tăng từ 18
    fontWeight: 'bold',
  },
  textDebt: { color: COLORS.danger },
  textPayment: { color: COLORS.primary },
  // ── Phần hiển thị theo tháng ──
  monthSection: {
    marginBottom: 16,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
    ...SHADOWS.card,
  },
  monthHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthChevron: {
    fontSize: 13, // Tăng từ 12
    color: COLORS.textSecondary,
    width: 16,
    textAlign: 'center',
  },
  monthStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  monthTitle: {
    fontSize: 17, // Tăng từ 16
    fontWeight: 'bold',
    color: COLORS.text,
  },
  monthHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewDetailText: {
    fontSize: FONTS.caption + 1, // Tăng thêm 1
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },
  monthChevronRight: {
    fontSize: 11, // Tăng từ 10
    color: COLORS.primaryDark,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
