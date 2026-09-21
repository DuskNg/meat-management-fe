// meat-management-fe/src/components/ExportChainDebtModal.js
import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { SHADOWS } from '../theme';

// Hàm định dạng tiền tệ VNĐ
const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
};

/**
 * Modal Xuất Công Nợ Dạng Chuỗi Cửa Hàng:
 * Cung cấp 2 lựa chọn xuất bảng kê:
 * 1. Xuất tất cả nhà hàng (Toàn bộ chuỗi gộp chung)
 * 2. Xuất từng nhà hàng (Chọn cơ sở cụ thể để xuất riêng)
 */
const ExportChainDebtModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState('options'); // 'options' | 'select_branch'
  const [branches, setBranches] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [onExportAllCallback, setOnExportAllCallback] = useState(null);
  const [onExportBranchCallback, setOnExportBranchCallback] = useState(null);
  const [currentBranchId, setCurrentBranchId] = useState(null);

  // Mở modal và nhận dữ liệu các cơ sở cùng hàm callback xuất
  useImperativeHandle(ref, () => ({
    open: (opts = {}) => {
      setBranches(opts.branches || []);
      setCurrentBranchId(opts.currentCustomerId || null);
      setOnExportAllCallback(() => opts.onExportAll);
      setOnExportBranchCallback(() => opts.onExportBranch);
      setStep('options');
      setSearchQuery('');
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  const handleClose = () => {
    setVisible(false);
  };

  // Xử lý chọn xuất tất cả các quán
  const handleSelectExportAll = () => {
    setVisible(false);
    if (onExportAllCallback) {
      setTimeout(() => {
        onExportAllCallback();
      }, 100);
    }
  };

  // Xử lý khi người dùng chọn một quán cụ thể để xuất
  const handleSelectBranch = (branch) => {
    setVisible(false);
    if (onExportBranchCallback) {
      setTimeout(() => {
        onExportBranchCallback(branch);
      }, 100);
    }
  };

  // Lọc danh sách quán theo từ khóa tìm kiếm
  const filteredBranches = useMemo(() => {
    if (!searchQuery.trim()) return branches;
    const q = searchQuery.toLowerCase().trim();
    return branches.filter((b) => (b.name || '').toLowerCase().includes(q));
  }, [branches, searchQuery]);

  return (
    <SmoothModal visible={visible} onClose={handleClose}>
      <View style={styles.modalView}>
        {/* Header Modal chuẩn Bottom-Sheet */}
        <View style={styles.modalHeaderRow}>
          <View style={styles.headerLeftCol}>
            <Text style={styles.modalTitle}>
              {step === 'options' ? '📊 XUẤT CÔNG NỢ BẢNG KÊ' : '📍 CHỌN NHÀ HÀNG CẦN XUẤT'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {step === 'options'
                ? 'Chọn hình thức xuất ảnh bảng kê công nợ phù hợp'
                : `Có ${branches.length} cơ sở trong chuỗi cửa hàng`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Nội dung chính cuộn mượt */}
        <ScrollView
          style={styles.bodyScrollView}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {step === 'options' ? (
            /* Bước 1: 2 Lựa chọn chính (Tất cả nhà hàng vs Từng nhà hàng) */
            <View style={styles.optionsContainer}>
              {/* Option 1: Xuất tất cả nhà hàng */}
              <TouchableOpacity
                style={[styles.optionCard, styles.optionCardAll]}
                onPress={handleSelectExportAll}
                activeOpacity={0.75}
              >
                <View style={[styles.optionIconCircle, styles.optionIconCircleAll]}>
                  <Text style={styles.optionIconText}>🏢</Text>
                </View>
                <View style={styles.optionTextCol}>
                  <View style={styles.optionTitleRow}>
                    <Text style={[styles.optionTitle, styles.optionTitleAll]}>
                      Xuất tất cả nhà hàng
                    </Text>
                    <View style={styles.countBadgeAll}>
                      <Text style={styles.countBadgeTextAll}>{branches.length} quán</Text>
                    </View>
                  </View>
                  <Text style={styles.optionDesc}>
                    Bảng kê tổng hợp toàn bộ các cơ sở trong chuỗi theo khoảng thời gian đã lọc.
                  </Text>
                </View>
                <View style={styles.optionActionWrap}>
                  <Text style={styles.optionActionArrow}>➔</Text>
                </View>
              </TouchableOpacity>

              {/* Option 2: Xuất từng nhà hàng */}
              <TouchableOpacity
                style={[styles.optionCard, styles.optionCardBranch]}
                onPress={() => setStep('select_branch')}
                activeOpacity={0.75}
              >
                <View style={[styles.optionIconCircle, styles.optionIconCircleBranch]}>
                  <Text style={styles.optionIconText}>📍</Text>
                </View>
                <View style={styles.optionTextCol}>
                  <View style={styles.optionTitleRow}>
                    <Text style={[styles.optionTitle, styles.optionTitleBranch]}>
                      Xuất riêng từng nhà hàng
                    </Text>
                  </View>
                  <Text style={styles.optionDesc}>
                    Chọn một cơ sở cụ thể để xuất ảnh bảng kê chi tiết riêng biệt cho cơ sở đó.
                  </Text>
                </View>
                <View style={styles.optionActionWrap}>
                  <Text style={styles.optionActionArrow}>➔</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            /* Bước 2: Danh sách chọn nhà hàng cụ thể */
            <View style={styles.branchSelectContainer}>
              {/* Nút quay lại bước chọn hình thức */}
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setStep('options')}
                activeOpacity={0.7}
              >
                <Text style={styles.backButtonText}>← Quay lại chọn hình thức</Text>
              </TouchableOpacity>

              {/* Ô tìm kiếm nhanh nhà hàng */}
              {branches.length > 4 && (
                <View style={styles.searchBarWrap}>
                  <Text style={styles.searchBarIcon}>🔍</Text>
                  <TextInput
                    style={styles.searchBarInput}
                    placeholder="Tìm kiếm tên quán..."
                    placeholderTextColor="#94A3B8"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    clearButtonMode="while-editing"
                  />
                  {searchQuery ? (
                    <TouchableOpacity
                      style={styles.clearSearchBtn}
                      onPress={() => setSearchQuery('')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.clearSearchText}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}

              {/* Danh sách các thẻ nhà hàng */}
              <View style={styles.branchListWrap}>
                {filteredBranches.length === 0 ? (
                  <View style={styles.emptyBranchWrap}>
                    <Text style={styles.emptyBranchText}>
                      Không tìm thấy nhà hàng nào phù hợp với &quot;{searchQuery}&quot;
                    </Text>
                  </View>
                ) : (
                  filteredBranches.map((branch, index) => {
                    const isSelected = branch.id === currentBranchId;
                    return (
                      <TouchableOpacity
                        key={branch.id || index}
                        style={[
                          styles.branchItemCard,
                          isSelected && styles.branchItemCardActive,
                        ]}
                        onPress={() => handleSelectBranch(branch)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.branchItemLeft}>
                          <View style={styles.branchIconWrap}>
                            <Text style={styles.branchIconText}>📍</Text>
                          </View>
                          <View style={styles.branchInfoCol}>
                            <View style={styles.branchNameRow}>
                              <Text style={styles.branchNameText} numberOfLines={1}>
                                {branch.name}
                              </Text>
                              {isSelected && (
                                <View style={styles.currentBadge}>
                                  <Text style={styles.currentBadgeText}>Đang xem</Text>
                                </View>
                              )}
                            </View>
                            {branch.debt !== undefined && branch.debt !== null ? (
                              <Text style={styles.branchDebtText}>
                                Nợ hiện tại: <Text style={styles.branchDebtVal}>{formatCurrency(branch.debt)}</Text>
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <View style={styles.exportActionBtn}>
                          <Text style={styles.exportActionBtnText}>Xuất ảnh ➔</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer chân modal neo đáy: Nút Đóng Lại chuẩn */}
        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={styles.closeFooterBtn}
            onPress={handleClose}
            activeOpacity={0.8}
          >
            <Text style={styles.closeFooterBtnText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

ExportChainDebtModal.displayName = 'ExportChainDebtModal';

export default ExportChainDebtModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    width: '100%',
    ...Platform.select({
      web: {
        maxWidth: 580,
        marginHorizontal: 'auto',
      },
    }),
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeftCol: {
    flex: 1,
    paddingRight: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
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
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
  bodyScrollView: {
    marginTop: 12,
    maxHeight: 460,
  },
  bodyContent: {
    paddingBottom: 12,
  },
  optionsContainer: {
    gap: 12,
    paddingTop: 4,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      },
    }),
  },
  optionCardAll: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  optionCardBranch: {
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FAFC',
  },
  optionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionIconCircleAll: {
    backgroundColor: '#DCFCE7',
  },
  optionIconCircleBranch: {
    backgroundColor: '#EFF6FF',
  },
  optionIconText: {
    fontSize: 22,
  },
  optionTextCol: {
    flex: 1,
    paddingRight: 8,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  optionTitleAll: {
    color: '#065F46',
  },
  optionTitleBranch: {
    color: '#1E40AF',
  },
  countBadgeAll: {
    backgroundColor: '#059669',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  countBadgeTextAll: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  optionDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  optionActionWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  optionActionArrow: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: 'bold',
  },

  // Giao diện chọn chi nhánh
  branchSelectContainer: {
    paddingTop: 2,
  },
  backButton: {
    paddingVertical: 6,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#2563EB',
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 10,
  },
  searchBarIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  searchBarInput: {
    flex: 1,
    height: 38,
    fontSize: 13,
    color: '#0F172A',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      },
    }),
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  branchListWrap: {
    gap: 8,
  },
  branchItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  branchItemCardActive: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  branchItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  branchIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  branchIconText: {
    fontSize: 15,
  },
  branchInfoCol: {
    flex: 1,
  },
  branchNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  branchNameText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  currentBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
  },
  branchDebtText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  branchDebtVal: {
    fontWeight: '700',
    color: '#DC2626',
  },
  exportActionBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  exportActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  emptyBranchWrap: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBranchText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },

  // Footer
  modalFooter: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  closeFooterBtn: {
    height: 46,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
    letterSpacing: 0.3,
  },
});
