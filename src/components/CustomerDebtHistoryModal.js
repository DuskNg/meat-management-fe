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
  useWindowDimensions,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';

const CustomerDebtHistoryModal = forwardRef(({
  paymentModalRef,
  detailModalRef,
  debtModalRef,
  onRefresh,
}, ref) => {
  const { width } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [monthGroups, setMonthGroups] = useState([]);
  const [expandedMonth, setExpandedMonth] = useState(null); // Lưu trữ khóa của tháng đang mở rộng

  // 1. Phơi bày hàm open/close ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: (customerData) => {
      setCustomer(customerData);
      setVisible(true);
      setExpandedMonth(null);
      setMonthGroups([]);
      fetchDebtHistory(customerData.id);
    },
    close: () => {
      setVisible(false);
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

      // Phân bổ thanh toán FIFO
      const specificPaymentsByDate = {};
      const specificPaymentsByMonth = {};
      let generalPaidPool = 0;

      payments.forEach((p) => {
        const trimNote = (p.note || '').trim();
        const dateMatch = trimNote.match(/^Thanh toán nợ ngày (\d{2})\/(\d{2})\/(\d{4})/);
        const monthMatch = trimNote.match(/^Thanh toán nợ Tháng (\d{2})\/(\d{4})/);

        if (dateMatch) {
          const dateKey = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
          if (!specificPaymentsByDate[dateKey]) {
            specificPaymentsByDate[dateKey] = [];
          }
          specificPaymentsByDate[dateKey].push(p);
        } else if (monthMatch) {
          const monthKey = `${monthMatch[1]}/${monthMatch[2]}`;
          if (!specificPaymentsByMonth[monthKey]) {
            specificPaymentsByMonth[monthKey] = [];
          }
          specificPaymentsByMonth[monthKey].push(p);
        } else {
          generalPaidPool += parseFloat(p.amount || 0);
        }
      });

      const remainingDebtMap = {};
      transactions.forEach((t) => {
        remainingDebtMap[t.id] = parseFloat(t.totalAmount || 0);
      });

      Object.keys(specificPaymentsByDate).forEach((dateKey) => {
        const dayPays = specificPaymentsByDate[dateKey];
        let dayPaidPool = dayPays.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

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

        if (dayPaidPool > 0) {
          generalPaidPool += dayPaidPool;
        }
      });

      Object.keys(specificPaymentsByMonth).forEach((monthKey) => {
        const monthPays = specificPaymentsByMonth[monthKey];
        let monthPaidPool = monthPays.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        const monthTransactions = transactions
          .filter((t) => {
            const d = new Date(t.date);
            const mm = (d.getMonth() + 1).toString().padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${mm}/${yyyy}` === monthKey;
          })
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        monthTransactions.forEach((t) => {
          const amt = remainingDebtMap[t.id];
          if (amt > 0) {
            if (monthPaidPool >= amt) {
              remainingDebtMap[t.id] = 0;
              monthPaidPool -= amt;
            } else if (monthPaidPool > 0) {
              remainingDebtMap[t.id] = amt - monthPaidPool;
              monthPaidPool = 0;
            }
          }
        });

        if (monthPaidPool > 0) {
          generalPaidPool += monthPaidPool;
        }
      });

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

      // Tự động mở rộng tháng đầu tiên nếu có dữ liệu
      if (sortedMonths.length > 0) {
        setExpandedMonth(sortedMonths[0].monthKey);
      }
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
  const modalPadding = 20;
  const contentWidth = Math.min(width, 600);
  const gridWidth = contentWidth - modalPadding * 2 - 24;
  const NUM_COLS = 4;
  const TILE_GAP = 8;
  const tileSize = Math.max(0, Math.floor((gridWidth - TILE_GAP * (NUM_COLS - 1)) / NUM_COLS));

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
          <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
            {monthGroups.map((month) => {
              const isExpanded = expandedMonth === month.monthKey;
              const hasDebt = month.remainingDebt > 0;

              return (
                <View key={month.monthKey} style={styles.monthSection}>
                  {/* Tiêu đề tháng dạng Accordion */}
                  <TouchableOpacity
                    style={[
                      styles.monthHeader,
                      isExpanded && styles.monthHeaderExpanded,
                      hasDebt ? styles.monthHeaderDebt : styles.monthHeaderNoDebt
                    ]}
                    onPress={() => setExpandedMonth(isExpanded ? null : month.monthKey)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.monthHeaderLeft}>
                      <Text style={styles.chevronIcon}>{isExpanded ? '▼' : '▶'}</Text>
                      <Text style={styles.monthTitleText}>{month.monthLabel}</Text>
                    </View>
                    <Text style={[styles.monthDebtStatus, hasDebt ? styles.textDebt : styles.textNoDebt]}>
                      {hasDebt ? `Còn nợ: ${formatAmountShort(month.remainingDebt)}` : 'Hết nợ ✅'}
                    </Text>
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
                      <View style={styles.grid}>
                        {month.days.map((group) => {
                          const dayHasDebt = group.totalDebt > 0;
                          const dayHasPay = group.totalPayment > 0;

                          const isFullyPaid = dayHasDebt && group.remainingDebt === 0;
                          const isPartiallyPaid = dayHasDebt && group.remainingDebt > 0 && group.remainingDebt < group.totalDebt;
                          const isPaymentOnly = !dayHasDebt && dayHasPay;

                          let dayBgColor, dayBdColor, dayTxtColor;
                          if (isFullyPaid || isPaymentOnly) {
                            dayBgColor = '#F0FDF4';
                            dayBdColor = '#86EFAC';
                            dayTxtColor = COLORS.primary;
                          } else if (isPartiallyPaid) {
                            dayBgColor = '#FFF7ED';
                            dayBdColor = '#FED7AA';
                            dayTxtColor = '#C2410C';
                          } else {
                            dayBgColor = '#FFF1F1';
                            dayBdColor = '#FECACA';
                            dayTxtColor = COLORS.danger;
                          }

                          return (
                            <TouchableOpacity
                              key={group.dateKey}
                              style={[
                                styles.tile,
                                {
                                  width: tileSize,
                                  height: tileSize,
                                  backgroundColor: dayBgColor,
                                  borderColor: dayBdColor,
                                },
                              ]}
                              onPress={() => {
                                detailModalRef?.current?.open(group);
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.tileWeekday, { color: dayTxtColor }]} numberOfLines={1} adjustsFontSizeToFit>
                                {getWeekday(group.date)}
                              </Text>
                              <Text style={styles.tileDate} numberOfLines={1} adjustsFontSizeToFit>
                                {formatShortDate(group.date)}
                              </Text>
                              {isFullyPaid ? (
                                <Text style={[styles.tileAmount, { color: dayTxtColor }]} numberOfLines={1} adjustsFontSizeToFit>0đ</Text>
                              ) : (
                                <Text style={[styles.tileAmount, { color: dayTxtColor }]} numberOfLines={1} adjustsFontSizeToFit>
                                  {formatAmountShort(dayHasDebt ? group.remainingDebt : group.totalPayment)}
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
          </ScrollView>
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
});
