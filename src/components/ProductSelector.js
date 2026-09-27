// meat-management-fe/src/components/ProductSelector.js
import React from 'react';
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
 * Giải quyết triệt để lỗi dropdown bị các phần tử khác (như phần đính kèm ảnh) đè lên.
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
  // Helper định dạng tiền tệ an toàn
  const safeFormatCurrency = (val) => {
    if (typeof formatCurrency === 'function') return formatCurrency(val);
    return Number(val || 0).toLocaleString('vi-VN');
  };

  return (
    <View style={styles.productsContainer}>
      {/* Hàng chứa ô chọn CustomSelect và các nút thao tác */}
      <View style={styles.selectRow}>
        <View style={styles.selectWrapperCol}>
          <CustomSelect
            value={currentProduct}
            placeholder="🔍 Chọn loại thịt..."
            options={products}
            onSelect={(product) => {
              if (onSelectProduct) onSelectProduct(product);
            }}
            getOptionLabel={(p) => (p?.name ? p.name : '')}
            renderSelected={(p) => (p?.name ? p.name : '')}
            renderOption={(p) => (
              <View style={styles.dropdownOptionRow}>
                <Text style={styles.dropdownOptionName}>{p.name}</Text>
                <Text style={styles.dropdownOptionPrice}>
                  {safeFormatCurrency(p.defaultPrice)}đ/{p.unit || 'kg'}
                </Text>
              </View>
            )}
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
    paddingVertical: 2,
  },
  dropdownOptionName: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  dropdownOptionPrice: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
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
