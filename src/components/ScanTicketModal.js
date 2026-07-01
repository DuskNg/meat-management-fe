// meat-management-fe/src/components/ScanTicketModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import DatePickerInput from './DatePickerInput';

// Loại bỏ dấu tiếng Việt để phục vụ tìm kiếm không dấu
const removeDiacritics = (str) => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
};

const ScanTicketModal = forwardRef(({ customerId: propCustomerId, onRefresh }, ref) => {
  const [customerId, setCustomerId] = useState(propCustomerId || null);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const fetchCustomers = async () => {
    try {
      const response = await api.get('/customers');
      if (response.data.success) {
        setCustomers(response.data.data);
      }
    } catch (err) {
      console.error('Không thể tải danh sách khách hàng:', err);
    }
  };

  // --- Helper: lấy ngày hôm nay dạng DD/MM/YYYY ---
  const getTodayFormatted = () => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  };

  // --- Helper: chuỗi DD/MM/YYYY → ISO string để gửi API ---
  const parseDateString = (str) => {
    const parts = str.trim().split(/[\/\-]/);
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const dateObj = new Date(year, month - 1, day);
    if (
      dateObj.getFullYear() !== year ||
      dateObj.getMonth() !== month - 1 ||
      dateObj.getDate() !== day
    ) return null;
    return dateObj.toISOString();
  };

  // --- Helper: định dạng hàng nghìn dấu chấm ---
  const formatNumberString = (value) => {
    const clean = value.replace(/[^0-9]/g, '');
    if (clean === '') return '';
    return new Intl.NumberFormat('vi-VN').format(parseInt(clean, 10));
  };

  const parseNumberString = (formatted) => {
    const clean = formatted.replace(/[^0-9]/g, '');
    return clean ? parseInt(clean, 10) : 0;
  };

  // --- Helper: định dạng tiền VNĐ ---
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount)
      .replace('₫', 'đ');

  // --- State ---
  const [visible, setVisible] = useState(false);
  const [dateStr, setDateStr] = useState(getTodayFormatted());
  const [note, setNote] = useState('Đơn ghi nợ tự động tạo từ ảnh chụp tích kê');
  const [scannedItems, setScannedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [modalTitleText, setModalTitleText] = useState('📸 KẾT QUẢ QUÉT TÍCH KÊ');

  // --- Phơi bày open/close ra ngoài qua forwardRef ---
  useImperativeHandle(ref, () => ({
    open: (items, title, defaultNote, initialDate, detectedCustomerName, targetCustomerId) => {
      setVisible(true);
      setModalTitleText(title || '📸 KẾT QUẢ QUÉT TÍCH KÊ');
      setNote(defaultNote || 'Đơn ghi nợ tự động tạo từ ảnh chụp tích kê');
      setError('');
      setErrorField('');

      const activeCustomerId = targetCustomerId || propCustomerId || null;
      setCustomerId(activeCustomerId);

      if (!activeCustomerId) {
        fetchCustomers();
        setSelectedCustomer(null);
        if (detectedCustomerName) {
          setCustomerSearch(detectedCustomerName);
          setShowDropdown(true);
        } else {
          setCustomerSearch('');
          setShowDropdown(false);
        }
      } else {
        setSelectedCustomer({ id: activeCustomerId });
      }

      // Nếu có ngày khởi tạo từ AI (dạng ISO Date), chuyển về định dạng DD/MM/YYYY
      if (initialDate) {
        try {
          const dObj = new Date(initialDate);
          if (!isNaN(dObj.getTime())) {
            const d = String(dObj.getDate()).padStart(2, '0');
            const m = String(dObj.getMonth() + 1).padStart(2, '0');
            const y = dObj.getFullYear();
            setDateStr(`${d}/${m}/${y}`);
          } else {
            setDateStr(getTodayFormatted());
          }
        } catch {
          setDateStr(getTodayFormatted());
        }
      } else {
        setDateStr(getTodayFormatted());
      }

      if (items && Array.isArray(items)) {
        // Ánh xạ mảng dữ liệu quét về mảng hiển thị có thể chỉnh sửa
        const mapped = items.map((item, idx) => {
          const qty = parseFloat(item.quantity) || 0;
          const prc = parseInt(item.price, 10) || 0;
          return {
            tempId: Date.now() + idx + Math.random(),
            product: item.product,
            quantity: qty,
            price: prc,
            displayQuantity: qty.toString(),
            displayPrice: formatNumberString(prc.toString()),
          };
        });
        setScannedItems(mapped);
      } else {
        setScannedItems([]);
      }
    },
    close: () => setVisible(false),
  }));

  // --- Xử lý đổi tên sản phẩm ---
  const handleProductNameChange = (tempId, text) => {
    setScannedItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        return {
          ...item,
          product: {
            ...item.product,
            name: text,
          },
        };
      })
    );
  };

  // --- Xử lý đổi số lượng ---
  const handleQuantityChange = (tempId, text) => {
    setScannedItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        const cleanQty = text.trim().replace(',', '.');
        const q = parseFloat(cleanQty) || 0;
        return {
          ...item,
          quantity: q,
          displayQuantity: text,
        };
      })
    );
  };

  // --- Xử lý đổi đơn giá ---
  const handlePriceChange = (tempId, text) => {
    setScannedItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        const p = parseNumberString(text);
        return {
          ...item,
          price: p,
          displayPrice: formatNumberString(text),
        };
      })
    );
  };

  // --- Xóa sản phẩm khỏi danh sách ---
  const handleRemoveItem = (tempId) => {
    setScannedItems((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  // --- Gửi dữ liệu nợ lên server ---
  const handleSubmit = async () => {
    if (loading) return; // Ngăn chặn bấm đúp khi đang gửi yêu cầu
    if (scannedItems.length === 0) {
      setError('Vui lòng có ít nhất 1 mặt hàng trong tích kê.');
      return;
    }

    // Kiểm tra tính hợp lệ của các dòng dữ liệu
    for (const item of scannedItems) {
      if (item.quantity <= 0) {
        setError(`Khối lượng của ${item.product.name} phải lớn hơn 0.`);
        return;
      }
      if (item.price <= 0) {
        setError(`Đơn giá của ${item.product.name} phải lớn hơn 0.`);
        return;
      }
    }

    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày ghi nợ không đúng định dạng (Ví dụ: 14/06/2026).');
      setErrorField('date');
      return;
    }

    const activeCustomerId = customerId || selectedCustomer?.id;
    if (!activeCustomerId) {
      setError('Vui lòng chọn khách hàng ghi nợ.');
      return;
    }

    setError('');
    setErrorField('');
    setLoading(true);

    try {
      const response = await api.post('/transactions', {
        customerId: activeCustomerId,
        date: isoDate,
        note: note.trim() || null,
        items: scannedItems.map((item) => ({
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          price: item.price,
        })),
      });

      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi lưu ghi nợ. Vui lòng thử lại.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // --- Tính tổng tiền tích kê ---
  const totalAmount = scannedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

  // Bộ lọc khách hàng trong dropdown tìm kiếm (không xét dấu tiếng Việt)
  const filteredDropdownCustomers = customers.filter((c) => {
    const nameNorm = removeDiacritics(c.name.toLowerCase());
    const searchNorm = removeDiacritics(customerSearch.toLowerCase());
    return nameNorm.includes(searchNorm) || (c.phone && c.phone.includes(customerSearch));
  });

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{modalTitleText}</Text>
          <TouchableOpacity style={styles.closeHeaderButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeHeaderText}>✕</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        {modalTitleText.includes('GIỌNG NÓI') && (
          <View style={styles.voiceWarningBox}>
            <Text style={styles.voiceWarningText}>
              💡 AI đã tự động phân tích giọng nói của bạn. Hãy kiểm tra lại tên thịt, số cân và giá bán xem đã đúng ý chưa trước khi bấm lưu nợ nhé!
            </Text>
          </View>
        )}

        {/* --- CẤU HÌNH KHÁCH HÀNG (Nếu chưa có) --- */}
        {!customerId && (
          <View style={styles.selectorSection}>
            <Text style={styles.label}>👤 Khách hàng ghi nợ:</Text>
            <View style={styles.dropdownContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="🔍 Gõ tìm tên khách hàng..."
                placeholderTextColor={COLORS.textLight}
                value={customerSearch}
                onChangeText={(text) => {
                  setCustomerSearch(text);
                  setShowDropdown(true);
                  if (selectedCustomer && selectedCustomer.name !== text) {
                    setSelectedCustomer(null);
                  }
                }}
                onFocus={() => setShowDropdown(true)}
              />
              {showDropdown && (
                <View style={styles.dropdownListContainer}>
                  <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
                    {filteredDropdownCustomers.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch(c.name);
                          setShowDropdown(false);
                          setError('');
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{c.name}</Text>
                        {c.phone ? <Text style={styles.dropdownItemPhone}>{c.phone}</Text> : null}
                      </TouchableOpacity>
                    ))}
                    {filteredDropdownCustomers.length === 0 && (
                      <View style={styles.dropdownEmptyItem}>
                        <Text style={styles.dropdownEmptyText}>Không tìm thấy khách hàng</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
        )}

        {/* --- CẤU HÌNH NGÀY GHI NỢ --- */}
        <Text style={styles.label}>📅 Ngày ghi nợ:</Text>
        <DatePickerInput
          value={dateStr}
          onChange={(val) => {
            setDateStr(val);
            if (errorField === 'date') {
              setError('');
              setErrorField('');
            }
          }}
          allowFuture={true}
          hasError={errorField === 'date'}
        />

        <View style={styles.divider} />

        <Text style={styles.tableTitle}>🥩 Danh sách mặt hàng nhận diện (Có thể sửa trực tiếp):</Text>
        
        {/* --- DANH SÁCH CHI TIẾT TÍCH KÊ RÚT GỌN --- */}
        <ScrollView style={styles.itemsScroll} nestedScrollEnabled={true}>
          {scannedItems.map((item) => {
            const subtotal = item.quantity * item.price;
            return (
              <View key={item.tempId} style={styles.itemRow}>
                {/* Tên sản phẩm (Có thể chỉnh sửa nếu AI nghe sai) */}
                <View style={styles.productNameContainer}>
                  <TextInput
                    style={styles.productNameInput}
                    value={item.product.name}
                    onChangeText={(txt) => handleProductNameChange(item.tempId, txt)}
                    placeholder="Tên thịt"
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>

                {/* Input nhập khối lượng */}
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.quantityInput}
                    keyboardType="decimal-pad"
                    value={item.displayQuantity}
                    onChangeText={(txt) => handleQuantityChange(item.tempId, txt)}
                  />
                  <Text style={styles.unitText}>{item.product.unit}</Text>
                </View>

                <Text style={styles.operatorText}>×</Text>

                {/* Input nhập đơn giá */}
                <View style={styles.priceInputContainer}>
                  <TextInput
                    style={styles.priceInput}
                    keyboardType="number-pad"
                    value={item.displayPrice}
                    onChangeText={(txt) => handlePriceChange(item.tempId, txt)}
                  />
                  <Text style={styles.currencySymbolText}>đ</Text>
                </View>

                <Text style={styles.operatorText}>=</Text>

                {/* Thành tiền dòng */}
                <Text style={styles.subtotalText} numberOfLines={1}>
                  {formatCurrency(subtotal)}
                </Text>

                {/* Nút xóa dòng sản phẩm */}
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => handleRemoveItem(item.tempId)}
                >
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>

        {/* --- GHI CHÚ CHUNG --- */}
        <View style={styles.noteSection}>
          <Text style={styles.label}>📝 Ghi chú đơn nợ:</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Ghi chú (ví dụ: Chụp tích kê ngày 22/6)"
            placeholderTextColor={COLORS.textLight}
            value={note}
            onChangeText={setNote}
          />
        </View>

        {/* --- TỔNG TIỀN CẢ ĐƠN --- */}
        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>💰 TỔNG TIỀN TÍCH KÊ:</Text>
          <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
        </View>

        {/* --- NÚT HỦY / XÁC NHẬN --- */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => setVisible(false)}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>HỦY BỎ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={handleSubmit}
            disabled={loading || scannedItems.length === 0}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>XÁC NHẬN GHI NỢ</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default ScanTicketModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    height: '100%',
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: FONTS.subtitle,
    fontWeight: 'bold',
    color: '#2563EB', // Màu xanh dương Premium
  },
  closeHeaderButton: {
    padding: 6,
  },
  closeHeaderText: {
    fontSize: 20,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 8,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 4,
  },
  tableTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
  itemsScroll: {
    flex: 1,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  productName: {
    flex: 1.5,
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  inputContainer: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 4,
    height: 36,
  },
  quantityInput: {
    flex: 1,
    minWidth: 0, // QUAN TRỌNG: Cho phép co giãn nhỏ hơn kích thước mặc định của trình duyệt
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    color: COLORS.text,
    padding: 0,
    outlineStyle: 'none', // Xóa đường viền focus mặc định của trình duyệt
  },
  unitText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: 2,
  },
  priceInputContainer: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 4,
    height: 36,
  },
  priceInput: {
    flex: 1,
    minWidth: 0, // QUAN TRỌNG: Cho phép co giãn nhỏ hơn kích thước mặc định của trình duyệt
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'right',
    color: COLORS.text,
    padding: 0,
    outlineStyle: 'none', // Xóa đường viền focus mặc định của trình duyệt
  },
  currencySymbolText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: 2,
  },
  operatorText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textLight,
    marginHorizontal: 4,
  },
  subtotalText: {
    flex: 2.2,
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.danger,
    textAlign: 'right',
  },
  removeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  removeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  noteSection: {
    marginBottom: 10,
  },
  noteInput: {
    backgroundColor: COLORS.inputBg,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  totalContainer: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#3B82F6',
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E3A8A',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: '#2563EB',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  voiceWarningBox: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
  },
  voiceWarningText: {
    fontSize: 13,
    color: '#B45309',
    lineHeight: 18,
    fontWeight: '500',
  },
  productNameContainer: {
    flex: 1.6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 6,
    height: 36,
  },
  productNameInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.text,
    padding: 0,
    outlineStyle: 'none',
  },
  selectorSection: {
    marginBottom: 12,
    position: 'relative',
    zIndex: 9999,
  },
  dropdownContainer: {
    position: 'relative',
  },
  searchInput: {
    backgroundColor: COLORS.inputBg,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dropdownListContainer: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: 150,
    zIndex: 10000,
    ...SHADOWS.card,
  },
  dropdownScroll: {
    maxHeight: 150,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  dropdownItemPhone: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  dropdownEmptyItem: {
    padding: 12,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    fontSize: 13,
    color: COLORS.textLight,
  },
});
