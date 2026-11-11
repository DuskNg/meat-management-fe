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
 * Modal Xuất Công Nợ Bảng Kê (Dùng chung cho cả Chuỗi cửa hàng & Nhà hàng đơn lẻ trên Portal):
 * Cung cấp các lựa chọn xuất bảng kê:
 * - Xuất Ảnh (PNG) hoặc Xuất File Excel (.csv chuẩn UTF-8 BOM)
 * - Với chuỗi cửa hàng: Xuất tất cả nhà hàng hoặc Chọn riêng từng nhà hàng để xuất Ảnh / Excel
 */
const ExportChainDebtModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState('options'); // 'options' | 'select_branch'
  const [isChain, setIsChain] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [rangeLabel, setRangeLabel] = useState('');
  const [branches, setBranches] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [onExportAllCallback, setOnExportAllCallback] = useState(null);
  const [onExportBranchCallback, setOnExportBranchCallback] = useState(null);
  const [onExportExcelAllCallback, setOnExportExcelAllCallback] = useState(null);
  const [onExportExcelBranchCallback, setOnExportExcelBranchCallback] = useState(null);
  const [onExportSingleImageCallback, setOnExportSingleImageCallback] = useState(null);
  const [onExportSingleExcelCallback, setOnExportSingleExcelCallback] = useState(null);
  const [currentBranchId, setCurrentBranchId] = useState(null);

  // Mở modal và nhận dữ liệu các cơ sở cùng hàm callback xuất Ảnh / Excel
  useImperativeHandle(ref, () => ({
    open: (opts = {}) => {
      const branchList = opts.branches || [];
      const chainMode = opts.isChain !== undefined ? Boolean(opts.isChain) : branchList.length > 1;
      setIsChain(chainMode);
      setCustomerName(opts.customerName || '');
      setRangeLabel(opts.rangeLabel || '');
      setBranches(branchList);
      setCurrentBranchId(opts.currentCustomerId || null);
      setOnExportAllCallback(() => opts.onExportAll);
      setOnExportBranchCallback(() => opts.onExportBranch);
      setOnExportExcelAllCallback(() => opts.onExportExcelAll);
      setOnExportExcelBranchCallback(() => opts.onExportExcelBranch);
      setOnExportSingleImageCallback(() => opts.onExportSingleImage);
      setOnExportSingleExcelCallback(() => opts.onExportSingleExcel);
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

  // Xử lý chọn xuất ảnh tất cả các quán
  const handleSelectExportAll = () => {
    setVisible(false);
    if (onExportAllCallback) {
      setTimeout(() => {
        onExportAllCallback();
      }, 100);
    }
  };

  // Xử lý chọn xuất Excel tất cả các quán
  const handleSelectExportExcelAll = () => {
    setVisible(false);
    if (onExportExcelAllCallback) {
      setTimeout(() => {
        onExportExcelAllCallback();
      }, 100);
    }
  };

  // Xử lý khi người dùng chọn một quán cụ thể để xuất ảnh
  const handleSelectBranch = (branch) => {
    setVisible(false);
    if (onExportBranchCallback) {
      setTimeout(() => {
        onExportBranchCallback(branch);
      }, 100);
    }
  };

  // Xử lý khi người dùng chọn một quán cụ thể để xuất Excel
  const handleSelectBranchExcel = (branch) => {
    setVisible(false);
    if (onExportExcelBranchCallback) {
      setTimeout(() => {
        onExportExcelBranchCallback(branch);
      }, 100);
    }
  };

  // Xử lý xuất ảnh cho nhà hàng đơn lẻ (hoặc cơ sở đang lọc)
  const handleSelectSingleImage = () => {
    setVisible(false);
    if (onExportSingleImageCallback) {
      setTimeout(() => {
        onExportSingleImageCallback();
      }, 100);
    }
  };

  // Xử lý xuất Excel cho nhà hàng đơn lẻ (hoặc cơ sở đang lọc)
  const handleSelectSingleExcel = () => {
    setVisible(false);
    if (onExportSingleExcelCallback) {
      setTimeout(() => {
        onExportSingleExcelCallback();
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
                ? (isChain
                    ? 'Chọn hình thức xuất Ảnh hoặc File Excel công nợ phù hợp'
                    : `${customerName ? `${customerName} ` : ''}${rangeLabel ? `(${rangeLabel})` : ''}`)
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

        {!isChain ? (
          /* Chế độ Nhà hàng đơn lẻ (hoặc cơ sở đang chọn): Chọn Xuất Ảnh hoặc Xuất Excel */
          <ScrollView
            style={styles.bodyScrollView}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.optionsContainer}>
              {/* Option 1: Xuất Ảnh Bảng Kê */}
              <TouchableOpacity
                style={[styles.optionCard, styles.optionCardBranch]}
                onPress={handleSelectSingleImage}
                activeOpacity={0.75}
              >
                <View style={[styles.optionIconCircle, styles.optionIconCircleBranch]}>
                  <Text style={styles.optionIconText}>📸</Text>
                </View>
                <View style={styles.optionTextCol}>
                  <View style={styles.optionTitleRow}>
                    <Text style={[styles.optionTitle, styles.optionTitleBranch]}>
                      Xuất ảnh bảng kê công nợ
                    </Text>
                  </View>
                  <Text style={styles.optionDesc}>
                    Tạo hình ảnh bảng kê sắc nét để xem trực tiếp, tải về máy hoặc chuyển tiếp Zalo.
                  </Text>
                </View>
                <View style={styles.optionActionWrap}>
                  <Text style={styles.optionActionArrow}>➔</Text>
                </View>
              </TouchableOpacity>

              {/* Option 2: Xuất File Excel (.xlsx) */}
              <TouchableOpacity
                style={[styles.optionCard, styles.optionCardAll]}
                onPress={handleSelectSingleExcel}
                activeOpacity={0.75}
              >
                <View style={[styles.optionIconCircle, styles.optionIconCircleAll]}>
                  <Text style={styles.optionIconText}>📥</Text>
                </View>
                <View style={styles.optionTextCol}>
                  <View style={styles.optionTitleRow}>
                    <Text style={[styles.optionTitle, styles.optionTitleAll]}>
                      Xuất file Excel công nợ (.xlsx)
                    </Text>
                  </View>
                  <Text style={styles.optionDesc}>
                    Tải xuống tệp bảng tính Excel chuẩn tiếng Việt có đầy đủ chi tiết từng ngày và tổng kết.
                  </Text>
                </View>
                <View style={styles.optionActionWrap}>
                  <Text style={styles.optionActionArrow}>➔</Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : step === 'options' ? (
          /* Bước 1 (Chuỗi): 3 Lựa chọn chính (Ảnh tất cả | Excel tất cả | Từng nhà hàng) */
          <ScrollView
            style={styles.bodyScrollView}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.optionsContainer}>
              {/* Option 1: Xuất ảnh tất cả nhà hàng */}
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
                      Xuất ảnh tất cả nhà hàng
                    </Text>
                    <View style={styles.countBadgeAll}>
                      <Text style={styles.countBadgeTextAll}>{branches.length} quán</Text>
                    </View>
                  </View>
                  <Text style={styles.optionDesc}>
                    Xuất riêng lẻ từng ảnh bảng kê cho tất cả {branches.length} cơ sở trong chuỗi.
                  </Text>
                </View>
                <View style={styles.optionActionWrap}>
                  <Text style={styles.optionActionArrow}>➔</Text>
                </View>
              </TouchableOpacity>

              {/* Option 2: Xuất File Excel tất cả nhà hàng */}
              <TouchableOpacity
                style={[styles.optionCard, styles.optionCardExcel]}
                onPress={handleSelectExportExcelAll}
                activeOpacity={0.75}
              >
                <View style={[styles.optionIconCircle, styles.optionIconCircleExcel]}>
                  <Text style={styles.optionIconText}>📥</Text>
                </View>
                <View style={styles.optionTextCol}>
                  <View style={styles.optionTitleRow}>
                    <Text style={[styles.optionTitle, styles.optionTitleExcel]}>
                      Xuất file Excel công nợ (.xlsx)
                    </Text>
                    <View style={styles.countBadgeExcel}>
                      <Text style={styles.countBadgeTextAll}>Excel</Text>
                    </View>
                  </View>
                  <Text style={styles.optionDesc}>
                    Tải tệp bảng tính Excel tổng hợp đầy đủ công nợ của toàn bộ chuỗi (hoặc cơ sở đang lọc).
                  </Text>
                </View>
                <View style={styles.optionActionWrap}>
                  <Text style={styles.optionActionArrow}>➔</Text>
                </View>
              </TouchableOpacity>

              {/* Option 3: Xuất từng nhà hàng (Ảnh hoặc Excel) */}
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
                    Chọn một cơ sở cụ thể để xuất Ảnh hoặc File Excel chi tiết riêng cho cơ sở đó.
                  </Text>
                </View>
                <View style={styles.optionActionWrap}>
                  <Text style={styles.optionActionArrow}>➔</Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          /* Bước 2: Danh sách chọn nhà hàng cụ thể (Có nút Xuất ảnh & Xuất Excel trên từng dòng) */
          <View style={styles.branchSelectContainer}>
            {/* PHẦN CỐ ĐỊNH TRÊN ĐỈNH: Nút quay lại & Ô tìm kiếm không bị cuộn */}
            <View style={styles.fixedBranchHeader}>
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
            </View>

            {/* CHỈ CUỘN RIÊNG PHẦN DANH SÁCH CÁC NHÀ HÀNG */}
            <ScrollView
              style={styles.branchListScrollView}
              contentContainerStyle={styles.branchListContent}
              showsVerticalScrollIndicator={false}
            >
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
                    <View
                      key={branch.id || index}
                      style={[
                        styles.branchItemCard,
                        isSelected && styles.branchItemCardActive,
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.branchItemLeft}
                        onPress={() => handleSelectBranch(branch)}
                        activeOpacity={0.75}
                      >
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
                      </TouchableOpacity>

                      <View style={styles.branchActionGroup}>
                        <TouchableOpacity
                          style={styles.exportActionBtn}
                          onPress={() => handleSelectBranch(branch)}
                          activeOpacity={0.75}
                        >
                          <Text style={styles.exportActionBtnText}>📸 Ảnh</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.exportExcelActionBtn}
                          onPress={() => handleSelectBranchExcel(branch)}
                          activeOpacity={0.75}
                        >
                          <Text style={styles.exportExcelActionBtnText}>📥 Excel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}

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
  optionCardExcel: {
    borderColor: '#6EE7B7',
    backgroundColor: '#ECFDF5',
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
  optionIconCircleExcel: {
    backgroundColor: '#D1FAE5',
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
  optionTitleExcel: {
    color: '#047857',
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
  countBadgeExcel: {
    backgroundColor: '#047857',
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
    flexShrink: 1,
  },
  fixedBranchHeader: {
    paddingTop: 2,
    paddingBottom: 2,
  },
  branchListScrollView: {
    maxHeight: 400,
    marginTop: 2,
  },
  branchListContent: {
    paddingBottom: 12,
    gap: 8,
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
  branchActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exportActionBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  exportActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  exportExcelActionBtn: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  exportExcelActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
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
