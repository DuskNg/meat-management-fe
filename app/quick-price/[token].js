// meat-management-fe/app/quick-price/[token].js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '../../src/api/client';
import { showGlobalToast } from '../../src/store/toastStore';
import { COLORS, SHADOWS, FONTS } from '../../src/theme';
import { matchSearch } from '../../src/utils/searchHelper';
import DatePickerInput from '../../src/components/DatePickerInput';
import CustomSelect from '../../src/components/CustomSelect';
import MoneyInput from '../../src/components/MoneyInput';
import PopupModal from '../../src/components/PopupModal';
import AnimatedPressable from '../../src/components/AnimatedPressable';

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount || 0)
    .replace('₫', 'đ');

// Lấy ngày hôm nay định dạng DD/MM/YYYY
const getTodayFormatted = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
};

// Lấy ngày mai định dạng DD/MM/YYYY
const getTomorrowFormatted = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const d = String(tomorrow.getDate()).padStart(2, '0');
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const y = tomorrow.getFullYear();
  return `${d}/${m}/${y}`;
};

export default function QuickPriceScreen() {
  const { token } = useLocalSearchParams();

  // State thông tin link và dữ liệu gốc từ backend
  const [linkInfo, setLinkInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State xác thực mã PIN (nếu link có cài đặt mã PIN)
  const [pin, setPin] = useState('');
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Ngày bắt đầu áp dụng bảng giá mới (mặc định là hôm nay)
  const [effectiveDate, setEffectiveDate] = useState(getTodayFormatted());

  // Khách hàng / Cửa hàng đang được chọn
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Danh sách các loại thịt và trạng thái giá riêng của khách hàng
  const [productItems, setProductItems] = useState([]);

  // Từ khóa tìm kiếm loại thịt
  const [searchKeyword, setSearchKeyword] = useState('');

  // Trạng thái đang lưu và tính lại đơn nợ
  const [submitting, setSubmitting] = useState(false);

  // Quản lý zIndex của khối dropdown chọn khách hàng (đạt 999999 khi mở theo rule)
  const [selectOpen, setSelectOpen] = useState(false);

  // Ref popup xác nhận
  const popupRef = useRef(null);

  // Tải dữ liệu ban đầu từ Backend khi mở link
  const fetchLinkData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/quick-price/public/info/${token}`);
      if (res.data?.success) {
        setLinkInfo(res.data.data);
        if (!res.data.data.hasPin) {
          setIsPinVerified(true);
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải thông tin link cập nhật giá:', err);
      setError(err.response?.data?.message || 'Đường dẫn không tồn tại hoặc đã bị khóa.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinkData();
  }, [token]);

  // Xác thực mã PIN
  const handleVerifyPin = async () => {
    if (!pin || pin.length < 4) {
      showGlobalToast('Vui lòng nhập đầy đủ mã PIN 4 số.', 'warning');
      return;
    }
    try {
      setVerifyingPin(true);
      const res = await api.post(`/quick-price/public/verify-pin/${token}`, { pin });
      if (res.data?.success) {
        setIsPinVerified(true);
        showGlobalToast('Xác thực mã PIN thành công!', 'success');
      }
    } catch (err) {
      showGlobalToast(err.response?.data?.message || 'Mã PIN không chính xác.', 'error');
    } finally {
      setVerifyingPin(false);
    }
  };

  // Xử lý khi chọn một khách hàng
  const handleSelectCustomer = async (customer) => {
    setSelectedCustomer(customer);
    if (!customer) {
      setProductItems([]);
      return;
    }

    try {
      setLoadingPrices(true);
      // Lấy danh sách giá riêng hiện có của khách hàng này
      const res = await api.get(`/quick-price/public/customer-prices/${token}/${customer.id}`);
      const customPriceMap = new Map();
      if (res.data?.success && Array.isArray(res.data.data)) {
        res.data.data.forEach((cp) => {
          customPriceMap.set(cp.productId, cp.price);
        });
      }

      // Khởi tạo danh sách món thịt kèm giá riêng hiện có
      const products = linkInfo?.products || [];
      const initialized = products.map((prod) => {
        const hasCustom = customPriceMap.has(prod.id);
        const currentCustomPrice = hasCustom ? customPriceMap.get(prod.id) : null;
        return {
          id: prod.id,
          name: prod.name,
          customName: prod.name, // Cho phép sửa tên thịt theo yêu cầu
          defaultPrice: prod.defaultPrice,
          costPrice: prod.costPrice,
          unit: prod.unit || 'kg',
          originalPrice: hasCustom ? currentCustomPrice : prod.defaultPrice,
          hasCustomPrice: hasCustom,
          currentPrice: hasCustom ? currentCustomPrice : prod.defaultPrice,
          resetToDefault: false,
          isEdited: false,
          isEditingName: false,
        };
      });

      setProductItems(initialized);
    } catch (err) {
      console.error('Lỗi khi tải giá riêng của khách hàng:', err);
      showGlobalToast('Không thể tải bảng giá riêng của khách.', 'error');
    } finally {
      setLoadingPrices(false);
    }
  };

  // Cập nhật giá mới cho một loại thịt
  const handlePriceChange = (productId, newPriceValue) => {
    setProductItems((prev) =>
      prev.map((item) => {
        if (item.id !== productId) return item;
        const numVal = typeof newPriceValue === 'number' ? newPriceValue : parseFloat(newPriceValue) || 0;
        const isChanged = numVal !== item.originalPrice || item.customName !== item.name;
        return {
          ...item,
          currentPrice: numVal,
          resetToDefault: false,
          isEdited: isChanged,
        };
      })
    );
  };

  // Khôi phục về giá sạp niêm yết mặc định
  const handleResetToDefault = (productId) => {
    setProductItems((prev) =>
      prev.map((item) => {
        if (item.id !== productId) return item;
        return {
          ...item,
          currentPrice: item.defaultPrice,
          resetToDefault: true,
          isEdited: true,
        };
      })
    );
    showGlobalToast('Đã chọn khôi phục về giá sạp mặc định.', 'info');
  };

  // Sửa tên thịt
  const handleNameChange = (productId, newName) => {
    setProductItems((prev) =>
      prev.map((item) => {
        if (item.id !== productId) return item;
        const isChanged = newName.trim() !== item.name || item.currentPrice !== item.originalPrice;
        return {
          ...item,
          customName: newName,
          isEdited: isChanged,
        };
      })
    );
  };

  // Bật/tắt chế độ sửa tên thịt
  const toggleEditName = (productId) => {
    setProductItems((prev) =>
      prev.map((item) => {
        if (item.id !== productId) return item;
        return {
          ...item,
          isEditingName: !item.isEditingName,
        };
      })
    );
  };

  // Lọc danh sách thịt theo từ khóa tìm kiếm
  const filteredProducts = useMemo(() => {
    if (!searchKeyword.trim()) return productItems;
    return productItems.filter(
      (item) =>
        matchSearch(item.customName, searchKeyword) ||
        matchSearch(item.name, searchKeyword)
    );
  }, [productItems, searchKeyword]);

  // Đếm số lượng loại thịt có điều chỉnh
  const changedItemsCount = useMemo(() => {
    return productItems.filter((i) => i.isEdited).length;
  }, [productItems]);

  // Xử lý khi bấm nút "ÁP DỤNG GIÁ MỚI & CẬP NHẬT ĐƠN NỢ"
  const handleApplyPress = () => {
    if (!selectedCustomer) {
      showGlobalToast('Vui lòng chọn khách hàng / cửa hàng trước khi áp dụng.', 'warning');
      return;
    }

    const changedItems = productItems.filter((i) => i.isEdited);
    if (changedItems.length === 0) {
      showGlobalToast('Bạn chưa điều chỉnh đơn giá hoặc tên của mặt hàng nào.', 'info');
      return;
    }

    // Mở hộp thoại xác nhận PopupModal theo đúng quy tắc
    popupRef.current?.show({
      type: 'confirm',
      title: '🥩 Xác Nhận Áp Dụng Bảng Giá Mới',
      message:
        `Anh chủ xác nhận áp dụng bảng giá mới cho cửa hàng "${selectedCustomer.name}"?\n\n` +
        `• Ngày áp dụng: ${effectiveDate}\n` +
        `• Số loại thịt thay đổi: ${changedItems.length} loại thịt\n\n` +
        `⚠️ LƯU Ý QUAN TRỌNG: Tất cả đơn nợ của cửa hàng này từ ngày ${effectiveDate} trở về sau có chứa các món thịt này sẽ được TỰ ĐỘNG TÍNH LẠI tiền theo giá mới. Các đơn nợ trước ngày ${effectiveDate} sẽ được BẢO TOÀN NGUYÊN VẸN 100%.`,
      confirmText: 'Đồng ý áp dụng',
      cancelText: 'Xem lại',
      onConfirm: async () => {
        await executeApply(changedItems);
      },
    });
  };

  // Thực thi gửi request lên Backend
  const executeApply = async (changedItems) => {
    try {
      setSubmitting(true);

      const payload = {
        customerId: selectedCustomer.id,
        effectiveDate,
        pin: linkInfo?.hasPin ? pin : undefined,
        items: changedItems.map((item) => ({
          productId: item.id,
          price: item.resetToDefault ? null : item.currentPrice,
          productName: item.customName.trim() !== item.name ? item.customName.trim() : undefined,
          resetToDefault: item.resetToDefault,
        })),
      };

      const res = await api.post(`/quick-price/public/apply/${token}`, payload);

      if (res.data?.success) {
        const { recalculatedCount } = res.data.data;
        showGlobalToast(
          `Đã lưu giá mới và tự động tính lại ${recalculatedCount} đơn nợ từ ngày ${effectiveDate}!`,
          'success'
        );
        // Tải lại dữ liệu giá của khách để cập nhật mốc so sánh
        await handleSelectCustomer(selectedCustomer);
      } else {
        showGlobalToast(res.data?.message || 'Không thể áp dụng bảng giá.', 'error');
      }
    } catch (err) {
      console.error('Lỗi khi áp dụng giá riêng:', err);
      showGlobalToast(err.response?.data?.message || 'Lỗi kết nối máy chủ.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── GIAO DIỆN KHI ĐANG TẢI LINK HOẶC CÓ LỖI ───
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Đang tải thông tin bảng giá...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Không thể truy cập</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // ─── GIAO DIỆN NHẬP MÃ PIN NẾU LINK YÊU CẦU ───
  if (linkInfo?.hasPin && !isPinVerified) {
    return (
      <View style={styles.pinContainer}>
        <View style={styles.pinCard}>
          <Text style={styles.pinIcon}>🔒</Text>
          <Text style={styles.pinTitle}>Xác Thực Mã PIN</Text>
          <Text style={styles.pinSubtitle}>
            Đường dẫn này được cài đặt mã PIN bảo mật để bảo vệ dữ liệu giá bán của anh chủ.
          </Text>

          <TextInput
            style={styles.pinInput}
            value={pin}
            onChangeText={setPin}
            placeholder="Nhập 4 số PIN"
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
            maxLength={6}
            secureTextEntry
            autoFocus
          />

          <TouchableOpacity
            style={[styles.pinButton, verifyingPin && styles.buttonDisabled]}
            onPress={handleVerifyPin}
            disabled={verifyingPin}
          >
            {verifyingPin ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.pinButtonText}>Mở Bảng Giá</Text>
            )}
          </TouchableOpacity>
        </View>
        <PopupModal ref={popupRef} />
      </View>
    );
  }

  // ─── GIAO DIỆN CHÍNH CẬP NHẬT GIÁ CHO ANH CHỦ TRÊN ZALO ───
  return (
    <View style={styles.container}>
      {/* ── HEADER TINH GỌN (COMPACT UI THEO QUY TẮC) ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerIcon}>🥩</Text>
            <View>
              <Text style={styles.headerTitle}>CẬP NHẬT GIÁ BÁN RIÊNG</Text>
              <Text style={styles.headerSubtitle}>
                {linkInfo?.ownerName ? `Sạp thịt: ${linkInfo.ownerName}` : 'Dành cho Anh Chủ'}
              </Text>
            </View>
          </View>
          <View style={styles.badgeOwner}>
            <Text style={styles.badgeOwnerText}>Anh Chủ</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── KHỐI 1: CHỌN NGÀY ÁP DỤNG BẢNG GIÁ MỚI ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>📅 Ngày bắt đầu áp dụng đơn giá mới</Text>
            <View style={styles.quickDateRow}>
              <TouchableOpacity
                style={[styles.quickDateBtn, effectiveDate === getTodayFormatted() && styles.quickDateBtnActive]}
                onPress={() => setEffectiveDate(getTodayFormatted())}
              >
                <Text
                  style={[
                    styles.quickDateText,
                    effectiveDate === getTodayFormatted() && styles.quickDateTextActive,
                  ]}
                >
                  Hôm nay
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickDateBtn, effectiveDate === getTomorrowFormatted() && styles.quickDateBtnActive]}
                onPress={() => setEffectiveDate(getTomorrowFormatted())}
              >
                <Text
                  style={[
                    styles.quickDateText,
                    effectiveDate === getTomorrowFormatted() && styles.quickDateTextActive,
                  ]}
                >
                  Ngày mai
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <DatePickerInput
            value={effectiveDate}
            onChange={(val) => setEffectiveDate(val)}
            compact={true}
          />

          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              💡 <Text style={{ fontWeight: '700' }}>Nguyên tắc:</Text> Đơn nợ từ ngày{' '}
              <Text style={{ fontWeight: '700', color: COLORS.primary }}>{effectiveDate}</Text> về sau sẽ tự động tính lại tiền. Toàn bộ đơn nợ trước ngày này được giữ nguyên 100%.
            </Text>
          </View>
        </View>

        {/* ── KHỐI 2: CHỌN KHÁCH HÀNG / CỬA HÀNG (CUSTOMSELECT CHUẨN RULE) ── */}
        <View style={[styles.sectionCard, selectOpen && { zIndex: 999999, elevation: 999999 }]}>
          <Text style={styles.sectionLabel}>🏪 Chọn Khách hàng / Cửa hàng cần chỉnh giá</Text>
          <CustomSelect
            value={selectedCustomer}
            placeholder="Tìm kiếm và chọn tên cửa hàng..."
            options={linkInfo?.customers || []}
            onSelect={handleSelectCustomer}
            // BẮT BUỘC trả về chuỗi văn bản theo RULE
            renderSelected={(c) => c?.name || ''}
            renderOption={(c) => (
              <View style={styles.customerOptionWrap}>
                <Text style={styles.customerOptionName}>{c.name}</Text>
                {Boolean(c.phone || c.address) && (
                  <Text style={styles.customerOptionMeta}>
                    {[c.phone, c.address].filter(Boolean).join(' • ')}
                  </Text>
                )}
              </View>
            )}
            getOptionLabel={(c) => c?.name || ''}
            compact={true}
            zIndex={999999}
            onOpenChange={(isOpen) => setSelectOpen(isOpen)}
          />
        </View>

        {/* ── KHỐI 3: DANH SÁCH MÓN THỊT & Ô SỬA TÊN THỊT / GIÁ RIÊNG ── */}
        {selectedCustomer ? (
          <View style={styles.sectionCard}>
            <View style={styles.productHeaderRow}>
              <Text style={styles.sectionLabel}>
                🥩 Bảng giá của: <Text style={{ color: COLORS.primary }}>{selectedCustomer.name}</Text>
              </Text>
              {changedItemsCount > 0 && (
                <View style={styles.changedBadge}>
                  <Text style={styles.changedBadgeText}>Đã đổi {changedItemsCount} món</Text>
                </View>
              )}
            </View>

            {/* Thanh tìm kiếm tên loại thịt nhanh */}
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                value={searchKeyword}
                onChangeText={setSearchKeyword}
                placeholder="Tìm nhanh tên loại thịt..."
                placeholderTextColor="#94A3B8"
                clearButtonMode="while-editing"
              />
              {Boolean(searchKeyword) && (
                <TouchableOpacity onPress={() => setSearchKeyword('')} style={styles.clearSearchBtn}>
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {loadingPrices ? (
              <View style={styles.loadingPricesWrap}>
                <ActivityIndicator color={COLORS.primary} size="small" />
                <Text style={styles.loadingPricesText}>Đang tải bảng giá riêng của khách...</Text>
              </View>
            ) : filteredProducts.length === 0 ? (
              <View style={styles.emptyProductsWrap}>
                <Text style={styles.emptyProductsText}>
                  {searchKeyword ? 'Không tìm thấy loại thịt phù hợp.' : 'Chưa có danh mục thịt nào.'}
                </Text>
              </View>
            ) : (
              <View style={styles.productList}>
                {filteredProducts.map((item) => {
                  const hasCustom = item.hasCustomPrice;
                  const isEdited = item.isEdited;

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.productItemCard,
                        isEdited && styles.productItemCardEdited,
                      ]}
                    >
                      {/* Cột thông tin thịt & sửa tên */}
                      <View style={styles.productInfoCol}>
                        {item.isEditingName ? (
                          <View style={styles.editNameRow}>
                            <TextInput
                              style={styles.editNameInput}
                              value={item.customName}
                              onChangeText={(txt) => handleNameChange(item.id, txt)}
                              autoFocus
                            />
                            <TouchableOpacity
                              style={styles.doneEditNameBtn}
                              onPress={() => toggleEditName(item.id)}
                            >
                              <Text style={styles.doneEditNameText}>✓</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.productNameTouch}
                            onPress={() => toggleEditName(item.id)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.productName}>{item.customName}</Text>
                            <Text style={styles.editNameIcon}>✏️</Text>
                          </TouchableOpacity>
                        )}

                        <View style={styles.priceMetaRow}>
                          <Text style={styles.defaultPriceLabel}>
                            Giá sạp: {formatCurrency(item.defaultPrice)}/{item.unit}
                          </Text>

                          {hasCustom && !item.resetToDefault ? (
                            <View style={styles.customPriceBadge}>
                              <Text style={styles.customPriceBadgeText}>Giá riêng</Text>
                            </View>
                          ) : (
                            <View style={styles.defaultPriceBadge}>
                              <Text style={styles.defaultPriceBadgeText}>Giá sạp</Text>
                            </View>
                          )}

                          {isEdited && (
                            <View style={styles.editedTag}>
                              <Text style={styles.editedTagText}>Mới</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Cột nhập giá bán riêng mới */}
                      <View style={styles.priceInputCol}>
                        <MoneyInput
                          value={item.currentPrice}
                          onChangeValue={(val) => handlePriceChange(item.id, val)}
                          placeholder="Đơn giá"
                          textAlign="right"
                          style={styles.moneyInputWrap}
                          inputStyle={styles.moneyInputField}
                        />

                        {/* Nút trả về giá mặc định sạp nếu đang có giá riêng */}
                        {(hasCustom || item.currentPrice !== item.defaultPrice) && !item.resetToDefault && (
                          <TouchableOpacity
                            style={styles.resetBtn}
                            onPress={() => handleResetToDefault(item.id)}
                          >
                            <Text style={styles.resetBtnText}>Về giá sạp</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderIcon}>👆</Text>
            <Text style={styles.placeholderTitle}>Chưa chọn Cửa hàng</Text>
            <Text style={styles.placeholderDesc}>
              Vui lòng chọn một khách hàng/cửa hàng ở trên để hiển thị danh sách loại thịt và cập nhật đơn giá.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── FOOTER CỐ ĐỊNH CHỨA NÚT ÁP DỤNG ── */}
      {selectedCustomer && (
        <View style={styles.bottomBar}>
          <View style={styles.bottomSummary}>
            <Text style={styles.bottomSummaryLabel}>Ngày áp dụng: {effectiveDate}</Text>
            <Text style={styles.bottomSummaryCount}>
              Đã thay đổi: <Text style={{ fontWeight: '700', color: COLORS.primary }}>{changedItemsCount}</Text> món thịt
            </Text>
          </View>

          <AnimatedPressable
            style={[styles.applyButton, (submitting || changedItemsCount === 0) && styles.buttonDisabled]}
            onPress={handleApplyPress}
            disabled={submitting || changedItemsCount === 0}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.applyButtonText}>💾 ÁP DỤNG GIÁ MỚI & TÍNH LẠI ĐƠN NỢ</Text>
            )}
          </AnimatedPressable>
        </View>
      )}

      {/* Modal hỏi xác nhận tương tác theo quy tắc */}
      <PopupModal ref={popupRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#475569',
    fontWeight: '500',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  errorText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },

  // ─── PIN STYLES ───
  pinContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#0F172A',
  },
  pinCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  pinIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  pinTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  pinSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  pinInput: {
    width: '100%',
    height: 52,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    color: '#0F172A',
    marginBottom: 20,
  },
  pinButton: {
    width: '100%',
    height: 48,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // ─── HEADER STYLES ───
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 14 : 44,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    ...SHADOWS.small,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    fontSize: 28,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  badgeOwner: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeOwnerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },

  // ─── SCROLL CONTENT & CARDS ───
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: 12,
    paddingBottom: 120,
    gap: 10,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.small,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quickDateBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  quickDateBtnActive: {
    backgroundColor: COLORS.primary,
  },
  quickDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  quickDateTextActive: {
    color: '#FFFFFF',
  },
  noteBox: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    padding: 8,
    borderRadius: 4,
  },
  noteText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },

  // ─── CUSTOM SELECT OPTIONS ───
  customerOptionWrap: {
    paddingVertical: 4,
  },
  customerOptionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  customerOptionMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },

  // ─── PRODUCT LIST & ITEMS ───
  productHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  changedBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  changedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 10,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  productList: {
    gap: 8,
  },
  productItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    gap: 8,
  },
  productItemCardEdited: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  productInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  productNameTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  editNameIcon: {
    fontSize: 12,
    opacity: 0.6,
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editNameInput: {
    flex: 1,
    height: 32,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  doneEditNameBtn: {
    width: 32,
    height: 32,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneEditNameText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  priceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  defaultPriceLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  customPriceBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  customPriceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6D28D9',
  },
  defaultPriceBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultPriceBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  editedTag: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  editedTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  priceInputCol: {
    alignItems: 'flex-end',
    width: 130,
  },
  moneyInputWrap: {
    width: '100%',
    height: 38,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  moneyInputField: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  resetBtn: {
    marginTop: 4,
    paddingVertical: 2,
  },
  resetBtnText: {
    fontSize: 10,
    color: '#EF4444',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  loadingPricesWrap: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  loadingPricesText: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyProductsWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyProductsText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  placeholderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginTop: 10,
  },
  placeholderIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  placeholderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  placeholderDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },

  // ─── BOTTOM BAR STYLES ───
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    padding: 12,
    paddingBottom: Platform.OS === 'web' ? 14 : 28,
    ...SHADOWS.large,
  },
  bottomSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bottomSummaryLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  bottomSummaryCount: {
    fontSize: 12,
    color: '#475569',
  },
  applyButton: {
    height: 48,
    backgroundColor: '#16A34A', // Màu xanh lá nổi bật, dễ nhìn
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
