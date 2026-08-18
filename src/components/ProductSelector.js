// meat-management-fe/src/components/ProductSelector.js
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { COLORS, FONTS } from '../theme';
import { matchItemSearch } from '../utils/searchHelper';

/**
 * Component ProductSelector dùng chung cho cả DebtModal (ghi nợ mới) và EditDebtModal (cập nhật đơn nợ).
 * Quản lý giao diện Dropdown tìm kiếm nhanh và chọn thịt.
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const filteredProducts = products.filter((product) =>
    matchItemSearch(product, productSearch, ['name', 'unit'])
  );

  return (
    <View style={[styles.productsContainer, dropdownOpen && { zIndex: 100 }]}>
      {/* Hàng chứa ô chọn và nút thêm nhanh */}
      <View style={styles.selectRow}>
        <TouchableOpacity
          style={[
            styles.selectTrigger,
            dropdownOpen && styles.selectTriggerActive,
            currentProduct && styles.selectTriggerSelected,
            hasError && styles.selectTriggerError,
          ]}
          onPress={() => setDropdownOpen((prev) => !prev)}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.selectTriggerText,
              !currentProduct && styles.selectTriggerPlaceholder,
            ]}
            numberOfLines={1}
          >
            {currentProduct ? currentProduct.name : '🔍 Chọn loại thịt...'}
          </Text>
          {currentProduct ? (
            <TouchableOpacity
              style={styles.selectClearBtn}
              onPress={(e) => {
                e.stopPropagation();
                onClearProduct();
                setProductSearch('');
                setDropdownOpen(false);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.selectClearText}>✕</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.selectChevron}>{dropdownOpen ? '▲' : '▼'}</Text>
          )}
        </TouchableOpacity>

        {/* Nút thêm thịt nhanh */}
        <TouchableOpacity
          style={styles.addProductBtn}
          onPress={onAddProduct}
        >
          <Text style={styles.addProductBtnText}>＋ Thêm thịt</Text>
        </TouchableOpacity>
      </View>

      {/* Lớp dropdown hiển thị danh sách thịt */}
      {dropdownOpen && (
        <View style={styles.dropdownContainer}>
          {/* Ô tìm kiếm bên trong dropdown */}
          <View style={styles.dropdownSearchRow}>
            <TextInput
              style={styles.dropdownSearchInput}
              placeholder="🔍 Tìm thịt..."
              placeholderTextColor={COLORS.textLight}
              value={productSearch}
              onChangeText={setProductSearch}
              autoCorrect={false}
              autoFocus={true}
            />
            {productSearch.length > 0 && (
              <TouchableOpacity
                style={styles.dropdownClearBtn}
                onPress={() => setProductSearch('')}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.dropdownClearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Danh sách sản phẩm */}
          <ScrollView
            style={styles.dropdownList}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
          >
            {filteredProducts.length === 0 ? (
              <Text style={styles.noProductSearchText}>Không tìm thấy loại thịt phù hợp.</Text>
            ) : (
              filteredProducts.map((p) => {
                const isSelected = currentProduct?.id === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.dropdownItem,
                      isSelected && styles.dropdownItemSelected,
                    ]}
                    onPress={() => {
                      onSelectProduct(p);
                      setDropdownOpen(false);
                      setProductSearch('');
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        isSelected && styles.dropdownItemTextSelected,
                      ]}
                    >
                      {p.name}
                    </Text>
                    <Text style={styles.dropdownItemPrice}>
                      {formatCurrency(p.defaultPrice)}/{p.unit}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {/* Khi không có sản phẩm nào */}
      {products.length === 0 && (
        <Text style={[styles.noProductSearchText, { color: COLORS.dangerDark }]}>
          Chưa có loại thịt. Bấm ＋ để thêm.
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
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 0,
  },
  selectTrigger: {
    flex: 1,
    height: 42,
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectTriggerActive: {
    borderColor: COLORS.danger,
    borderWidth: 1.5,
  },
  selectTriggerSelected: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerLight,
  },
  selectTriggerError: {
    borderColor: COLORS.danger,
    borderWidth: 1.5,
  },
  selectTriggerText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
  },
  selectTriggerPlaceholder: {
    color: COLORS.textLight,
    fontWeight: '400',
  },
  selectChevron: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  selectClearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  selectClearText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 11,
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
    paddingHorizontal: 10,
  },
  addProductBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#7F1D1D',
  },
  dropdownContainer: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 90, // Khoảng cách chừa chỗ cho nút thêm nhanh bên phải
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.danger,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 200,
    overflow: 'hidden',
  },
  dropdownSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dropdownSearchInput: {
    flex: 1,
    height: 36,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 0,
    paddingHorizontal: 10,
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dropdownClearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.textLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  dropdownClearText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 11,
  },
  dropdownList: {
    maxHeight: 180,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dropdownItemSelected: {
    backgroundColor: COLORS.dangerLight,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
  },
  dropdownItemTextSelected: {
    color: COLORS.dangerDark,
  },
  dropdownItemPrice: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  noProductSearchText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    paddingVertical: 10,
    textAlign: 'center',
  },
  fieldErrorText: {
    fontSize: 12,
    color: COLORS.danger,
    marginTop: 4,
    fontWeight: '500',
  },
});
