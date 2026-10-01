// meat-management-fe/src/components/ProfitManagementModal.js
import React, { useState, forwardRef, useImperativeHandle, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';
import CustomSelect from './CustomSelect';
import { showGlobalToast } from '../store/toastStore';

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) => {
  const num = parseFloat(amount || 0);
  return new Intl.NumberFormat('vi-VN').format(Math.round(num)) + ' đ';
};

// Định dạng rút gọn số tiền (ví dụ: 1.5Tr, 2.3Tỷ)
const formatShortAmount = (amount) => {
  const num = parseFloat(amount || 0);
  if (Math.abs(num) >= 1000000000) {
    return `${(num / 1000000000).toFixed(2).replace(/\.?0+$/, '')} Tỷ`;
  }
  if (Math.abs(num) >= 1000000) {
    return `${(num / 1000000).toFixed(1).replace(/\.?0+$/, '')} Tr`;
  }
  if (Math.abs(num) >= 1000) {
    return `${(num / 1000).toFixed(0)}k`;
  }
  return `${Math.round(num)}`;
};

// Định dạng nhãn tháng hiển thị: "2026-09" ➔ "Tháng 09/2026"
const formatMonthLabel = (monthKey) => {
  if (!monthKey || monthKey === 'ALL') return 'Toàn bộ thời gian';
  const parts = monthKey.split('-');
  if (parts.length === 2) {
    return `Tháng ${parts[1]}/${parts[0]}`;
  }
  return monthKey;
};

// Modal Quản Lý Lợi Nhuận: Đối soát Doanh số bán ra, Tiền vốn nhập lò, Kết luận Lãi/Lỗ
const ProfitManagementModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Bộ lọc thời gian: 'ALL' hoặc 'YYYY-MM'
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Lưu tháng được chọn gần nhất để phục hồi khi chuyển từ ALL sang tháng
  const [lastMonthKey, setLastMonthKey] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Quản lý zIndex cho CustomSelect
  const [selectContainerZIndex, setSelectContainerZIndex] = useState(10);

  // Mở rộng chi tiết theo ngày/tháng
  const [showDailyBreakdown, setShowDailyBreakdown] = useState(true);
  const [showSupplierBreakdown, setShowSupplierBreakdown] = useState(false);

  // Dữ liệu báo cáo từ API
  const [reportData, setReportData] = useState(null);

  useImperativeHandle(ref, () => ({
    open: (defaultMonth) => {
      if (defaultMonth) {
        setSelectedMonth(defaultMonth);
        if (defaultMonth !== 'ALL') {
          setLastMonthKey(defaultMonth);
        }
      }
      setVisible(true);
      fetchReport(defaultMonth || selectedMonth);
    },
    close: () => {
      setVisible(false);
    },
    refresh: () => {
      fetchReport(selectedMonth);
    },
  }));

  // Tải báo cáo lợi nhuận từ backend
  const fetchReport = async (targetMonth = selectedMonth) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (targetMonth && targetMonth !== 'ALL') {
        params.month = targetMonth;
      } else {
        params.month = 'ALL';
      }

      const res = await api.get('/suppliers/profit-report', { params });
      if (res.data?.success && res.data?.data) {
        setReportData(res.data.data);
      } else {
        setError(res.data?.message || 'Không thể tải báo cáo lợi nhuận.');
      }
    } catch (err) {
      console.error('[PROFIT REPORT FETCH ERROR]', err);
      setError(err.response?.data?.message || 'Có lỗi kết nối máy chủ khi tải báo cáo.');
    } finally {
      setLoading(false);
    }
  };

  // Tạo danh sách các tùy chọn tháng cho CustomSelect (Gồm cả Toàn bộ thời gian và từng tháng)
  const monthOptions = useMemo(() => {
    const list = [{ id: 'ALL', name: '🌐 Toàn bộ thời gian' }];
    const avMonths = reportData?.filter?.availableMonths || [];

    // Luôn bảo đảm tháng hiện tại có trong danh sách
    const now = new Date();
    const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const allSet = new Set([curMonthKey, ...avMonths]);

    Array.from(allSet).sort().reverse().forEach((m) => {
      list.push({ id: m, name: `📅 ${formatMonthLabel(m)}` });
    });

    return list;
  }, [reportData?.filter?.availableMonths]);

  const selectedMonthOption = monthOptions.find((opt) => opt.id === selectedMonth) || monthOptions[0];

  // Chuyển tháng nhanh (Tiến/Lùi)
  const handleShiftMonth = (offset) => {
    if (selectedMonth === 'ALL') {
      const now = new Date();
      const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      setSelectedMonth(currentKey);
      setLastMonthKey(currentKey);
      fetchReport(currentKey);
      return;
    }
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    const newMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonthKey);
    setLastMonthKey(newMonthKey);
    fetchReport(newMonthKey);
  };

  // Xử lý khi chọn thời gian từ CustomSelect
  const handleSelectMonth = (opt) => {
    if (!opt) return;
    setSelectedMonth(opt.id);
    if (opt.id !== 'ALL') {
      setLastMonthKey(opt.id);
    }
    fetchReport(opt.id);
  };

  // Chọn chế độ Toàn bộ thời gian
  const handleSelectAllTime = () => {
    setSelectedMonth('ALL');
    fetchReport('ALL');
  };

  // Chọn chế độ Theo từng tháng
  const handleSelectMonthly = () => {
    const now = new Date();
    const defaultM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const targetKey = (lastMonthKey && lastMonthKey !== 'ALL') ? lastMonthKey : defaultM;
    setSelectedMonth(targetKey);
    fetchReport(targetKey);
  };

  // Trích xuất số liệu chuẩn tính TẤT CẢ CÁC LÒ (đã gồm nhà 666 chuẩn hóa)
  const activeMetrics = useMemo(() => {
    if (!reportData) return null;
    const supData = reportData.withAllSuppliers;
    const salesData = reportData.sales;

    const totalSales = salesData?.totalAmount || 0;
    const totalImport = supData?.totalImport || 0;
    const totalCollected = salesData?.totalCollected || 0;
    const totalPaid = supData?.totalPaid || 0;

    const profitOrLoss = totalSales - totalImport;
    const isProfit = profitOrLoss >= 0;
    const profitRate = totalSales > 0 ? ((profitOrLoss / totalSales) * 100).toFixed(1) : 0;
    const cashFlowDiff = totalCollected - totalPaid;

    return {
      totalSales,
      salesCount: salesData?.count || 0,
      totalImport,
      importCount: supData?.importCount || 0,
      totalCollected,
      collectedCount: salesData?.collectedCount || 0,
      totalPaid,
      paidCount: supData?.paidCount || 0,
      customerDebtRemaining: salesData?.customerDebtRemaining || 0,
      supplierDebtRemaining: supData?.supplierDebtRemaining || 0,
      profitOrLoss,
      isProfit,
      profitRate,
      cashFlowDiff,
    };
  }, [reportData]);

  // Danh sách các nhà cung cấp có phát sinh tiền nhập trong kỳ đang lọc
  const activeSuppliersList = useMemo(() => {
    if (!reportData?.suppliersBreakdown) return [];
    return reportData.suppliersBreakdown.filter(
      (s) => parseFloat(s.importAmount || 0) > 0
    );
  }, [reportData?.suppliersBreakdown]);

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* HEADER MODAL */}
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerIcon}>📈</Text>
            <Text style={styles.headerTitle}>QUẢN LÝ LỢI NHUẬN</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* BODY CUỘN */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* THANH BỘ LỌC THỜI GIAN & CHỌN NHANH */}
          <View style={[styles.filterCard, { zIndex: selectContainerZIndex }]}>
            <Text style={styles.filterSectionTitle}>MỐC THỜI GIAN ĐỐI SOÁT</Text>

            {/* TAB CHUYỂN ĐỔI CHẾ ĐỘ THỜI GIAN: THEO THÁNG vs TOÀN BỘ THỜI GIAN */}
            <View style={styles.timeModeTabs}>
              <TouchableOpacity
                style={[
                  styles.timeModeTabBtn,
                  selectedMonth !== 'ALL' && styles.timeModeTabBtnActive,
                ]}
                onPress={handleSelectMonthly}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.timeModeTabText,
                    selectedMonth !== 'ALL' && styles.timeModeTabTextActive,
                  ]}
                >
                  📅 Theo từng tháng
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.timeModeTabBtn,
                  selectedMonth === 'ALL' && styles.timeModeTabBtnActive,
                ]}
                onPress={handleSelectAllTime}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.timeModeTabText,
                    selectedMonth === 'ALL' && styles.timeModeTabTextActive,
                  ]}
                >
                  🌐 Toàn bộ thời gian
                </Text>
              </TouchableOpacity>
            </View>

            {/* Hàng chọn tháng và chuyển tháng nhanh */}
            <View style={styles.timeFilterRow}>
              <TouchableOpacity
                style={[styles.shiftBtn, selectedMonth === 'ALL' && styles.shiftBtnDisabled]}
                onPress={() => handleShiftMonth(-1)}
                disabled={selectedMonth === 'ALL'}
                activeOpacity={0.7}
              >
                <Text style={[styles.shiftBtnText, selectedMonth === 'ALL' && styles.shiftBtnTextDisabled]}>
                  ◀ Tháng trước
                </Text>
              </TouchableOpacity>

              <View style={styles.selectWrapper}>
                <CustomSelect
                  value={selectedMonthOption}
                  options={monthOptions}
                  onSelect={handleSelectMonth}
                  renderSelected={(opt) => opt?.name || 'Chọn thời gian'}
                  onOpenChange={(isOpen) => setSelectContainerZIndex(isOpen ? 999999 : 10)}
                  compact={true}
                />
              </View>

              <TouchableOpacity
                style={[styles.shiftBtn, selectedMonth === 'ALL' && styles.shiftBtnDisabled]}
                onPress={() => handleShiftMonth(1)}
                disabled={selectedMonth === 'ALL'}
                activeOpacity={0.7}
              >
                <Text style={[styles.shiftBtnText, selectedMonth === 'ALL' && styles.shiftBtnTextDisabled]}>
                  Tháng sau ▶
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* TRẠNG THÁI LOADING / LỖI */}
          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Đang tính toán số liệu đối soát...</Text>
            </View>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}

          {/* NỘI DUNG CHÍNH SAU KHI TÍNH TOÁN */}
          {!loading && activeMetrics && (
            <>
              {/* HERO CARD: KẾT LUẬN LÃI / LỖ TRUNG TÂM */}
              <View
                style={[
                  styles.heroCard,
                  activeMetrics.isProfit ? styles.heroCardProfit : styles.heroCardLoss,
                ]}
              >
                <View style={styles.heroHeaderRow}>
                  <View style={styles.heroBadgeRow}>
                    <Text style={styles.heroStatusIcon}>
                      {activeMetrics.isProfit ? '🎉' : '⚠️'}
                    </Text>
                    <Text
                      style={[
                        styles.heroStatusTitle,
                        { color: activeMetrics.isProfit ? '#047857' : '#B91C1C' },
                      ]}
                    >
                      KẾT LUẬN:{' '}
                      {activeMetrics.profitOrLoss === 0
                        ? 'HÒA VỐN'
                        : activeMetrics.isProfit
                        ? 'ĐANG CÓ LÃI'
                        : 'ĐANG BỊ ÂM (LỖ)'}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.percentBadge,
                      {
                        backgroundColor: activeMetrics.isProfit ? '#D1FAE5' : '#FEE2E2',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.percentBadgeText,
                        { color: activeMetrics.isProfit ? '#047857' : '#B91C1C' },
                      ]}
                    >
                      {activeMetrics.isProfit ? '+' : ''}
                      {activeMetrics.profitRate}% doanh số
                    </Text>
                  </View>
                </View>

                {/* SỐ TIỀN LÃI / LỖ TO RÕ */}
                <Text
                  style={[
                    styles.heroAmountText,
                    { color: activeMetrics.isProfit ? '#059669' : '#DC2626' },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit={true}
                >
                  {activeMetrics.profitOrLoss > 0 ? '+' : ''}
                  {formatCurrency(activeMetrics.profitOrLoss)}
                </Text>

                {/* PHÂN TÍCH NHẬN XÉT DƯỚI HERO */}
                <Text style={styles.heroExplainingText}>
                  {activeMetrics.isProfit
                    ? `Doanh số bán ra (${formatShortAmount(
                        activeMetrics.totalSales
                      )}) cao hơn tiền vốn nhập hàng (${formatShortAmount(
                        activeMetrics.totalImport
                      )}). Hoạt động kinh doanh đang có lãi.`
                    : `Tiền nhập thịt từ các lò (${formatShortAmount(
                        activeMetrics.totalImport
                      )}) đang cao hơn tổng doanh số bán ra cho khách (${formatShortAmount(
                        activeMetrics.totalSales
                      )}). Cần kiểm tra tồn kho đông lạnh hoặc hao hụt pha lóc.`}
                </Text>
              </View>

              {/* KHỐI 4 CHỈ SỐ CỐT LÕI (LƯỚI 2x2 CÂN ĐỐI, GỌN GÀNG, DỄ NHÌN) */}
              <View style={styles.metricsGridContainer}>
                {/* HÀNG 1: DOANH SỐ BÁN RA vs TỔNG TIỀN VỐN NHẬP (2 Ô TRÊN ĐỐI XỨNG) */}
                <View style={styles.metricsRow}>
                  {/* Ô 1: Tiền bán */}
                  <View style={[styles.metricsCol, styles.metricsColLeft]}>
                    <View style={[styles.metricCard, { borderLeftColor: '#3B82F6' }]}>
                      <Text style={styles.metricLabel} numberOfLines={1}>🥩 TIỀN BÁN (DOANH SỐ)</Text>
                      <Text
                        style={[styles.metricValue, { color: '#1D4ED8' }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit={true}
                      >
                        {formatCurrency(activeMetrics.totalSales)}
                      </Text>
                    </View>
                  </View>

                  {/* Ô 2: Tiền nhập lò */}
                  <View style={[styles.metricsCol, styles.metricsColRight]}>
                    <View style={[styles.metricCard, { borderLeftColor: '#F59E0B' }]}>
                      <Text style={styles.metricLabel} numberOfLines={1}>📦 TIỀN NHẬP LÒ (VỐN)</Text>
                      <Text
                        style={[styles.metricValue, { color: '#B45309' }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit={true}
                      >
                        {formatCurrency(activeMetrics.totalImport)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* HÀNG 2: THỰC THU TỪ KHÁCH vs THỰC TRẢ CHO LÒ (2 Ô DƯỚI ĐỐI XỨNG) */}
                <View style={[styles.metricsRow, { marginTop: 10 }]}>
                  {/* Ô 3: Khách đã trả */}
                  <View style={[styles.metricsCol, styles.metricsColLeft]}>
                    <View style={[styles.metricCard, { borderLeftColor: '#10B981' }]}>
                      <Text style={styles.metricLabel} numberOfLines={1}>💵 KHÁCH ĐÃ TRẢ (THU)</Text>
                      <Text
                        style={[styles.metricValue, { color: '#047857' }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit={true}
                      >
                        {formatCurrency(activeMetrics.totalCollected)}
                      </Text>
                    </View>
                  </View>

                  {/* Ô 4: Đã trả lò */}
                  <View style={[styles.metricsCol, styles.metricsColRight]}>
                    <View style={[styles.metricCard, { borderLeftColor: '#8B5CF6' }]}>
                      <Text style={styles.metricLabel} numberOfLines={1}>💸 ĐÃ TRẢ LÒ (CHI)</Text>
                      <Text
                        style={[styles.metricValue, { color: '#6D28D9' }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit={true}
                      >
                        {formatCurrency(activeMetrics.totalPaid)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* KHỐI BẢNG CHI TIẾT TIỀN NHẬP THEO TỪNG LÒ (TÁCH RIÊNG TRỰC QUAN & DỄ THEO DÕI) */}
              {activeSuppliersList.length > 0 && (
                <View style={styles.suppliersSummaryCard}>
                  <View style={styles.suppliersSummaryHeader}>
                    <View style={styles.suppliersSummaryTitleWrap}>
                      <Text style={styles.suppliersSummaryIcon}>🏭</Text>
                      <Text style={styles.suppliersSummaryTitle}>
                        CHI TIẾT TIỀN NHẬP THEO TỪNG LÒ
                      </Text>
                    </View>
                    <View style={styles.suppliersSummaryBadge}>
                      <Text style={styles.suppliersSummaryBadgeText}>
                        {activeSuppliersList.length} lò phát sinh
                      </Text>
                    </View>
                  </View>

                  {/* Bảng mini danh sách các lò */}
                  <View style={styles.suppliersSummaryTable}>
                    {activeSuppliersList.map((s, idx) => {
                      const percent =
                        activeMetrics.totalImport > 0
                          ? ((parseFloat(s.importAmount || 0) / activeMetrics.totalImport) * 100).toFixed(1)
                          : '0';
                      return (
                        <View
                          key={s.id || idx}
                          style={[
                            styles.suppliersSummaryRow,
                            idx % 2 === 1 && styles.suppliersSummaryRowAlt,
                            idx === activeSuppliersList.length - 1 && { borderBottomWidth: 0 },
                          ]}
                        >
                          <View style={styles.suppliersSummaryColName}>
                            <View style={styles.suppliersSummaryDot} />
                            <Text style={styles.suppliersSummaryNameText} numberOfLines={1}>
                              {s.name}
                            </Text>
                          </View>

                          <View style={styles.suppliersSummaryColPercent}>
                            <Text style={styles.suppliersSummaryPercentText}>
                              {percent}%
                            </Text>
                          </View>

                          <Text style={styles.suppliersSummaryAmountText}>
                            {formatCurrency(s.importAmount)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}



              {/* CHI TIẾT THEO NGÀY TRONG THÁNG (CÓ NÚT BẬT/TẮT) */}
              {reportData.dailyBreakdown && reportData.dailyBreakdown.length > 0 && (
                <View style={styles.collapsibleCard}>
                  <TouchableOpacity
                    style={styles.collapsibleHeader}
                    onPress={() => setShowDailyBreakdown((prev) => !prev)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.collapsibleTitleRow}>
                      <Text style={styles.collapsibleIcon}>📅</Text>
                      <Text style={styles.collapsibleTitle}>
                        BẢNG ĐỐI SOÁT TỪNG NGÀY ({reportData.dailyBreakdown.length} ngày)
                      </Text>
                    </View>
                    <Text style={styles.chevronIcon}>
                      {showDailyBreakdown ? '▲ Thu gọn' : '▼ Xem chi tiết'}
                    </Text>
                  </TouchableOpacity>

                  {showDailyBreakdown && (
                    <View style={styles.tableContainer}>
                      {/* Tiêu đề bảng */}
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.tableHeaderCell, { width: 50 }]}>Ngày</Text>
                        <Text style={[styles.tableHeaderCell, { flex: 0.9, textAlign: 'right' }]}>
                          Bán ra
                        </Text>
                        <Text style={[styles.tableHeaderCell, { flex: 1.35, textAlign: 'right' }]}>
                          Nhập lò
                        </Text>
                        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>
                          Chênh lệch
                        </Text>
                      </View>

                      {/* Các dòng ngày */}
                      {reportData.dailyBreakdown.map((row, idx) => {
                        const importVal = row.importAll;
                        const diffVal = row.diffAll;
                        const isProf = diffVal >= 0;

                        return (
                          <View
                            key={row.day}
                            style={[
                              styles.tableRow,
                              idx % 2 === 1 && styles.tableRowAlt,
                              !isProf && styles.tableRowLossBg,
                            ]}
                          >
                            <Text style={[styles.tableCell, { width: 50, fontWeight: 'bold' }]}>
                              {row.dateDisplay}
                            </Text>
                            <Text style={[styles.tableCell, { flex: 0.9, textAlign: 'right', color: '#1E293B' }]}>
                              {formatShortAmount(row.sales)}
                            </Text>
                            <View style={{ flex: 1.35, alignItems: 'flex-end', justifyContent: 'center' }}>
                              <Text style={[styles.tableCell, { textAlign: 'right', color: '#B45309', fontWeight: 'bold' }]}>
                                {formatShortAmount(importVal)}
                              </Text>
                              {row.suppliers && row.suppliers.length > 0 && (
                                <View style={styles.suppliersDailyList}>
                                  {row.suppliers.map((s, sIdx) => (
                                    <Text key={s.supplierId || sIdx} style={styles.supplierDailyItemText} numberOfLines={1}>
                                      <Text style={styles.supplierDailyName}>{s.supplierName}: </Text>
                                      <Text style={styles.supplierDailyAmount}>{formatShortAmount(s.amount)}</Text>
                                    </Text>
                                  ))}
                                </View>
                              )}
                            </View>
                            <View style={{ flex: 1, alignItems: 'flex-end' }}>
                              <View
                                style={[
                                  styles.dayBadge,
                                  isProf ? styles.dayBadgeProfit : styles.dayBadgeLoss,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.dayBadgeText,
                                    isProf ? styles.textProfit : styles.textLoss,
                                  ]}
                                >
                                  {isProf ? '+' : ''}
                                  {formatShortAmount(diffVal)}
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* CHI TIẾT TỪNG NHÀ CUNG CẤP (CÓ NÚT BẬT/TẮT) */}
              {reportData.suppliersBreakdown && reportData.suppliersBreakdown.length > 0 && (
                <View style={styles.collapsibleCard}>
                  <TouchableOpacity
                    style={styles.collapsibleHeader}
                    onPress={() => setShowSupplierBreakdown((prev) => !prev)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.collapsibleTitleRow}>
                      <Text style={styles.collapsibleIcon}>🏭</Text>
                      <Text style={styles.collapsibleTitle}>
                        TỶ TRỌNG NHẬP CÁC LÒ ({reportData.suppliersBreakdown.length} lò)
                      </Text>
                    </View>
                    <Text style={styles.chevronIcon}>
                      {showSupplierBreakdown ? '▲ Thu gọn' : '▼ Xem chi tiết'}
                    </Text>
                  </TouchableOpacity>

                  {showSupplierBreakdown && (
                    <View style={styles.tableContainer}>
                      {reportData.suppliersBreakdown.map((s, idx) => (
                          <View key={s.id} style={styles.supplierItemRow}>
                            <View style={styles.supItemHeader}>
                              <Text style={styles.supNameText}>
                                {idx + 1}. {s.name}
                              </Text>
                              <Text style={styles.supPercentBadge}>
                                {s.percentOfImport}% tổng nhập
                              </Text>
                            </View>

                            <View style={styles.supItemDetailsRow}>
                              <Text style={styles.supDetailItem}>
                                Nhập: <Text style={{ fontWeight: 'bold' }}>{formatCurrency(s.importAmount)}</Text>
                              </Text>
                              <Text style={styles.supDetailItem}>
                                Đã trả: <Text style={{ color: '#047857', fontWeight: 'bold' }}>{formatCurrency(s.paidAmount)}</Text>
                              </Text>
                              <Text style={styles.supDetailItem}>
                                Nợ lò:{' '}
                                <Text
                                  style={{
                                    color: s.remainingDebt > 0 ? '#DC2626' : '#64748B',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  {formatCurrency(s.remainingDebt)}
                                </Text>
                              </Text>
                            </View>
                          </View>
                        ))}
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* FOOTER ĐÁY MODAL */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.closeFooterBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.closeFooterBtnText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default ProfitManagementModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '94%',
    height: '92%',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#64748B',
  },
  scrollContent: {
    paddingVertical: 14,
    paddingBottom: 24,
  },

  // Filter Card
  filterCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  filterSectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  timeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  shiftBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  shiftBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  selectWrapper: {
    flex: 1,
  },
  timeModeTabs: {
    flexDirection: 'row',
    marginBottom: 10,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
  },
  timeModeTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  timeModeTabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.small,
  },
  timeModeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  timeModeTabTextActive: {
    color: '#0284C7',
    fontWeight: 'bold',
  },
  shiftBtnDisabled: {
    opacity: 0.4,
    backgroundColor: '#F1F5F9',
  },
  shiftBtnTextDisabled: {
    color: '#94A3B8',
  },

  // Hero Card
  heroCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  heroCardProfit: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  heroCardLoss: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroStatusIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  heroStatusTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  percentBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  percentBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  heroAmountText: {
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  heroExplainingText: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
    marginTop: 4,
  },

  // Lưới 4 ô chỉ số tài chính (2 hàng x 2 cột đối xứng)
  metricsGridContainer: {
    marginBottom: 12,
  },
  metricsRow: {
    flexDirection: 'row',
  },
  metricsCol: {
    flex: 1,
  },
  metricsColLeft: {
    paddingRight: 5,
  },
  metricsColRight: {
    paddingLeft: 5,
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  metricLabel: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#64748B',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: -0.3,
  },

  // Card chi tiết tiền nhập theo từng lò (bảng riêng biệt, rõ ràng, dễ nhìn)
  suppliersSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFDF7',
    marginBottom: 12,
    ...SHADOWS.small,
  },
  suppliersSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FEF3C7',
    marginBottom: 6,
  },
  suppliersSummaryTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  suppliersSummaryIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  suppliersSummaryTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#92400E',
    letterSpacing: 0.2,
  },
  suppliersSummaryBadge: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  suppliersSummaryBadgeText: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#B45309',
  },
  suppliersSummaryTable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  suppliersSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FEF3C7',
  },
  suppliersSummaryRowAlt: {
    backgroundColor: '#FFFBEB',
  },
  suppliersSummaryColName: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  suppliersSummaryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
    marginRight: 6,
  },
  suppliersSummaryNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#78350F',
  },
  suppliersSummaryColPercent: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginRight: 8,
  },
  suppliersSummaryPercentText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#B45309',
  },
  suppliersSummaryAmountText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#B45309',
  },

  // Summary Card
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    ...SHADOWS.small,
  },
  summaryCardTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  summaryRowHighlight: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 6,
    paddingTop: 8,
  },
  summaryRowLabel: {
    fontSize: 12.5,
    color: '#475569',
  },
  summaryRowValue: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  summaryRowLabelBold: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  summaryRowValueBold: {
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Collapsible Card
  collapsibleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  collapsibleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  collapsibleIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  collapsibleTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  chevronIcon: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: 'bold',
  },

  // Table
  tableContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowAlt: {
    backgroundColor: '#FAFAFA',
  },
  tableRowLossBg: {
    backgroundColor: '#FFF5F5',
  },
  tableCell: {
    fontSize: 12,
  },
  dayBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  dayBadgeProfit: {
    backgroundColor: '#DCFCE7',
  },
  dayBadgeLoss: {
    backgroundColor: '#FEE2E2',
  },
  dayBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  textProfit: {
    color: '#047857',
  },
  textLoss: {
    color: '#DC2626',
  },
  suppliersDailyList: {
    marginTop: 2,
    alignItems: 'flex-end',
  },
  supplierDailyItemText: {
    fontSize: 10.5,
    marginTop: 1,
    textAlign: 'right',
  },
  supplierDailyName: {
    color: '#64748B',
    fontWeight: '500',
  },
  supplierDailyAmount: {
    color: '#92400E',
    fontWeight: '700',
  },

  // Suppliers breakdown
  supplierItemRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  supItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  supNameText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  supPercentBadge: {
    fontSize: 11,
    color: '#0284C7',
    backgroundColor: '#E0F2FE',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    fontWeight: '600',
  },
  supItemDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  supDetailItem: {
    fontSize: 11.5,
    color: '#475569',
  },

  // Loading & Error
  loadingBox: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 13,
    color: '#B91C1C',
  },

  // Footer
  footer: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  closeFooterBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
