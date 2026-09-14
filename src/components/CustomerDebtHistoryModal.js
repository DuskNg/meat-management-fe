// meat-management-fe/src/components/CustomerDebtHistoryModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';
import { useResourceLock } from '../hooks/useResourceLock';

// Kích hoạt tính năng LayoutAnimation trên thiết bị Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import DailyDebtTile from './DailyDebtTile';
import MoneyInput from './MoneyInput';

const CustomerDebtHistoryModal = forwardRef(({
  paymentModalRef,
  detailModalRef,
  debtModalRef,
  onRefresh,
}, ref) => {
  const [visible, setVisible] = useState(false);
  const [customer, setCustomer] = useState(null);

  // Khóa khách hàng khi mở xem lịch sử nợ
  useResourceLock('CUSTOMER', customer?.id, visible, () => setVisible(false));
  const [loading, setLoading] = useState(false);
  const [monthGroups, setMonthGroups] = useState([]);
  const [gridWidth, setGridWidth] = useState(0);
  const [expandedMonth, setExpandedMonth] = useState(null); // Lưu trữ khóa của tháng đang mở rộng
  const [payInputAmount, setPayInputAmount] = useState(0); // Số tiền trả nợ mô phỏng cho tổng các tháng

  // 1. Phơi bày các hàm điều khiển (open, close, refresh) ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: (customerData) => {
      setCustomer(customerData);
      setVisible(true);
      setExpandedMonth(null);
      setMonthGroups([]);
      setPayInputAmount(0);
      fetchDebtHistory(customerData.id);
    },
    close: () => {
      setVisible(false);
    },
    refresh: () => {
      if (customer?.id) {
        fetchDebtHistory(customer.id);
      }
    },
  }));

  // Định dạng hiển thị tiền VNĐ
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  // Tiền rút gọn hiển thị trên các ô ngày (Ví dụ: 150.000 -> 150k, 1.200.000 -> 1.2tr)
  const formatAmountShort = (amount) => {
    if (amount >= 1_000_000) {
      const v = (amount / 1_000_000).toFixed(1).replace(/\.0$/, '');
      return `${v}tr`;
    }
    return `${Math.round(amount / 1_000)}k`;
  };

  // Định dạng ngày ngắn (Ví dụ: 2026-06-23 -> 23/06)
  const formatShortDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  // Lấy thứ trong tuần viết tắt tiếng Việt
  const getWeekday = (dateStr) => {
    return ['C.Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][new Date(dateStr).getDay()];
  };

  // Helper chuyển đổi chuỗi ngày ISO thành dạng khóa "DD/MM/YYYY"
  const toDateKey = (dateStr) => {
    const d = new Date(dateStr);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // 2. Tải lịch sử giao dịch và thanh toán, tính toán nợ theo thuật toán FIFO
  const fetchDebtHistory = async (customerId) => {
    setLoading(true);
    try {
      const [transRes, payRes] = await Promise.all([
        api.get(`/transactions?customerId=${customerId}`),
        api.get(`/payments?customerId=${customerId}`)
      ]);

      const transactions = transRes.data?.data || [];
      const payments = payRes.data?.data || [];

      // Bản đồ phân bổ nợ - trả để liên kết lịch sử
      const remainingDebtMap = {};
      transactions.forEach((t) => {
        remainingDebtMap[t.id] = parseFloat(t.totalAmount || 0);
      });

      const remainingPayMap = {};
      payments.forEach((p) => {
        remainingPayMap[p.id] = parseFloat(p.amount || 0);
      });

      const transAllocations = {}; // t.id -> array of { paymentId, date, amount, note }
      const payAllocations = {};   // p.id -> array of { transactionId, date, amount, note }

      const recordAllocation = (tId, tDate, tNote, pId, pDate, pNote, amount) => {
        if (!transAllocations[tId]) transAllocations[tId] = [];
        transAllocations[tId].push({ paymentId: pId, date: pDate, amount, note: pNote });

        if (!payAllocations[pId]) payAllocations[pId] = [];
        payAllocations[pId].push({ transactionId: tId, date: tDate, amount, note: tNote });
      };

      // 0. Phân bổ các khoản Trả hàng (Return Goods) trực tiếp vào đơn nợ của chính ngày phát sinh trả hàng
      const isReturnPayment = (p) => {
        const trimNote = (p.note || '').trim();
        return (
          trimNote.includes('[Trả lại hàng]') ||
          trimNote.includes('[Trả hàng nhanh]') ||
          trimNote.includes('Trả hàng') ||
          trimNote.includes('Trả lại')
        );
      };

      payments.forEach((p) => {
        if (isReturnPayment(p)) {
          const returnDateKey = toDateKey(p.paidAt);
          const dayTransactions = transactions
            .filter((t) => toDateKey(t.date) === returnDateKey)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

          dayTransactions.forEach((t) => {
            const debtAmt = remainingDebtMap[t.id];
            const payAmt = remainingPayMap[p.id];
            if (debtAmt > 0 && payAmt > 0) {
              const allocAmt = Math.min(debtAmt, payAmt);
              remainingDebtMap[t.id] -= allocAmt;
              remainingPayMap[p.id] -= allocAmt;
              recordAllocation(t.id, t.date, t.note, p.id, p.paidAt, p.note, allocAmt);
            }
          });
        }
      });

      // A. Phân bổ theo ngày cụ thể (Specific Date matching)
      payments.forEach((p) => {
        const trimNote = (p.note || '').trim();
        const dateMatch = trimNote.match(/^Thanh toán nợ ngày (\d{2})\/(\d{2})\/(\d{4})/);
        if (dateMatch) {
          const dateKey = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
          const dayTransactions = transactions
            .filter((t) => toDateKey(t.date) === dateKey)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

          dayTransactions.forEach((t) => {
            const debtAmt = remainingDebtMap[t.id];
            const payAmt = remainingPayMap[p.id];
            if (debtAmt > 0 && payAmt > 0) {
              const allocAmt = Math.min(debtAmt, payAmt);
              remainingDebtMap[t.id] -= allocAmt;
              remainingPayMap[p.id] -= allocAmt;
              recordAllocation(t.id, t.date, t.note, p.id, p.paidAt, p.note, allocAmt);
            }
          });
        }
      });

      // B. Phân bổ theo tháng cụ thể (Specific Month matching)
      payments.forEach((p) => {
        const trimNote = (p.note || '').trim();
        const monthMatch = trimNote.match(/^Thanh toán nợ Tháng (\d{2})\/(\d{4})/);
        if (monthMatch) {
          const monthKey = `${monthMatch[1]}/${monthMatch[2]}`;
          const monthTransactions = transactions
            .filter((t) => {
              const d = new Date(t.date);
              const mm = (d.getMonth() + 1).toString().padStart(2, '0');
              const yyyy = d.getFullYear();
              return `${mm}/${yyyy}` === monthKey;
            })
            .sort((a, b) => new Date(a.date) - new Date(b.date));

          monthTransactions.forEach((t) => {
            const debtAmt = remainingDebtMap[t.id];
            const payAmt = remainingPayMap[p.id];
            if (debtAmt > 0 && payAmt > 0) {
              const allocAmt = Math.min(debtAmt, payAmt);
              remainingDebtMap[t.id] -= allocAmt;
              remainingPayMap[p.id] -= allocAmt;
              recordAllocation(t.id, t.date, t.note, p.id, p.paidAt, p.note, allocAmt);
            }
          });
        }
      });

      // C. Phân bổ chung FIFO (cho phần còn dư của thanh toán cụ thể và thanh toán chung)
      // Sắp xếp tăng dần theo thời gian để trả nợ cũ trước
      const sortedPayments = [...payments].sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
      const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

      sortedPayments.forEach((p) => {
        sortedTransactions.forEach((t) => {
          const debtAmt = remainingDebtMap[t.id];
          const payAmt = remainingPayMap[p.id];
          if (debtAmt > 0 && payAmt > 0) {
            const allocAmt = Math.min(debtAmt, payAmt);
            remainingDebtMap[t.id] -= allocAmt;
            remainingPayMap[p.id] -= allocAmt;
            recordAllocation(t.id, t.date, t.note, p.id, p.paidAt, p.note, allocAmt);
          }
        });
      });

      const map = new Map();

      // 1. Duyệt qua tất cả giao dịch (nợ) để tạo các nhóm ngày nợ
      transactions.forEach((t) => {
        const key = toDateKey(t.date);
        if (!map.has(key)) {
          map.set(key, {
            dateKey: key,
            date: t.date,
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
          customerId: t.customerId || customerId,
          totalAmount: t.totalAmount || originalAmt,
          profitPercent: t.profitPercent,
          source: t.source,
          type: 'debt',
          date: t.date,
          amount: originalAmt,
          remainingAmount: remainingAmt,
          note: t.note,
          items: t.items || [],
          invoices: t.invoices || [], // Danh sách ảnh hóa đơn đính kèm đơn nợ
          allocations: transAllocations[t.id] || [], // Truyền thông tin phân bổ thanh toán
        });
        if (t.invoices && t.invoices.length > 0) {
          g.invoices = g.invoices || [];
          g.invoices.push(...t.invoices);
        }
        g.totalDebt += originalAmt;
        g.remainingDebt += remainingAmt;
      });

      // 2. Phân bổ các lượt thanh toán (payment) vào các nhóm ngày của hóa đơn nợ được khấu trừ tương ứng
      payments.forEach((p) => {
        const allocations = payAllocations[p.id] || [];

        if (allocations.length > 0) {
          // Lượt thanh toán này đã được phân bổ để khấu trừ nợ
          // Gộp nó vào các ngày nợ tương ứng
          allocations.forEach((alloc) => {
            const transDateKey = toDateKey(alloc.date);
            if (map.has(transDateKey)) {
              const g = map.get(transDateKey);
              // Kiểm tra xem lượt trả này đã được thêm vào ngày nợ này chưa (tránh nhân đôi)
              if (!g.payments.some((existingPay) => existingPay.id === p.id)) {
                g.payments.push({
                  id: p.id,
                  type: 'payment',
                  date: p.paidAt,
                  amount: alloc.amount, // Số tiền được phân bổ cho ngày nợ này
                  note: p.note,
                  allocations: [alloc],
                });
                g.totalPayment += alloc.amount;
              } else {
                const existingPay = g.payments.find((existingPay) => existingPay.id === p.id);
                existingPay.amount += alloc.amount;
                existingPay.allocations.push(alloc);
                g.totalPayment += alloc.amount;
              }
            }
          });
        }

        // 3. Nếu payment còn dư chưa phân bổ hết (tiền trả trước / dư)
        // Tạo nhóm ngày riêng cho ngày nạp tiền đó
        const prepayAmt = remainingPayMap[p.id];
        if (prepayAmt > 0) {
          const payDateKey = toDateKey(p.paidAt);
          if (!map.has(payDateKey)) {
            map.set(payDateKey, {
              dateKey: payDateKey,
              date: p.paidAt,
              transactions: [],
              payments: [],
              totalDebt: 0,
              remainingDebt: 0,
              totalPayment: 0,
            });
          }
          const g = map.get(payDateKey);
          g.payments.push({
            id: p.id,
            type: 'payment',
            date: p.paidAt,
            amount: prepayAmt,
            note: p.note || 'Trả trước (dư)',
            allocations: [],
          });
          g.totalPayment += prepayAmt;
        }
      });

      const dayGroupsVal = Array.from(map.values()).sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );

      const groups = {};
      dayGroupsVal.forEach((group) => {
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
      });

      Object.values(groups).forEach((m) => {
        m.totalPayment = Math.max(0, m.totalDebt - m.remainingDebt);
      });

      const sortedMonths = Object.values(groups).sort((a, b) => {
        const [aM, aY] = a.monthKey.split('/').map(Number);
        const [bM, bY] = b.monthKey.split('/').map(Number);
        return bY - aY || bM - aM;
      });

      setMonthGroups(sortedMonths);

      // Không tự động mở rộng tháng đầu tiên khi hiển thị chi tiết nợ
    } catch (err) {
      console.error('Lỗi tải lịch sử công nợ:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (customer) {
      fetchDebtHistory(customer.id);
    }
    if (onRefresh) {
      onRefresh();
    }
  };

  // 3. Tính toán kích cỡ ô vuông của ngày cho khớp 4 cột
  const NUM_COLS = 4;
  const TILE_GAP = 8;
  const tileSize = Math.max(0, Math.floor((gridWidth - TILE_GAP * (NUM_COLS - 1)) / NUM_COLS));

  // 4. Tổng nợ còn lại của tất cả các tháng
  const totalAllRemainingDebt = monthGroups.reduce((sum, m) => sum + (m.remainingDebt || 0), 0);

  // 5. Phân bổ số tiền trả nợ mô phỏng: trừ dần từ tháng cũ nhất có nợ đến tháng mới nhất (FIFO)
  const getSimulatedAllocation = (amount) => {
    if (!amount || amount <= 0) return { monthAllocMap: {}, remainingSurplus: 0, totalAllocated: 0 };

    // Sắp xếp các tháng theo thứ tự thời gian tăng dần (cũ nhất trước)
    const chronologicalMonths = [...monthGroups].sort((a, b) => {
      const [aM, aY] = a.monthKey.split('/').map(Number);
      const [bM, bY] = b.monthKey.split('/').map(Number);
      return aY - bY || aM - bM;
    });

    let remainingToAllocate = amount;
    const monthAllocMap = {}; // monthKey -> { allocated, originalDebt, newRemaining, isPaidOff }

    for (const month of chronologicalMonths) {
      const debt = month.remainingDebt || 0;
      if (debt <= 0) {
        monthAllocMap[month.monthKey] = {
          allocated: 0,
          originalDebt: 0,
          newRemaining: 0,
          isPaidOff: true,
        };
        continue;
      }

      if (remainingToAllocate <= 0) {
        monthAllocMap[month.monthKey] = {
          allocated: 0,
          originalDebt: debt,
          newRemaining: debt,
          isPaidOff: false,
        };
        continue;
      }

      const alloc = Math.min(debt, remainingToAllocate);
      const newRemaining = Math.max(0, debt - alloc);
      remainingToAllocate -= alloc;

      monthAllocMap[month.monthKey] = {
        allocated: alloc,
        originalDebt: debt,
        newRemaining,
        isPaidOff: newRemaining === 0,
      };
    }

    const totalAllocated = amount - remainingToAllocate;
    return {
      monthAllocMap,
      remainingSurplus: remainingToAllocate,
      totalAllocated,
    };
  };

  const simAllocation = getSimulatedAllocation(payInputAmount);

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <View style={styles.dragBar} />
        <Text style={styles.modalTitle}>📊 LỊCH SỬ NỢ CHI TIẾT</Text>

        {customer && (
          <View style={styles.customerBox}>
            <Text style={styles.customerName}>
              Khách hàng: <Text style={styles.boldText}>{customer.name}</Text>
            </Text>
            {customer.phone ? (
              <Text style={styles.customerPhone}>Số ĐT: {customer.phone}</Text>
            ) : null}
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Đang tính toán lịch sử nợ...</Text>
          </View>
        ) : monthGroups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>📋 Khách hàng này chưa phát sinh giao dịch nào.</Text>
          </View>
        ) : (
          <>
            {/* Ô nhập số tiền trả cho tổng các tháng & trừ dần từ tháng cũ nhất */}
            <View style={styles.paymentSimCard}>
              <View style={styles.paymentSimHeaderRow}>
                <Text style={styles.paymentSimTitle}>💵 Trả nợ tổng các tháng (trừ từ cũ nhất):</Text>
                {totalAllRemainingDebt > 0 && (
                  <Text style={styles.paymentSimTotalDebt}>
                    Tổng nợ: <Text style={styles.paymentSimTotalDebtBold}>{formatCurrency(totalAllRemainingDebt)}</Text>
                  </Text>
                )}
              </View>

              <View style={styles.paymentSimInputRow}>
                <View style={{ flex: 1 }}>
                  <MoneyInput
                    value={payInputAmount}
                    onChangeValue={(val) => setPayInputAmount(val)}
                    placeholder="Nhập số tiền trả (VD: 100.000.000)..."
                    style={styles.paymentSimMoneyInput}
                    inputStyle={styles.paymentSimMoneyTextInput}
                  />
                </View>
                {payInputAmount > 0 && (
                  <TouchableOpacity
                    style={styles.paymentSimClearBtn}
                    onPress={() => setPayInputAmount(0)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.paymentSimClearText}>✕ Xóa</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Phím gợi ý chọn nhanh */}
              <View style={styles.quickChipsWrap}>
                <TouchableOpacity
                  style={styles.quickChip}
                  onPress={() => setPayInputAmount(10_000_000)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickChipText}>10tr</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickChip}
                  onPress={() => setPayInputAmount(20_000_000)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickChipText}>20tr</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickChip}
                  onPress={() => setPayInputAmount(50_000_000)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickChipText}>50tr</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickChip}
                  onPress={() => setPayInputAmount(100_000_000)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickChipText}>100tr</Text>
                </TouchableOpacity>
                {totalAllRemainingDebt > 0 && (
                  <TouchableOpacity
                    style={[styles.quickChip, styles.quickChipFull]}
                    onPress={() => setPayInputAmount(totalAllRemainingDebt)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.quickChipText, styles.quickChipFullText]}>
                      Trả hết ({formatAmountShort(totalAllRemainingDebt)})
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Kết quả phân bổ khi nhập số tiền > 0 */}
              {payInputAmount > 0 && (
                <View style={styles.simResultBanner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.simResultText}>
                      {simAllocation.remainingSurplus > 0 ? (
                        <>
                          Đã trừ hết <Text style={styles.boldText}>{formatCurrency(simAllocation.totalAllocated)}</Text> nợ. Thừa: <Text style={[styles.boldText, { color: '#059669' }]}>+{formatCurrency(simAllocation.remainingSurplus)}</Text> (trả trước)
                        </>
                      ) : (
                        <>
                          Đã trừ: <Text style={[styles.boldText, { color: '#059669' }]}>{formatCurrency(simAllocation.totalAllocated)}</Text> (Còn nợ: <Text style={[styles.boldText, { color: '#DC2626' }]}>{formatCurrency(Math.max(0, totalAllRemainingDebt - payInputAmount))}</Text>)
                        </>
                      )}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.simSubmitBtn}
                    onPress={() => {
                      setVisible(false);
                      paymentModalRef?.current?.open(payInputAmount);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.simSubmitBtnText}>Thu tiền ngay 💵</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Text style={styles.helperText}>• Bấm vào từng tháng để xem chi tiết</Text>
            <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
            {monthGroups.map((month) => {
              const isExpanded = expandedMonth === month.monthKey;
              const hasDebt = month.remainingDebt > 0;
              const allocInfo = simAllocation.monthAllocMap[month.monthKey];
              const isSimActive = payInputAmount > 0 && allocInfo;
              const isDeducted = isSimActive && allocInfo.allocated > 0;
              const isSimPaidOff = isSimActive && allocInfo.isPaidOff && hasDebt;

              return (
                <View key={month.monthKey} style={styles.monthSection}>
                  {/* Tiêu đề tháng dạng Accordion */}
                  <TouchableOpacity
                    style={[
                      styles.monthHeader,
                      isExpanded && styles.monthHeaderExpanded,
                      hasDebt ? styles.monthHeaderDebt : styles.monthHeaderNoDebt,
                      isSimPaidOff && styles.monthHeaderSimPaidOff,
                      isDeducted && !isSimPaidOff && styles.monthHeaderSimDeducted,
                    ]}
                    onPress={() => {
                      // Kích hoạt hiệu ứng mở rộng/thu gọn mượt mà
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setExpandedMonth(isExpanded ? null : month.monthKey);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.monthHeaderLeft}>
                      <Text style={styles.chevronIcon}>{isExpanded ? '▼' : '▶'}</Text>
                      <Text style={styles.monthTitleText}>{month.monthLabel}</Text>
                    </View>

                    {isSimActive && hasDebt ? (
                      <View style={styles.monthStatusSimWrap}>
                        <View style={styles.monthStatusSimRow}>
                          <Text style={styles.monthOriginalDebtStriked}>
                            {formatAmountShort(month.remainingDebt)}
                          </Text>
                          <Text style={[styles.monthNewDebtText, isSimPaidOff ? styles.textSuccessBold : styles.textDebt]}>
                            ➜ {isSimPaidOff ? 'Hết nợ ✅' : `Còn: ${formatAmountShort(allocInfo.newRemaining)}`}
                          </Text>
                        </View>
                        {allocInfo.allocated > 0 && (
                          <Text style={styles.monthDeductBadge}>
                            (-{formatAmountShort(allocInfo.allocated)})
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Text style={[styles.monthDebtStatus, hasDebt ? styles.textDebt : styles.textNoDebt]}>
                        {hasDebt ? `Còn nợ: ${formatAmountShort(month.remainingDebt)}` : 'Hết nợ ✅'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {/* Phần hiển thị chi tiết khi mở rộng tháng */}
                  {isExpanded && (
                    <View style={styles.expandedContent}>
                      {/* Bảng tổng hợp tháng */}
                      <View style={styles.summaryCard}>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Mua nợ:</Text>
                          <Text style={styles.summaryValue}>{formatCurrency(month.totalDebt)}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Đã trả:</Text>
                          <Text style={[styles.summaryValue, { color: COLORS.primaryDark }]}>
                            {formatCurrency(month.totalPayment)}
                          </Text>
                        </View>
                        <View style={[styles.summaryRow, styles.debtRowBorder]}>
                          <Text style={styles.summaryLabelBold}>Còn nợ:</Text>
                          <Text style={[styles.summaryValueBold, hasDebt ? styles.textDebt : styles.textNoDebt]}>
                            {formatCurrency(month.remainingDebt)}
                          </Text>
                        </View>

                        {/* Dự kiến trừ mô phỏng nếu đang có số tiền trả */}
                        {isDeducted && (
                          <View style={styles.simSummaryBox}>
                            <Text style={styles.simSummaryTitle}>Dự kiến trừ khi trả {formatCurrency(payInputAmount)}:</Text>
                            <View style={styles.summaryRow}>
                              <Text style={styles.summaryLabel}>Trừ vào tháng này:</Text>
                              <Text style={[styles.summaryValue, { color: '#059669', fontWeight: 'bold' }]}>
                                -{formatCurrency(allocInfo.allocated)}
                              </Text>
                            </View>
                            <View style={styles.summaryRow}>
                              <Text style={styles.summaryLabelBold}>Còn lại sau trừ:</Text>
                              <Text style={[styles.summaryValueBold, allocInfo.newRemaining > 0 ? styles.textDebt : styles.textNoDebt]}>
                                {allocInfo.newRemaining > 0 ? formatCurrency(allocInfo.newRemaining) : '0 đ (Hết nợ ✅)'}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>

                      {/* Các nút thao tác nhanh: Ghi nợ / Thu tiền */}
                      <View style={styles.actionsRow}>
                        {hasDebt && (
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.paymentBtn]}
                            onPress={() => {
                              setVisible(false);
                              paymentModalRef?.current?.open(month.remainingDebt, month.monthKey);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.paymentBtnText}>Thu tiền 💵</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[
                            styles.actionBtn,
                            styles.debtBtn,
                            !hasDebt && { flex: 1 }
                          ]}
                          onPress={() => {
                            setVisible(false);
                            const [mm, yyyy] = month.monthKey.split('/');
                            const targetMonth = parseInt(mm, 10) - 1;
                            const targetYear = parseInt(yyyy, 10);
                            const today = new Date();
                            let initialDate = `01/${mm}/${yyyy}`;

                            if (today.getMonth() === targetMonth && today.getFullYear() === targetYear) {
                              const dd = String(today.getDate()).padStart(2, '0');
                              initialDate = `${dd}/${mm}/${yyyy}`;
                            }

                            const firstDay = `01/${mm}/${yyyy}`;
                            const lastDayNum = new Date(targetYear, targetMonth + 1, 0).getDate();
                            const lastDay = `${String(lastDayNum).padStart(2, '0')}/${mm}/${yyyy}`;

                            debtModalRef?.current?.open({
                              initialDate,
                              disableDate: false,
                              minDate: firstDay,
                              maxDate: lastDay,
                              note: `Ghi nợ tự động trong Tháng ${mm}/${yyyy}`
                            });
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.debtBtnText}>Ghi nợ mới 🔴</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Tiêu đề phần ngày */}
                      <Text style={styles.daysHeader}>Lịch sử ghi nhận theo ngày:</Text>

                      {/* Grid các ngày của tháng */}
                      <View
                        style={styles.grid}
                        onLayout={({ nativeEvent }) => setGridWidth(nativeEvent.layout.width)}
                      >
                        {month.days.map((group) => (
                          <DailyDebtTile
                            key={group.dateKey}
                            group={group}
                            tileSize={tileSize}
                            onPress={() => detailModalRef?.current?.open(group)}
                          />
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
          </>
        )}

        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => setVisible(false)}
        >
          <Text style={styles.closeButtonText}>ĐÓNG LẠI</Text>
        </TouchableOpacity>
      </View>
    </SmoothModal>
  );
});

export default CustomerDebtHistoryModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  dragBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 15,
  },
  customerBox: {
    backgroundColor: COLORS.inputBg,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  customerName: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  boldText: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  customerPhone: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textLight,
    fontStyle: 'italic',
    fontSize: 14,
  },
  scrollContainer: {
    // Tăng chiều cao tối đa của vùng cuộn để xem được nhiều thông tin hơn
    maxHeight: 600,
    marginBottom: 15,
  },
  monthSection: {
    marginBottom: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderRadius: 10,
  },
  monthHeaderExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  monthHeaderDebt: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  monthHeaderNoDebt: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  monthHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chevronIcon: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  monthTitleText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  monthDebtStatus: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  textDebt: {
    color: COLORS.dangerDark,
  },
  textNoDebt: {
    color: COLORS.primaryDark,
  },
  expandedContent: {
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    padding: 12,
    backgroundColor: COLORS.card,
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  debtRowBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 4,
    paddingTop: 6,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  summaryLabelBold: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  summaryValueBold: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  paymentBtn: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  paymentBtnText: {
    color: '#047857',
    fontWeight: 'bold',
    fontSize: 13,
  },
  debtBtn: {
    backgroundColor: '#FFF1F1',
    borderColor: '#FECACA',
  },
  debtBtnText: {
    color: COLORS.danger,
    fontWeight: 'bold',
    fontSize: 13,
  },
  daysHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 4,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...SHADOWS.card,
  },
  tileWeekday: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  tileDate: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text,
  },
  tileAmount: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  helperText: {
    fontSize: 13,
    color: COLORS.textLight,
    fontStyle: 'italic',
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  // ─── STYLES KHỐI NHẬP TRẢ NỢ VÀ TRỪ DẦN CÁC THÁNG ───
  paymentSimCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 10,
    marginBottom: 10,
  },
  paymentSimHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 4,
  },
  paymentSimTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  paymentSimTotalDebt: {
    fontSize: 12,
    color: '#475569',
  },
  paymentSimTotalDebtBold: {
    fontWeight: 'bold',
    color: '#DC2626',
  },
  paymentSimInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentSimMoneyInput: {
    height: 38,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
  },
  paymentSimMoneyTextInput: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  paymentSimClearBtn: {
    height: 38,
    paddingHorizontal: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentSimClearText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  quickChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 6,
  },
  quickChip: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  quickChipFull: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  quickChipFullText: {
    color: '#1D4ED8',
    fontWeight: 'bold',
  },
  simResultBanner: {
    marginTop: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  simResultText: {
    fontSize: 11.5,
    color: '#065F46',
    lineHeight: 16,
  },
  simSubmitBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  simSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  monthHeaderSimPaidOff: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  monthHeaderSimDeducted: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  monthStatusSimWrap: {
    alignItems: 'flex-end',
  },
  monthStatusSimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthOriginalDebtStriked: {
    fontSize: 11,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  monthNewDebtText: {
    fontSize: 12.5,
    fontWeight: 'bold',
  },
  textSuccessBold: {
    color: '#059669',
    fontWeight: 'bold',
  },
  monthDeductBadge: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
  },
  simSummaryBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  simSummaryTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#065F46',
    marginBottom: 4,
  },
});
