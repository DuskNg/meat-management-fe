// meat-management-fe/src/components/EditSupplierTransactionModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Image,
} from 'react-native';
import MoneyInput from './MoneyInput';
import DatePickerInput from './DatePickerInput';
import CustomSelect from './CustomSelect';
import SmoothModal from './SmoothModal';
import { api } from '../api/client';
import { COLORS, FONTS, SHADOWS } from '../theme';
import { showGlobalToast } from '../store/toastStore';

// Helper: chuyển ISO date thành DD/MM/YYYY
const formatDateToDisplay = (dateInput) => {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

// Helper: chuyển DD/MM/YYYY sang ISO string
const parseDateString = (str) => {
  if (!str) return null;
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

// Helper định dạng tiền VNĐ
const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0));

// Tạo dòng món thịt rỗng
const createEmptyItem = () => ({
  id: Date.now() + Math.random(),
  productId: '',
  productName: '',
  quantity: '',
  price: '',
  unit: 'kg',
  amount: 0,
});

// Modal chỉnh sửa giao dịch nhập hàng (nợ nhà cung cấp)
const EditSupplierTransactionModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [transactionId, setTransactionId] = useState(null);
  const [supplierName, setSupplierName] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 2 chế độ nhập
  const [orderMode, setOrderMode] = useState('quick');
  const [amountVND, setAmountVND] = useState(0);
  const [items, setItems] = useState([createEmptyItem()]);

  // Danh mục sản phẩm thịt
  const [products, setProducts] = useState([]);
  const [mediaList, setMediaList] = useState([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [activeSelectRowId, setActiveSelectRowId] = useState(null);

  const fileInputRef = useRef(null);
  const isSubmittingRef = useRef(false);

  // Tải danh mục sản phẩm khi mở modal
  const fetchProducts = async () => {
    try {
      const res = await api.get('/products');
      if (res.data?.success && Array.isArray(res.data?.data)) {
        setProducts(res.data.data);
      }
    } catch (err) {
      console.warn('Lỗi tải danh mục sản phẩm:', err);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (transaction, name = '') => {
      if (!transaction) return;
      setTransactionId(transaction.id);
      setSupplierName(name || transaction.supplierName || '');
      setDateStr(formatDateToDisplay(transaction.date || transaction.createdAt));
      setNote(transaction.note || '');
      setError('');

      // Khôi phục chi tiết món nếu có
      if (Array.isArray(transaction.items) && transaction.items.length > 0) {
        setOrderMode('detail');
        setItems(
          transaction.items.map((it) => ({
            id: it.id || Date.now() + Math.random(),
            productId: it.productId || '',
            productName: it.productName || '',
            quantity: it.quantity ? String(it.quantity) : '',
            price: it.price ? String(it.price) : '',
            unit: it.unit || 'kg',
            amount: it.amount || 0,
          }))
        );
        setAmountVND(transaction.amount || 0);
      } else {
        setOrderMode('quick');
        setAmountVND(transaction.amount || 0);
        setItems([createEmptyItem()]);
      }

      // Khôi phục danh sách mediaUrls
      if (Array.isArray(transaction.mediaUrls) && transaction.mediaUrls.length > 0) {
        setMediaList(
          transaction.mediaUrls.map((m, idx) => ({
            id: `saved-${idx}`,
            url: m.url || m,
            fileType: m.fileType || 'IMAGE',
            fileName: m.fileName || `media_${idx + 1}`,
          }))
        );
      } else {
        setMediaList([]);
      }

      setVisible(true);
      fetchProducts();
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Xử lý dán ảnh từ Clipboard (Ctrl + V) trên Web
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handlePaste = (e) => {
      const clipboardData = e.clipboardData || window.clipboardData;
      if (!clipboardData) return;
      const clipItems = clipboardData.items;
      if (!clipItems || clipItems.length === 0) return;

      for (let i = 0; i < clipItems.length; i++) {
        if (clipItems[i].type && clipItems[i].type.startsWith('image/')) {
          const file = clipItems[i].getAsFile();
          if (file) {
            e.preventDefault();
            handleProcessFile(file);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [visible]);

  // Đọc file thành data URI
  const handleProcessFile = (file) => {
    if (!file) return;
    const isVideo = file.type?.startsWith('video/') || /\.(mp4|mov|qt|avi|webm|m4v|3gp|mkv)$/i.test(file.name || '');
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const fileData = uploadEvent.target?.result;
      if (fileData) {
        setMediaList((prev) => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            fileData,
            fileType: isVideo ? 'VIDEO' : 'IMAGE',
            fileName: file.name || (isVideo ? 'video_ncc.mp4' : 'anh_ncc.jpg'),
          },
        ]);
        showGlobalToast(`Đã thêm ${isVideo ? 'video' : 'ảnh'}: ${file.name || ''}`, 'info');
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePickMedia = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e) => {
    const files = e.target?.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file) => handleProcessFile(file));
    }
    if (e.target) e.target.value = '';
  };

  const handleRemoveMedia = (mediaId) => {
    setMediaList((prev) => prev.filter((m) => m.id !== mediaId));
  };

  // ─── THAO TÁC CÁC DÒNG MÓN THỊT ───
  const handleAddItem = () => {
    setItems((prev) => [...prev, createEmptyItem()]);
  };

  const handleRemoveItem = (index) => {
    setItems((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length > 0 ? next : [createEmptyItem()];
    });
  };

  const handleSelectProduct = (index, product) => {
    setItems((prev) => {
      const next = [...prev];
      const cur = { ...next[index] };
      cur.productId = product?.id || '';
      cur.productName = product?.name || '';
      cur.unit = product?.unit || 'kg';
      if (product?.costPrice && parseFloat(product.costPrice) > 0) {
        cur.price = String(parseFloat(product.costPrice));
      }
      const q = parseFloat(cur.quantity) || 0;
      const p = parseFloat(cur.price) || 0;
      cur.amount = q * p;
      next[index] = cur;
      return next;
    });
  };

  const handleChangeQuantity = (index, val) => {
    setItems((prev) => {
      const next = [...prev];
      const cur = { ...next[index] };
      cur.quantity = val;
      const q = parseFloat(val) || 0;
      const p = parseFloat(cur.price) || 0;
      cur.amount = q * p;
      next[index] = cur;
      return next;
    });
  };

  const handleChangePrice = (index, val) => {
    setItems((prev) => {
      const next = [...prev];
      const cur = { ...next[index] };
      cur.price = val > 0 ? String(val) : '';
      const q = parseFloat(cur.quantity) || 0;
      const p = val > 0 ? val : 0;
      cur.amount = q * p;
      next[index] = cur;
      return next;
    });
  };

  const detailTotalAmount = useMemo(() => {
    return items.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);
  }, [items]);

  const finalTotalAmount = orderMode === 'detail' ? detailTotalAmount : amountVND;

  // ─── LƯU CẬP NHẬT GIAO DỊCH ───
  const handleSubmit = async () => {
    if (loading || isSubmittingRef.current) return;

    if (!finalTotalAmount || finalTotalAmount <= 0) {
      setError('Số tiền hàng nhập không được để trống và phải lớn hơn 0.');
      return;
    }

    if (orderMode === 'detail') {
      const validItems = items.filter((it) => it.productName && it.productName.trim());
      if (validItems.length === 0) {
        setError('Vui lòng chọn hoặc nhập ít nhất một món thịt ở tab chi tiết.');
        return;
      }
    }

    const isoDate = parseDateString(dateStr);
    if (!isoDate) {
      setError('Ngày nhập hàng không đúng định dạng (Ví dụ: 14/06/2026).');
      return;
    }

    setError('');
    setLoading(true);
    isSubmittingRef.current = true;

    try {
      // 1. Tải lên ảnh & video mới nếu có
      let finalMediaUrls = [];
      if (mediaList.length > 0) {
        setUploadingMedia(true);
        for (const mediaItem of mediaList) {
          if (mediaItem.url) {
            finalMediaUrls.push({
              url: mediaItem.url,
              fileType: mediaItem.fileType,
              fileName: mediaItem.fileName,
            });
          } else if (mediaItem.fileData) {
            try {
              const upRes = await api.post('/suppliers/media/upload', {
                fileData: mediaItem.fileData,
                fileName: mediaItem.fileName,
                fileType: mediaItem.fileType,
              });
              if (upRes.data?.success && upRes.data?.data?.url) {
                finalMediaUrls.push(upRes.data.data);
              }
            } catch (upErr) {
              console.warn('Lỗi tải file lên máy chủ:', upErr);
            }
          }
        }
        setUploadingMedia(false);
      }

      // 2. Chuẩn bị payload danh sách món chi tiết
      let payloadItems = null;
      if (orderMode === 'detail') {
        payloadItems = items
          .filter((it) => it.productName && it.productName.trim())
          .map((it) => ({
            productId: it.productId || null,
            productName: it.productName.trim(),
            quantity: parseFloat(it.quantity) || 0,
            price: parseFloat(it.price) || 0,
            unit: it.unit || 'kg',
            amount: parseFloat(it.amount) || 0,
          }));
      }

      // 3. Gửi API cập nhật
      const response = await api.put(`/suppliers/transactions/${transactionId}`, {
        totalAmount: finalTotalAmount,
        date: isoDate,
        note: note.trim() || null,
        items: payloadItems,
        mediaUrls: finalMediaUrls.length > 0 ? finalMediaUrls : null,
      });

      if (response.data.success) {
        showGlobalToast('Đã cập nhật đơn nhập hàng thành công!', 'success');
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi cập nhật đơn hàng. Vui lòng thử lại.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
      setUploadingMedia(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>✏️ SỬA ĐƠN NHẬP HÀNG</Text>
        {supplierName ? (
          <Text style={styles.supplierName}>
            Nhà cung cấp: <Text style={{ fontWeight: 'bold', color: COLORS.text }}>{supplierName}</Text>
          </Text>
        ) : null}

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        {/* Thanh chuyển tab 2 chế độ */}
        <View style={styles.orderModeToggleBar}>
          <TouchableOpacity
            style={[styles.orderModeTabBtn, orderMode === 'quick' && styles.orderModeTabBtnActive]}
            onPress={() => setOrderMode('quick')}
            activeOpacity={0.8}
          >
            <Text style={[styles.orderModeTabText, orderMode === 'quick' && styles.orderModeTabTextActive]}>
              ⚡ Nhập nhanh (Tiền hàng)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.orderModeTabBtn, orderMode === 'detail' && styles.orderModeTabBtnActive]}
            onPress={() => setOrderMode('detail')}
            activeOpacity={0.8}
          >
            <Text style={[styles.orderModeTabText, orderMode === 'detail' && styles.orderModeTabTextActive]}>
              🥩 Nhập chi tiết món thịt
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Ngày nhập hàng */}
          <Text style={styles.label}>📅 Ngày nhập hàng:</Text>
          <View style={styles.datePickerWrapper}>
            <DatePickerInput
              value={dateStr}
              onChange={(val) => {
                setDateStr(val);
                setError('');
              }}
              allowFuture={true}
            />
          </View>

          {/* TAB 1: NHẬP NHANH */}
          {orderMode === 'quick' && (
            <View style={styles.quickModeCard}>
              <Text style={styles.label}>💰 Số tiền hàng nhập (VND):</Text>
              <MoneyInput
                style={styles.amountInputContainer}
                inputStyle={styles.amountInput}
                value={amountVND}
                onChangeValue={(val) => {
                  setAmountVND(val);
                  setError('');
                }}
                placeholder="Ví dụ: 10.000.000"
              />
            </View>
          )}

          {/* TAB 2: CHI TIẾT MÓN THỊT */}
          {orderMode === 'detail' && (
            <View style={styles.detailModeCard}>
              <View style={styles.detailHeaderRow}>
                <Text style={styles.detailCardTitle}>DANH SÁCH MÓN THỊT ({items.length})</Text>
                <TouchableOpacity style={styles.btnAddItemBtn} onPress={handleAddItem} activeOpacity={0.8}>
                  <Text style={styles.btnAddItemBtnText}>+ Thêm món</Text>
                </TouchableOpacity>
              </View>

              {items.map((item, idx) => {
                const selectedProd = products.find((p) => p.id === item.productId) || null;
                const isDropdownOpen = activeSelectRowId === item.id;

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.itemRowCard,
                      isDropdownOpen && { zIndex: 999999, elevation: 999999 },
                    ]}
                  >
                    <View style={[styles.itemProductSelectWrap, isDropdownOpen && { zIndex: 999999, elevation: 999999 }]}>
                      <Text style={styles.itemRowIndex}>#{idx + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <CustomSelect
                          options={products}
                          value={selectedProd}
                          placeholder={item.productName || 'Chọn loại thịt...'}
                          onSelect={(p) => handleSelectProduct(idx, p)}
                          renderSelected={(p) => p?.name || item.productName || ''}
                          zIndex={999999}
                          onOpenChange={(isOpen) => setActiveSelectRowId(isOpen ? item.id : null)}
                        />
                      </View>
                      {items.length > 1 && (
                        <TouchableOpacity
                          style={styles.btnDeleteItem}
                          onPress={() => handleRemoveItem(idx)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.btnDeleteItemText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.itemInputsRow}>
                      <View style={styles.inputCol}>
                        <Text style={styles.miniLabel}>Khối lượng ({item.unit || 'kg'}):</Text>
                        <TextInput
                          style={styles.kgInput}
                          keyboardType="decimal-pad"
                          placeholder="0.0"
                          placeholderTextColor="#94A3B8"
                          value={String(item.quantity || '')}
                          onChangeText={(val) => handleChangeQuantity(idx, val)}
                        />
                      </View>

                      <View style={styles.inputCol}>
                        <Text style={styles.miniLabel}>Giá nhập (đ/{item.unit || 'kg'}):</Text>
                        <MoneyInput
                          style={styles.priceInputContainer}
                          inputStyle={styles.priceInput}
                          value={parseFloat(item.price) || 0}
                          onChangeValue={(val) => handleChangePrice(idx, val)}
                          placeholder="Đơn giá"
                        />
                      </View>

                      <View style={styles.amountCol}>
                        <Text style={styles.miniLabel}>Thành tiền:</Text>
                        <Text style={styles.itemAmountText}>{formatCurrency(item.amount)} đ</Text>
                      </View>
                    </View>
                  </View>
                );
              })}

              <View style={styles.detailTotalSummaryBox}>
                <Text style={styles.detailTotalSummaryLabel}>TỔNG TIỀN MÓN THỊT:</Text>
                <Text style={styles.detailTotalSummaryValue}>{formatCurrency(detailTotalAmount)} đ</Text>
              </View>
            </View>
          )}

          {/* Ghi chú */}
          <Text style={styles.label}>📝 Ghi chú đơn hàng (Tùy chọn):</Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Nhập 150kg thịt mông sấn"
            placeholderTextColor={COLORS.textLight}
            value={note}
            onChangeText={setNote}
          />

          {/* ẢNH & VIDEO ĐÍNH KÈM */}
          <View style={styles.mediaSectionCard}>
            <View style={styles.mediaHeaderRow}>
              <Text style={styles.mediaSectionTitle}>📸 ẢNH & VIDEO CHỨNG TỪ NCC ({mediaList.length})</Text>
              <TouchableOpacity style={styles.btnPickMedia} onPress={handlePickMedia} activeOpacity={0.8}>
                <Text style={styles.btnPickMediaText}>+ Thêm ảnh / video</Text>
              </TouchableOpacity>
            </View>

            {Platform.OS === 'web' && (
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*,video/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />
            )}

            {mediaList.length === 0 ? (
              <TouchableOpacity style={styles.mediaEmptyBox} onPress={handlePickMedia} activeOpacity={0.7}>
                <Text style={styles.mediaEmptyIcon}>📷 🎥</Text>
                <Text style={styles.mediaEmptyText}>Chưa có ảnh/video phiếu cân hay hóa đơn.</Text>
                <Text style={styles.mediaEmptySubText}>Nhấn vào đây để chọn tệp hoặc dán (Ctrl + V) từ bàn phím</Text>
              </TouchableOpacity>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaThumbScroll}>
                {mediaList.map((m) => (
                  <View key={m.id} style={styles.mediaThumbCard}>
                    {m.fileType === 'VIDEO' ? (
                      <View style={styles.videoThumbPlaceholder}>
                        <Text style={{ fontSize: 24 }}>🎥</Text>
                        <Text style={styles.videoThumbLabel} numberOfLines={1}>VIDEO</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: m.fileData || m.url }} style={styles.imageThumb} resizeMode="cover" />
                    )}
                    <TouchableOpacity
                      style={styles.btnRemoveMediaThumb}
                      onPress={() => handleRemoveMedia(m.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.btnRemoveMediaThumbText}>✕</Text>
                    </TouchableOpacity>
                    <Text style={styles.mediaThumbFileName} numberOfLines={1}>{m.fileName}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </ScrollView>

        {/* FOOTER */}
        <View style={styles.footerBar}>
          <View style={styles.footerTotalBox}>
            <Text style={styles.footerTotalLabel}>TỔNG NỢ CẬP NHẬT:</Text>
            <Text style={styles.footerTotalValue}>{formatCurrency(finalTotalAmount)} đ</Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => setVisible(false)}
              disabled={loading || uploadingMedia}
            >
              <Text style={styles.cancelButtonText}>ĐÓNG LẠI</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.submitButton, (loading || uploadingMedia) && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading || uploadingMedia}
            >
              {loading || uploadingMedia ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.submitButtonText}>
                    {uploadingMedia ? 'Đang tải file...' : 'Đang lưu...'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.submitButtonText}>💾 CẬP NHẬT</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SmoothModal>
  );
});

export default EditSupplierTransactionModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    maxHeight: '94%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: FONTS.weightBold,
    color: '#0284C7',
    textAlign: 'center',
    marginBottom: 4,
  },
  supplierName: {
    fontSize: 13.5,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  orderModeToggleBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  orderModeTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  orderModeTabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.small,
  },
  orderModeTabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  orderModeTabTextActive: {
    color: '#0284C7',
    fontWeight: 'bold',
  },
  formScroll: {
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: FONTS.weightBold,
    color: '#334155',
    marginBottom: 4,
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 3,
  },
  datePickerWrapper: {
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#F8FAFC',
    height: 42,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  quickModeCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 10,
  },
  amountInputContainer: {
    height: 48,
    backgroundColor: '#FFFFFF',
    borderColor: '#38BDF8',
    borderWidth: 1.5,
    borderRadius: 8,
  },
  amountInput: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0284C7',
    textAlign: 'center',
  },
  detailModeCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailCardTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    letterSpacing: 0.3,
  },
  btnAddItemBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  btnAddItemBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  itemRowCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 8,
  },
  itemProductSelectWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  itemRowIndex: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
    width: 22,
  },
  btnDeleteItem: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeleteItemText: {
    color: '#DC2626',
    fontWeight: 'bold',
    fontSize: 14,
  },
  itemInputsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  inputCol: {
    flex: 1,
  },
  amountCol: {
    flex: 1.2,
    alignItems: 'flex-end',
  },
  kgInput: {
    backgroundColor: '#F8FAFC',
    height: 38,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'center',
  },
  priceInputContainer: {
    height: 38,
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
  },
  priceInput: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'right',
  },
  itemAmountText: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#0284C7',
    marginTop: 6,
  },
  detailTotalSummaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  detailTotalSummaryLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
  },
  detailTotalSummaryValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  mediaSectionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  mediaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mediaSectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0369A1',
    letterSpacing: 0.2,
  },
  btnPickMedia: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  btnPickMediaText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  mediaEmptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaEmptyIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  mediaEmptyText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  mediaEmptySubText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  mediaThumbScroll: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  mediaThumbCard: {
    width: 80,
    marginRight: 8,
    position: 'relative',
    alignItems: 'center',
  },
  imageThumb: {
    width: 76,
    height: 76,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  videoThumbPlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoThumbLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#38BDF8',
    marginTop: 2,
  },
  btnRemoveMediaThumb: {
    position: 'absolute',
    top: -4,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  btnRemoveMediaThumbText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 11,
  },
  mediaThumbFileName: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
    maxWidth: 76,
  },
  footerBar: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
    marginTop: 4,
  },
  footerTotalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  footerTotalLabel: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#475569',
  },
  footerTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelButtonText: {
    color: '#64748B',
    fontSize: 13.5,
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: '#0284C7',
    flex: 1.5,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
});
