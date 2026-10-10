import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { COLORS } from '../theme';
import CustomSelect from './CustomSelect';

/**
 * Component ProductSelector dùng chung cho cả DebtModal, EditDebtModal, ReturnGoodsModal, EditReturnGoodsModal.
 * Tích hợp CustomSelect tiêu chuẩn với Portal hiển thị lớp trên cùng tuyệt đối (zIndex 999999).
 * Phân biệt trực quan, rõ ràng giữa Giá riêng và Giá chung, tự động đưa các món có giá riêng lên đầu danh sách.
 */
const ProductSelector = ({
  products = [],
  currentProduct = null,
  onSelectProduct,
  onClearProduct,
  onAddProduct,
  formatCurrency,
  hasError = false,
  error = '',
}) => {
  // Helper chuẩn hóa định dạng số tiền, loại bỏ hoàn toàn chữ 'đ', '₫' thừa để tránh bị lặp thành 'đđ'
  const formatPriceOnly = (val) => {
    if (val === undefined || val === null || val === '') return '0';
    let formatted = '';
    if (typeof formatCurrency === 'function') {
      formatted = formatCurrency(val);
    } else {
      formatted = Number(val || 0).toLocaleString('vi-VN');
    }
    return String(formatted).replace(/[đ₫]/gi, '').trim();
  };

  // Sắp xếp đưa các món có giá riêng lên đầu, sau đó sắp xếp theo tên A-Z
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      const aCustom = Boolean(a.hasCustomPrice || (a.customPrice !== undefined && a.customPrice !== null));
      const bCustom = Boolean(b.hasCustomPrice || (b.customPrice !== undefined && b.customPrice !== null));
      if (aCustom && !bCustom) return -1;
      if (!aCustom && bCustom) return 1;
      return (a.name || '').localeCompare(b.name || '', 'vi');
    });
  }, [products]);

  return (
    <View style={styles.productsContainer}>
      {/* Hàng chứa ô chọn CustomSelect và các nút thao tác */}
      <View style={styles.selectRow}>
        <View style={styles.selectWrapperCol}>
          <CustomSelect
            value={currentProduct}
            placeholder="🔍 Chọn loại thịt..."
            options={sortedProducts}
            onSelect={(product) => {
              if (onSelectProduct) onSelectProduct(product);
            }}
            getOptionLabel={(p) => (p?.name ? p.name : '')}
            renderSelected={(p) => {
              if (!p?.name) return '';
              const isCustom = Boolean(p.hasCustomPrice || (p.customPrice !== undefined && p.customPrice !== null));
              const displayPrice = isCustom ? p.customPrice : p.defaultPrice;
              return `${p.name} (${formatPriceOnly(displayPrice)} đ/${p.unit || 'kg'}${isCustom ? ' - 🏷️ Giá riêng' : ''})`;
            }}
            renderOption={(p) => {
              const isCustom = Boolean(p.hasCustomPrice || (p.customPrice !== undefined && p.customPrice !== null));
              const displayPrice = isCustom ? p.customPrice : p.defaultPrice;
              const basePrice = p.baseDefaultPrice ?? p.defaultPrice;
              const hasDiffFromBase = isCustom && basePrice !== undefined && basePrice !== null && Number(basePrice) !== Number(p.customPrice);

              return (
                <View style={[styles.dropdownOptionRow, isCustom && styles.dropdownOptionRowCustom]}>
                  {/* Cột trái: Tên sản phẩm, Badge phân biệt Giá riêng/Giá chung, và lý do đổi giá nếu có */}
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View style={styles.nameAndBadgeWrap}>
                      <Text style={[styles.dropdownOptionName, isCustom && styles.dropdownOptionNameCustom]}>
                        {p.name}
                      </Text>
                      {isCustom ? (
                        <View style={styles.badgeCustomPrice}>
                          <Text style={styles.badgeCustomPriceText}>🏷️ Giá riêng</Text>
                        </View>
                      ) : (
                        <View style={styles.badgeDefaultPrice}>
                          <Text style={styles.badgeDefaultPriceText}>Giá chung</Text>
                        </View>
                      )}
                    </View>
                    {p.changeReason ? (
                      <Text style={styles.dropdownOptionReason} numberOfLines={1}>
                        💬 Lý do: {p.changeReason}
                      </Text>
                    ) : null}
                  </View>

                  {/* Cột phải: Đơn giá hiện tại và giá chung gốc gạch ngang để đối chiếu */}
                  <View style={styles.priceCol}>
                    <Text style={[styles.dropdownOptionPrice, isCustom && styles.dropdownOptionPriceCustom]}>
                      {formatPriceOnly(displayPrice)} đ/{p.unit || 'kg'}
                    </Text>
                    {hasDiffFromBase && (
                      <Text style={styles.dropdownOptionBasePrice}>
                        Giá chung: {formatPriceOnly(basePrice)} đ
                      </Text>
                    )}
                  </View>
                </View>
              );
            }}
            hasError={hasError}
            triggerStyle={[
              styles.customSelectTrigger,
              currentProduct && styles.customSelectTriggerSelected,
              hasError && styles.customSelectTriggerError,
            ]}
          />
        </View>

        {/* Nút xóa lựa chọn nhanh khi đã chọn một món thịt */}
        {currentProduct && (
          <TouchableOpacity
            style={styles.clearProductBtn}
            onPress={() => {
              if (onClearProduct) onClearProduct();
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={styles.clearProductText}>✕</Text>
          </TouchableOpacity>
        )}

        {/* Nút thêm thịt nhanh */}
        <TouchableOpacity
          style={styles.addProductBtn}
          onPress={onAddProduct}
          activeOpacity={0.75}
        >
          <Text style={styles.addProductBtnText}>＋ Thêm thịt</Text>
        </TouchableOpacity>
      </View>

      {/* Khi không có sản phẩm nào */}
      {products.length === 0 && (
        <Text style={styles.noProductHintText}>
          Chưa có loại thịt trong danh mục. Bấm ＋ Thêm thịt để tạo mới.
        </Text>
      )}

      {/* Báo lỗi của trường chọn sản phẩm */}
      {hasError && error ? (
        <Text style={styles.fieldErrorText}>⚠️ {error}</Text>
      ) : null}
    </View>
  );
};

export default ProductSelector;

const styles = StyleSheet.create({
  productsContainer: {
    marginBottom: 10,
    position: 'relative',
    zIndex: 100,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectWrapperCol: {
    flex: 1,
    minWidth: 0,
  },
  customSelectTrigger: {
    height: 42,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingLeft: 10,
    paddingRight: 6,
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  customSelectTriggerSelected: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  customSelectTriggerError: {
    borderColor: COLORS.danger,
    borderWidth: 1.5,
  },
  clearProductBtn: {
    width: 32,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearProductText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  addProductBtn: {
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FAF8F6',
    borderWidth: 1.5,
    borderColor: '#7F1D1D',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  addProductBtnText: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#7F1D1D',
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  dropdownOptionRowCustom: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
    paddingLeft: 8,
  },
  nameAndBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  dropdownOptionName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  dropdownOptionNameCustom: {
    color: '#15803D',
    fontWeight: '700',
  },
  badgeCustomPrice: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  badgeCustomPriceText: {
    color: '#15803D',
    fontSize: 10,
    fontWeight: '700',
  },
  badgeDefaultPrice: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeDefaultPriceText: {
    color: '#64748B',
    fontSize: 9.5,
    fontWeight: '500',
  },
  dropdownOptionReason: {
    fontSize: 10.5,
    color: '#B45309',
    fontStyle: 'italic',
    marginTop: 2,
  },
  priceCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  dropdownOptionPrice: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '600',
  },
  dropdownOptionPriceCustom: {
    color: '#059669',
    fontSize: 13.5,
    fontWeight: '700',
  },
  dropdownOptionBasePrice: {
    fontSize: 10.5,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
    marginTop: 1,
  },
  noProductHintText: {
    color: COLORS.dangerDark,
    fontSize: 13,
    paddingVertical: 8,
  },
  fieldErrorText: {
    fontSize: 12,
    color: COLORS.danger,
    marginTop: 4,
    fontWeight: '600',
  },
});
