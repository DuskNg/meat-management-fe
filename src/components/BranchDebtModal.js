// meat-management-fe/src/components/BranchDebtModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { SHADOWS } from '../theme';
import axios from 'axios';

// Hàm format tiền tệ VNĐ
const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
};

const BranchDebtModal = forwardRef(({ token, apiHost, sessionToken }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState([]);
  const [summary, setSummary] = useState({
    monthDebt: 0,
    monthPurchase: 0,
    monthPaid: 0,
    totalDebt: 0,
  });

  // Quản lý tháng được chọn (mặc định tháng hiện tại)
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [onSelectBranchCallback, setOnSelectBranchCallback] = useState(null);

  // Tải dữ liệu công nợ từng cửa hàng theo tháng từ backend
  const fetchMonthDebtData = async (m, y) => {
    if (!token) return;
    try {
      setLoading(true);
      const formattedMonth = `${String(m).padStart(2, '0')}/${y}`;
      const host = apiHost || 'http://127.0.0.1:3000';
      const headers = {};
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const res = await axios.get(`${host}/api/v1/portal/branches-debt/${token}`, {
        params: { month: formattedMonth },
        headers,
      });

      if (res.data?.success && res.data?.data) {
        const data = res.data.data;
        setBranches(data.branches || []);
        if (data.summary) {
          setSummary(data.summary);
        }
      }
    } catch (err) {
      console.warn('Không thể tải chi tiết nợ tháng của các quán:', err);
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (opts = {}) => {
      const curM = now.getMonth() + 1;
      const curY = now.getFullYear();
      setSelectedMonth(curM);
      setSelectedYear(curY);

      if (opts.branches) {
        setBranches(opts.branches);
      }
      if (opts.totalDebt) {
        setSummary((prev) => ({ ...prev, totalDebt: opts.totalDebt }));
      }
      if (opts.onSelectBranch) {
        setOnSelectBranchCallback(() => opts.onSelectBranch);
      } else {
        setOnSelectBranchCallback(null);
      }
      setVisible(true);

      // Tự động gọi API lấy chi tiết nợ tháng
      fetchMonthDebtData(curM, curY);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Xử lý chuyển tháng trước / tháng sau
  const handleShiftMonth = (delta) => {
    let newM = selectedMonth + delta;
    let newY = selectedYear;
    if (newM < 1) {
      newM = 12;
      newY -= 1;
    } else if (newM > 12) {
      newM = 1;
      newY += 1;
    }
    setSelectedMonth(newM);
    setSelectedYear(newY);
    fetchMonthDebtData(newM, newY);
  };

  // Trở về tháng hiện tại
  const handleResetToCurrentMonth = () => {
    const curM = now.getMonth() + 1;
    const curY = now.getFullYear();
    setSelectedMonth(curM);
    setSelectedYear(curY);
    fetchMonthDebtData(curM, curY);
  };

  const handleSelect = (branchId) => {
    if (onSelectBranchCallback) {
      onSelectBranchCallback(branchId);
    }
    setVisible(false);
  };

  const formattedMonthStr = `${String(selectedMonth).padStart(2, '0')}/${selectedYear}`;
  const isCurrentMonth = selectedMonth === (now.getMonth() + 1) && selectedYear === now.getFullYear();

  return (
    <SmoothModal
      visible={visible}
      onClose={() => setVisible(false)}
      centered={Platform.OS === 'web'}
    >
      <View style={styles.modalView}>
        {/* Tiêu đề Header của pop-up */}
        <View style={styles.modalHeaderRow}>
          <View style={styles.modalHeaderLeft}>
            <View style={styles.headerIconCircle}>
              <Text style={styles.headerIcon}>🏢</Text>
            </View>
            <View style={styles.modalHeaderTitleCol}>
              <Text style={styles.modalTitle}>CÔNG NỢ TỪNG CỬA HÀNG</Text>
              <Text style={styles.modalSubTitle}>
                Chi tiết tiền nợ theo tháng & tổng nợ toàn bộ của chuỗi
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.closeHeaderBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeHeaderBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* ─── BỘ LỌC THÁNG (TIỆN LỢI & TRỰC QUAN) ─── */}
        <View style={styles.monthFilterContainer}>
          <View style={styles.monthSelectorRow}>
            <TouchableOpacity
              style={styles.monthArrowBtn}
              onPress={() => handleShiftMonth(-1)}
              activeOpacity={0.7}
            >
              <Text style={styles.monthArrowBtnText}>◀ Tháng trước</Text>
            </TouchableOpacity>

            <View style={styles.currentMonthBadge}>
              <Text style={styles.currentMonthBadgeText}>📅 Tháng {formattedMonthStr}</Text>
            </View>

            <TouchableOpacity
              style={styles.monthArrowBtn}
              onPress={() => handleShiftMonth(1)}
              activeOpacity={0.7}
            >
              <Text style={styles.monthArrowBtnText}>Tháng sau ▶</Text>
            </TouchableOpacity>
          </View>

          {!isCurrentMonth && (
            <TouchableOpacity
              style={styles.resetMonthBtn}
              onPress={handleResetToCurrentMonth}
              activeOpacity={0.7}
            >
              <Text style={styles.resetMonthBtnText}>↺ Về tháng hiện tại</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ─── THẺ TỔNG HỢP NỢ: TỔNG NỢ THÁNG & TỔNG NỢ TOÀN BỘ ─── */}
        <View style={styles.summaryBoxesRow}>
          {/* Cột 1: Tổng nợ của tháng được chọn */}
          <View style={[styles.summaryBox, styles.summaryBoxMonth]}>
            <Text style={styles.summaryBoxLabel}>TỔNG NỢ THÁNG {formattedMonthStr}</Text>
            <Text style={[styles.summaryBoxValue, styles.textRed]}>
              {loading ? '...' : formatCurrency(summary.monthDebt)}
            </Text>
            <Text style={styles.summaryBoxSubText}>
              Mua: {formatCurrency(summary.monthPurchase || 0)}
            </Text>
          </View>

          {/* Cột 2: Tổng nợ toàn bộ lũy kế */}
          <View style={[styles.summaryBox, styles.summaryBoxTotal]}>
            <Text style={styles.summaryBoxLabel}>TỔNG NỢ TOÀN BỘ (LŨY KẾ)</Text>
            <Text style={[styles.summaryBoxValue, styles.textDarkRed]}>
              {loading ? '...' : formatCurrency(summary.totalDebt)}
            </Text>
            <Text style={styles.summaryBoxSubText}>
              Tất cả {branches.length} cửa hàng
            </Text>
          </View>
        </View>

        {/* ─── BẢNG CHI TIẾT TỪNG CỬA HÀNG ─── */}
        <View style={styles.tableCard}>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <Text style={[styles.tableCell, styles.thBranch]}>
              Cơ sở ({branches.length})
            </Text>
            <Text style={[styles.tableCell, styles.thMonthDebt]}>
              Nợ tháng
            </Text>
            <Text style={[styles.tableCell, styles.thTotalDebt]}>
              Tổng nợ
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#DC2626" />
              <Text style={styles.loadingText}>Đang tính toán công nợ tháng {formattedMonthStr}...</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.listScrollView}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {branches.map((b, idx) => (
                <TouchableOpacity
                  key={b.id || idx}
                  style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
                  onPress={() => handleSelect(b.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.thBranch}>
                    <Text style={styles.branchNameText} numberOfLines={2}>
                      {b.name}
                    </Text>
                    {b.phone ? (
                      <Text style={styles.branchPhoneText}>📞 {b.phone}</Text>
                    ) : null}
                  </View>

                  <Text style={[styles.tableCell, styles.thMonthDebt, styles.textRed, styles.textBold]}>
                    {formatCurrency(b.monthDebt != null ? b.monthDebt : b.debt)}
                  </Text>

                  <Text style={[styles.tableCell, styles.thTotalDebt, styles.textDarkRed, styles.textBold]}>
                    {formatCurrency(b.totalDebt != null ? b.totalDebt : b.debt)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Dòng tổng kết ở chân bảng */}
          <View style={styles.totalFooterRow}>
            <Text style={styles.totalFooterLabel}>TỔNG CỘNG:</Text>
            <Text style={[styles.totalFooterMonthDebt, styles.textRed]}>
              {formatCurrency(summary.monthDebt)}
            </Text>
            <Text style={[styles.totalFooterTotalDebt, styles.textDarkRed]}>
              {formatCurrency(summary.totalDebt)}
            </Text>
          </View>
        </View>

        <Text style={styles.hintText}>
          * Bấm vào từng cơ sở để mở nhanh bảng kê chi tiết của riêng cơ sở đó.
        </Text>

        {/* Nút đóng pop-up */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderRadius: Platform.OS === 'web' ? 18 : 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    width: '100%',
    maxWidth: 580,
    maxHeight: '92%',
    alignSelf: 'center',
    flexDirection: 'column',
    ...SHADOWS.large,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 18,
  },
  modalHeaderTitleCol: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  modalSubTitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  closeHeaderBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  closeHeaderBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: 'bold',
  },

  // Bộ lọc tháng
  monthFilterContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  monthSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  monthArrowBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  monthArrowBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  currentMonthBadge: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  currentMonthBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
  resetMonthBtn: {
    marginTop: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  resetMonthBtnText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '600',
  },

  // Hộp tổng kết 2 cột
  summaryBoxesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  summaryBox: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1.5,
  },
  summaryBoxMonth: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  summaryBoxTotal: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  summaryBoxLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#4B5563',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  summaryBoxValue: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  summaryBoxSubText: {
    fontSize: 10.5,
    color: '#6B7280',
    marginTop: 2,
  },

  // Bảng dữ liệu
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tableHeaderRow: {
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1.2,
    borderBottomColor: '#CBD5E1',
    paddingVertical: 8,
  },
  tableCell: {
    fontSize: 12,
    color: '#1E293B',
  },
  thBranch: {
    flex: 2,
    paddingRight: 6,
  },
  thMonthDebt: {
    flex: 1.4,
    textAlign: 'right',
    paddingRight: 6,
  },
  thTotalDebt: {
    flex: 1.5,
    textAlign: 'right',
  },
  branchNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  branchPhoneText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  listScrollView: {
    maxHeight: 280,
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  totalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#FEF2F2',
    borderTopWidth: 1.5,
    borderTopColor: '#FECACA',
  },
  totalFooterLabel: {
    flex: 2,
    fontSize: 12,
    fontWeight: '800',
    color: '#991B1B',
  },
  totalFooterMonthDebt: {
    flex: 1.4,
    textAlign: 'right',
    paddingRight: 6,
    fontSize: 13.5,
    fontWeight: '800',
  },
  totalFooterTotalDebt: {
    flex: 1.5,
    textAlign: 'right',
    fontSize: 13.5,
    fontWeight: '900',
  },

  textRed: {
    color: '#DC2626',
  },
  textDarkRed: {
    color: '#991B1B',
  },
  textBold: {
    fontWeight: '700',
  },
  hintText: {
    fontSize: 10.5,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 6,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default BranchDebtModal;
