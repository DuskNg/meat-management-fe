// meat-management-fe/src/components/SupplierHistoryModal.js
import React, { useState, forwardRef, useImperativeHandle, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';
import CustomSelect from './CustomSelect';
import ExportSupplierHistoryModal from './ExportSupplierHistoryModal';

// Modal xem lịch sử dòng công nợ của nhà cung cấp
const SupplierHistoryModal = forwardRef(({ supplier }, ref) => {
  const [visible, setVisible] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState(supplier);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectContainerZIndex, setSelectContainerZIndex] = useState(10);
  const activeSupplierIdRef = useRef(null);
  const exportSupplierHistoryModalRef = useRef(null);

  // Đồng bộ nhà cung cấp khi prop supplier thay đổi
  useEffect(() => {
    if (supplier) {
      setCurrentSupplier(supplier);
    }
  }, [supplier]);

  useImperativeHandle(ref, () => ({
    open: (targetSupplier) => {
      // Ưu tiên targetSupplier được truyền trực tiếp khi mở modal để tránh stale state
      const activeSup = targetSupplier || supplier || currentSupplier;
      if (activeSup) {
        setCurrentSupplier(activeSup);
      }
      // Dọn dẹp dữ liệu cũ và chuẩn bị tải dữ liệu mới
      setHistory([]);
      setError('');
      setSelectedMonth('ALL');
      setVisible(true);

      if (activeSup?.id) {
        fetchHistory(activeSup.id);
      }
    },
    close: () => {
      setVisible(false);
    },
    refresh: () => {
      const activeId = currentSupplier?.id || supplier?.id;
      if (activeId) {
        fetchHistory(activeId);
      }
    },
  }));

  const fetchHistory = async (supplierId) => {
    const id = supplierId || currentSupplier?.id || supplier?.id;
    if (!id) {
      setLoading(false);
      return;
    }

    activeSupplierIdRef.current = id;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/suppliers/${id}/history`);
      // Đảm bảo chỉ cập nhật state nếu kết quả trả về đúng với nhà cung cấp đang được chọn
      if (activeSupplierIdRef.current === id) {
        if (response.data?.success) {
          setHistory(response.data.data || []);
        } else {
          setError(response.data?.message || 'Không thể tải lịch sử giao dịch.');
        }
      }
    } catch (err) {
      if (activeSupplierIdRef.current === id) {
        setError(err.response?.data?.message || 'Có lỗi khi kết nối máy chủ.');
      }
    } finally {
      if (activeSupplierIdRef.current === id) {
        setLoading(false);
      }
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  // Trích xuất danh sách các tháng có dữ liệu giao dịch
  const availableMonths = useMemo(() => {
    const set = new Set();
    history.forEach((item) => {
      if (item.date) {
        const d = new Date(item.date);
        if (!isNaN(d.getTime())) {
          const mStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
          set.add(mStr);
        }
      }
    });

    return Array.from(set).sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      return yB !== yA ? yB - yA : mB - mA;
    });
  }, [history]);

  // Tạo options cho CustomSelect
  const monthOptions = useMemo(() => [
    { id: 'ALL', name: 'Toàn bộ thời gian' },
    ...availableMonths.map((m) => ({ id: m, name: `Tháng ${m}` }))
  ], [availableMonths]);

  // Lọc danh sách giao dịch theo tháng đã chọn
  const filteredHistory = useMemo(() => {
    if (!selectedMonth || selectedMonth === 'ALL') return history;
    return history.filter((item) => {
      if (!item.date) return false;
      const d = new Date(item.date);
      if (isNaN(d.getTime())) return false;
      const mStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
      return mStr === selectedMonth;
    });
  }, [history, selectedMonth]);

  // Tính tổng nợ nhập hàng, tổng tiền đã trả và chênh lệch cho danh sách đã lọc
  const { totalDebt, totalPayment, balance } = useMemo(() => {
    let debt = 0;
    let payment = 0;
    filteredHistory.forEach((it) => {
      const amt = parseFloat(it.amount || 0);
      if (it.type === 'DEBT') {
        debt += amt;
      } else {
        payment += amt;
      }
    });
    return {
      totalDebt: debt,
      totalPayment: payment,
      balance: debt - payment,
    };
  }, [filteredHistory]);

  const selectedMonthOption = monthOptions.find((opt) => opt.id === selectedMonth) || monthOptions[0];

  const renderHistoryItem = ({ item }) => {
    const isDebt = item.type === 'DEBT';
    return (
      <View style={styles.historyCard}>
        <View style={styles.cardLeft}>
          <View style={[styles.typeBadge, isDebt ? styles.badgeDebt : styles.badgePayment]}>
            <Text style={[styles.typeText, isDebt ? styles.textDebt : styles.textPayment]}>
              {isDebt ? '📥 Nhập nợ' : '💵 Trả tiền'}
            </Text>
          </View>
          <Text style={styles.dateText}>{formatDate(item.date)}</Text>
        </View>

        <View style={styles.cardRight}>
          <Text style={[styles.amountText, isDebt ? styles.amountDebt : styles.amountPayment]}>
            {isDebt ? '+' : '-'}{formatCurrency(item.amount)}
          </Text>
          {item.note ? <Text style={styles.noteText} numberOfLines={2}>{item.note}</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>👁️ LỊCH SỬ GIAO DỊCH</Text>
        <Text style={styles.supplierName}>
          Nhà cung cấp: {currentSupplier?.name || supplier?.name || ''}
        </Text>

        {/* Thanh lọc tháng và nút xuất ảnh */}
        <View style={[styles.filterBar, { zIndex: selectContainerZIndex }]}>
          <View style={styles.selectWrapper}>
            <CustomSelect
              options={monthOptions}
              value={selectedMonthOption}
              placeholder="Lọc theo tháng..."
              onSelect={(item) => setSelectedMonth(item.id)}
              renderSelected={(m) => m?.name || ''}
              zIndex={999999}
              onOpenChange={(isOpen) => setSelectContainerZIndex(isOpen ? 999999 : 10)}
            />
          </View>

          <TouchableOpacity
            style={styles.exportBtn}
            onPress={() => {
              const now = new Date();
              const currentMonthStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
              const targetMonth = selectedMonth === 'ALL'
                ? (availableMonths[0] || currentMonthStr)
                : selectedMonth;
              exportSupplierHistoryModalRef.current?.open(currentSupplier || supplier, targetMonth, history);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.exportBtnText}>🖼️ Xuất ảnh</Text>
          </TouchableOpacity>
        </View>

        {/* Thanh thống kê nhanh theo tháng đang lọc */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Tiền hàng nhập (+)</Text>
            <Text style={styles.summaryValueDebt}>+{formatCurrency(totalDebt)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Đã trả (-)</Text>
            <Text style={styles.summaryValuePayment}>-{formatCurrency(totalPayment)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Chênh lệch</Text>
            <Text style={[
              styles.summaryValueBalance,
              balance > 0 ? styles.textDebt : (balance < 0 ? styles.textPayment : styles.textNeutral)
            ]}>
              {balance > 0 ? '+' : ''}{formatCurrency(balance)}
            </Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 40 }} />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => fetchHistory(currentSupplier?.id || supplier?.id)}
            >
              <Text style={styles.retryText}>Thử lại 🔄</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredHistory}
            renderItem={renderHistoryItem}
            keyExtractor={(item) => `${item.type || 'tx'}-${item.id}`}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {selectedMonth === 'ALL'
                    ? 'Chưa có giao dịch nhập hàng hay trả tiền nào được ghi nhận.'
                    : `Không có giao dịch nào trong Tháng ${selectedMonth}.`}
                </Text>
              </View>
            }
          />
        )}

        <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)}>
          <Text style={styles.closeButtonText}>ĐÓNG LẠI</Text>
        </TouchableOpacity>
      </View>

      {/* Modal xuất báo cáo lịch sử dạng ảnh */}
      <ExportSupplierHistoryModal ref={exportSupplierHistoryModalRef} />
    </SmoothModal>
  );
});

export default SupplierHistoryModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  supplierName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    position: 'relative',
  },
  selectWrapper: {
    flex: 1,
  },
  exportBtn: {
    backgroundColor: '#0284C7',
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-between',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 3,
  },
  summaryValueDebt: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  summaryValuePayment: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#16A34A',
  },
  summaryValueBalance: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 2,
  },
  textNeutral: {
    color: COLORS.text,
  },
  listContent: {
    paddingBottom: 20,
  },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
  },
  typeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeDebt: {
    backgroundColor: '#FFE2E2',
  },
  badgePayment: {
    backgroundColor: '#E8F5E9',
  },
  typeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  textDebt: {
    color: '#D32F2F',
  },
  textPayment: {
    color: '#388E3C',
  },
  dateText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  cardRight: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 10,
  },
  amountText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  amountDebt: {
    color: '#D32F2F', // Màu đỏ cho nợ tăng thêm
  },
  amountPayment: {
    color: '#388E3C', // Màu xanh cho khoản đã trả giảm nợ
  },
  noteText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'right',
  },
  errorContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.inputBg,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  retryText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 20,
  },
  closeButton: {
    backgroundColor: COLORS.inputBg,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
