// meat-management-fe/src/components/MonthDetailDrawer.js
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Animated,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { COLORS, FONTS, SHADOWS } from '../theme';

const MonthDetailDrawer = forwardRef(({
  monthGroups,
  formatCurrency,
  formatShortDate,
  formatAmountShort,
  getWeekday,
  paymentModalRef,
  detailModalRef,
}, ref) => {
  const { width, height } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [month, setMonth] = useState(null);

  // Chiều rộng của sidebar (chiếm 85% màn hình trên mobile hoặc tối đa 400px trên web)
  const drawerWidth = Math.min(width * 0.85, 400);

  // Giá trị animation dịch chuyển ngang từ phải sang trái
  const slideAnim = useRef(new Animated.Value(drawerWidth)).current;

  // Phơi bày phương thức open/close ra ngoài
  useImperativeHandle(ref, () => ({
    open: (monthData) => {
      setMonth(monthData);
      setVisible(true);
      // Đặt animation bắt đầu từ bên ngoài màn hình bên phải
      slideAnim.setValue(drawerWidth);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    },
    close: () => {
      handleClose();
    },
  }));

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: drawerWidth,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      setMonth(null);
    });
  };

  // Cập nhật lại dữ liệu tháng chi tiết khi danh sách monthGroups của màn hình cha thay đổi (ví dụ khi thu nợ)
  useEffect(() => {
    if (visible && month && monthGroups) {
      const updatedMonth = monthGroups.find((m) => m.monthKey === month.monthKey);
      if (updatedMonth) {
        setMonth(updatedMonth);
      }
    }
  }, [monthGroups, visible]);

  if (!visible || !month) return null;

  // ─── Tính kích thước tile ngày bên trong drawer (chia làm 3 cột, trừ 16px an toàn để tránh rớt dòng do thanh cuộn) ───
  const NUM_COLS = 3;
  const TILE_GAP = 8;
  const DRAWER_PADDING = 16;
  const tileSize = Math.max(0, Math.floor(
    (drawerWidth - 16 - DRAWER_PADDING * 2 - TILE_GAP * (NUM_COLS - 1)) / NUM_COLS
  ));

  return (
    <View style={[
      StyleSheet.absoluteFillObject,
      Platform.OS === 'web' && { position: 'fixed' }
    ]}>
      {/* Lớp nền mờ click vào để đóng */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />

      {/* Thẻ trượt sidebar chứa chi tiết tháng */}
      <Animated.View
        style={[
          styles.drawerContainer,
          {
            width: drawerWidth,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        {/* Header của Sidebar */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {month.monthLabel}
          </Text>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Phần tổng hợp cố định không cuộn */}
        <View style={styles.fixedHeaderContainer}>
          {/* Báo cáo tài chính tháng */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>📊 TỔNG HỢP TRONG THÁNG</Text>

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
              <Text style={[styles.summaryValueBold, { color: month.remainingDebt > 0 ? COLORS.danger : COLORS.primaryDark }]}>
                {formatCurrency(month.remainingDebt)}
              </Text>
            </View>

            {/* Nút thanh toán nhanh cho tháng */}
            {month.remainingDebt > 0 && (
              <TouchableOpacity
                style={styles.paymentBtn}
                onPress={() => {
                  paymentModalRef?.current?.open(month.remainingDebt);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.paymentBtnText}>Đã trả (Thu tiền 💵)</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tiêu đề danh sách ngày */}
          <Text style={styles.sectionTitle}>📅 Lịch sử theo ngày ({month.days.length})</Text>

          {/* Chú thích trạng thái giao dịch */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
              <Text style={styles.legendText}>Đã tất toán</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F97316' }]} />
              <Text style={styles.legendText}>Trả nhưng còn thiếu</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.danger }]} />
              <Text style={styles.legendText}>Còn nợ</Text>
            </View>
            <Text style={styles.legendHint}>• Bấm vào ô để xem chi tiết</Text>
          </View>
        </View>

        {/* Chỉ cuộn danh sách lịch sử theo ngày */}
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Grid ngày */}
          <View style={styles.grid}>
            {month.days.map((group) => {
              const hasDebt = group.totalDebt > 0;
              const hasPay = group.totalPayment > 0;

              // Phân loại màu sắc của từng ô ngày
              const isFullyPaid = hasDebt && group.remainingDebt === 0;
              const isPartiallyPaid = hasDebt && group.remainingDebt > 0 && group.remainingDebt < group.totalDebt;
              const isPaymentOnly = !hasDebt && hasPay;

              let bgColor, bdColor, txtColor;
              if (isFullyPaid || isPaymentOnly) {
                bgColor = '#F0FDF4';
                bdColor = '#86EFAC';
                txtColor = COLORS.primary;
              } else if (isPartiallyPaid) {
                bgColor = '#FFF7ED';
                bdColor = '#FED7AA';
                txtColor = '#C2410C';
              } else {
                bgColor = '#FFF1F1';
                bdColor = '#FECACA';
                txtColor = COLORS.danger;
              }

              return (
                <TouchableOpacity
                  key={group.dateKey}
                  style={[
                    styles.tile,
                    {
                      width: tileSize,
                      height: tileSize, // Đổi về dạng ô vuông hoàn hảo theo yêu cầu người dùng
                      backgroundColor: bgColor,
                      borderColor: bdColor,
                    },
                  ]}
                  onPress={() => {
                    detailModalRef?.current?.open(group);
                  }}
                  activeOpacity={0.7}
                >
                  {/* Thứ viết tắt */}
                  <Text style={[styles.tileWeekday, { color: txtColor }]} numberOfLines={1}>
                    {getWeekday(group.date)}
                  </Text>
                  {/* Ngày/Tháng */}
                  <Text style={styles.tileDate}>
                    {formatShortDate(group.date)}
                  </Text>
                  {/* Số tiền rút gọn hoặc trạng thái */}
                  {isFullyPaid ? (
                    <Text style={[styles.tileAmount, { color: txtColor }]}>0đ</Text>
                  ) : (
                    <Text style={[styles.tileAmount, { color: txtColor }]}>
                      {formatAmountShort(hasDebt ? group.remainingDebt : group.totalPayment)}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    zIndex: 1000,
  },
  drawerContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.background,
    zIndex: 1001,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    flexDirection: 'column',
    alignItems: 'stretch',
    ...SHADOWS.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  closeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#475569',
  },
  fixedHeaderContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 80,
  },
  summaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
    ...SHADOWS.card,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  debtRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 6,
    paddingTop: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  summaryLabelBold: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  summaryValueBold: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  paymentBtn: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  paymentBtnText: {
    color: '#047857',
    fontWeight: 'bold',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 6,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...SHADOWS.card,
  },
  tileWeekday: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  tileDate: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  tileAmount: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
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
    fontSize: FONTS.caption + 1,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  legendHint: {
    fontSize: FONTS.caption + 1,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
});

export default MonthDetailDrawer;
