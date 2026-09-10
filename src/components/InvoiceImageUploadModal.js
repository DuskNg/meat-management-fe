// meat-management-fe/src/components/InvoiceImageUploadModal.js
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import SmoothModal from './SmoothModal';
import CustomSelect from './CustomSelect';
import DatePickerInput from './DatePickerInput';
import InvoiceImageViewerModal from './InvoiceImageViewerModal';
import { api } from '../api/client';
import { COLORS, SHADOWS } from '../theme';
import { showGlobalToast } from '../store/toastStore';


// Định dạng ngày hôm nay dạng DD/MM/YYYY
const getTodayFormatted = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
};

// Chuyển chuỗi DD/MM/YYYY thành ISO string
const parseDateString = (str) => {
  if (!str) return new Date().toISOString();
  const parts = str.trim().split(/[\/\-]/);
  if (parts.length !== 3) return new Date().toISOString();
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return new Date().toISOString();
  const dateObj = new Date(year, month - 1, day);
  return dateObj.toISOString();
};

/**
 * Modal Đăng Tải Ảnh Hóa Đơn:
 * - Hỗ trợ tải ảnh số lượng lớn từ thiết bị.
 * - Hỗ trợ dán ảnh trực tiếp từ Clipboard (Ctrl + V).
 * - Cho phép chọn khách hàng và ngày cho từng ảnh (bằng CustomSelect & DatePickerInput).
 * - Hỗ trợ công cụ áp dụng nhanh cùng ngày / cùng khách cho toàn bộ danh sách.
 * - Tự động đính kèm ảnh vào đơn nợ ngày hôm đó của khách sau khi lưu.
 */
const InvoiceImageUploadModal = forwardRef(({ onRefresh, popupModalRef }, ref) => {
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 768;

  const [visible, setVisible] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [imageList, setImageList] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [processProgress, setProcessProgress] = useState('');

  // Bộ chọn hàng loạt (Batch apply)
  const [batchCustomer, setBatchCustomer] = useState(null);
  const [batchDateStr, setBatchDateStr] = useState(getTodayFormatted());
  const [activeOpenRowId, setActiveOpenRowId] = useState(null);

  const fileInputRef = useRef(null);
  const imageViewerRef = useRef(null);
  const idCounterRef = useRef(1);

  // Mở modal từ bên ngoài
  useImperativeHandle(ref, () => ({
    open: async (initialCustomerId = null, initialDate = null) => {
      setVisible(true);
      setImageList([]);
      setBatchCustomer(null);
      setBatchDateStr(initialDate || getTodayFormatted());

      // Tải danh sách khách hàng hoạt động
      try {
        setLoadingCustomers(true);
        const res = await api.get('/customers?isBadDebt=false');
        const list = res.data?.data || [];
        setCustomers(list);

        // Nếu có truyền khách mặc định
        if (initialCustomerId) {
          const found = list.find((c) => c.id === initialCustomerId);
          if (found) {
            setBatchCustomer(found);
          }
        }
      } catch (err) {
        showGlobalToast('Không thể tải danh sách khách hàng.', 'error');
      } finally {
        setLoadingCustomers(false);
      }
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Kiểm tra file có phải là định dạng hình ảnh hợp lệ
  const isImageFile = (file) => {
    if (!file) return false;
    if (file.type && file.type.startsWith('image/')) return true;
    return /\.(jpe?g|png|webp|bmp|heic|jfif|gif)$/i.test(file.name || '');
  };

  // Đọc file và tự động nén nhẹ nếu ảnh quá lớn (> 1600px) để tránh tràn bộ nhớ RAM và giới hạn 50MB của server
  const readFileAsBase64 = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawData = e.target.result;
        if (typeof window === 'undefined' || typeof document === 'undefined') {
          resolve({ base64: rawData, size: file.size });
          return;
        }
        const img = document.createElement('img');
        img.onload = () => {
          try {
            const maxDim = 1600;
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              const compressed = canvas.toDataURL('image/jpeg', 0.82);
              resolve({ base64: compressed, size: Math.round(compressed.length * 0.75) });
              return;
            }
          } catch (_) {}
          resolve({ base64: rawData, size: file.size });
        };
        img.onerror = () => {
          resolve({ base64: rawData, size: file.size });
        };
        img.src = rawData;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  // Xử lý đọc tệp thành chuỗi base64 và nạp vào hàng chờ tuần tự có báo tiến độ
  const processFiles = async (files) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files).filter(isImageFile);
    if (fileArr.length === 0) {
      showGlobalToast('Không tìm thấy tệp hình ảnh hợp lệ (chỉ nhận JPG, PNG, WEBP, HEIC, v.v.).', 'warning');
      return;
    }

    setProcessingFiles(true);
    setProcessProgress(`0/${fileArr.length}`);

    try {
      const newItems = [];
      for (let i = 0; i < fileArr.length; i++) {
        const file = fileArr[i];
        setProcessProgress(`${i + 1}/${fileArr.length}`);
        const res = await readFileAsBase64(file);
        if (res && res.base64) {
          newItems.push({
            id: `img_${Date.now()}_${idCounterRef.current++}_${i}`,
            name: file.name || `Hóa đơn ${imageList.length + newItems.length + 1}`,
            size: res.size ? `${(res.size / 1024).toFixed(0)} KB` : '',
            imageBase64: res.base64,
            selectedCustomer: batchCustomer || null,
            customerId: batchCustomer?.id || null,
            dateStr: batchDateStr || getTodayFormatted(),
            note: '',
          });
        }
      }

      if (newItems.length > 0) {
        setImageList((prev) => [...prev, ...newItems]);
        showGlobalToast(`Đã thêm thành công ${newItems.length} ảnh vào danh sách!`, 'success');
      } else {
        showGlobalToast('Không thể đọc dữ liệu ảnh đã chọn.', 'error');
      }
    } catch (err) {
      console.error('[PROCESS FILES ERROR]', err);
      showGlobalToast('Có lỗi xảy ra khi xử lý ảnh.', 'error');
    } finally {
      setProcessingFiles(false);
      setProcessProgress('');
    }
  };

  // Lắng nghe sự kiện Paste (Ctrl + V) toàn màn hình khi Modal đang mở (trên Web)
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handlePasteEvent = (e) => {
      const clipboardData = e.clipboardData || window.clipboardData;
      if (!clipboardData) return;

      const items = clipboardData.items;
      if (!items || items.length === 0) return;

      const imageFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        processFiles(imageFiles);
      }
    };

    window.addEventListener('paste', handlePasteEvent);
    return () => {
      window.removeEventListener('paste', handlePasteEvent);
    };
  }, [visible, batchCustomer, batchDateStr]);

  // Kích hoạt chọn tệp từ máy tính
  const handleTriggerFileInput = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Xử lý khi người dùng chọn tệp qua input file HTML
  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
    // Đặt lại input để có thể chọn lại cùng một tệp nếu cần
    if (e.target) {
      e.target.value = '';
    }
  };

  // Nút bấm dán từ Clipboard qua API trình duyệt
  const handlePasteFromClipboardBtn = async () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.read) {
      try {
        const clipboardItems = await navigator.clipboard.read();
        const imageFiles = [];
        for (const item of clipboardItems) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              imageFiles.push(new File([blob], `pasted_invoice_${Date.now()}.png`, { type }));
            }
          }
        }

        if (imageFiles.length > 0) {
          processFiles(imageFiles);
          showGlobalToast(`Đã nhận diện ${imageFiles.length} ảnh từ Clipboard!`, 'success');
        } else {
          showGlobalToast('Không tìm thấy ảnh trong Clipboard. Vui lòng bấm Ctrl+V hoặc copy ảnh trước!', 'warning');
        }
      } catch (err) {
        showGlobalToast('Hãy nhấn phím tắt Ctrl + V trực tiếp trên bàn phím để dán ảnh!', 'info');
      }
    } else {
      showGlobalToast('Hãy nhấn phím tắt Ctrl + V trực tiếp trên bàn phím để dán ảnh!', 'info');
    }
  };

  // Cập nhật thông tin của một dòng ảnh
  const updateRow = (id, fields) => {
    setImageList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...fields } : item))
    );
  };

  // Xóa một ảnh khỏi danh sách chờ
  const removeRow = (id) => {
    setImageList((prev) => prev.filter((item) => item.id !== id));
  };

  // Xóa toàn bộ ảnh
  const handleClearAll = () => {
    if (imageList.length === 0) return;
    if (popupModalRef?.current) {
      popupModalRef.current.show({
        type: 'confirm',
        title: 'Xóa toàn bộ ảnh',
        message: 'Bạn có chắc chắn muốn xóa toàn bộ danh sách ảnh hóa đơn đang chờ lưu không?',
        onConfirm: () => setImageList([]),
      });
    } else {
      setImageList([]);
    }
  };

  // Áp dụng khách chung cho tất cả ảnh
  const handleApplyBatchCustomer = () => {
    if (!batchCustomer) {
      showGlobalToast('Vui lòng chọn một khách hàng mẫu trước khi áp dụng.', 'warning');
      return;
    }
    setImageList((prev) =>
      prev.map((item) => ({
        ...item,
        selectedCustomer: batchCustomer,
        customerId: batchCustomer.id,
      }))
    );
    showGlobalToast(`Đã áp dụng khách "${batchCustomer.name}" cho toàn bộ ${imageList.length} ảnh!`, 'success');
  };

  // Áp dụng ngày chung cho tất cả ảnh
  const handleApplyBatchDate = () => {
    if (!batchDateStr) {
      showGlobalToast('Vui lòng chọn ngày mẫu trước khi áp dụng.', 'warning');
      return;
    }
    setImageList((prev) =>
      prev.map((item) => ({
        ...item,
        dateStr: batchDateStr,
      }))
    );
    showGlobalToast(`Đã áp dụng ngày "${batchDateStr}" cho toàn bộ ${imageList.length} ảnh!`, 'success');
  };

  // Xem phóng to ảnh
  const handlePreviewImage = (item) => {
    if (imageViewerRef.current) {
      imageViewerRef.current.open({
        images: [{ imageUrl: item.imageBase64 }],
        title: item.selectedCustomer?.name || 'Ảnh hóa đơn',
        subtitle: `Ngày: ${item.dateStr}`,
      });
    }
  };

  // Lưu toàn bộ danh sách ảnh hóa đơn lên máy chủ
  const handleSubmit = async () => {
    if (imageList.length === 0) {
      showGlobalToast('Danh sách chưa có ảnh hóa đơn nào.', 'warning');
      return;
    }

    // Kiểm tra từng ảnh đã có khách hàng chưa
    const missingCustomerIdx = imageList.findIndex((item) => !item.customerId);
    if (missingCustomerIdx !== -1) {
      showGlobalToast(
        `Ảnh số #${missingCustomerIdx + 1} chưa được chọn khách hàng. Vui lòng chọn khách cho tất cả các ảnh!`,
        'error'
      );
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        items: imageList.map((item) => ({
          customerId: item.customerId,
          date: parseDateString(item.dateStr),
          imageBase64: item.imageBase64,
          note: null, // Đã loại bỏ ghi chú theo yêu cầu
        })),
      };

      const res = await api.post('/transactions/invoices/batch', payload);

      showGlobalToast(
        res.data?.message || `Đã lưu thành công ${imageList.length} ảnh hóa đơn và đính kèm đơn nợ!`,
        'success'
      );

      setVisible(false);
      setImageList([]);
      if (onRefresh) onRefresh();
    } catch (err) {
      const msg = err.response?.data?.message || 'Có lỗi xảy ra khi lưu ảnh hóa đơn. Vui lòng thử lại!';
      showGlobalToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const validCount = imageList.filter((item) => !!item.customerId).length;

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)} zIndex={90000}>
        <View style={styles.modalCard}>
          {/* Header Modal Full Màn Hình */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconWrap}>
                <Text style={styles.headerIcon}>🧾</Text>
              </View>
              <View>
                <Text style={styles.headerTitle}>LƯU ẢNH HÓA ĐƠN HÀNG LOẠT</Text>
                <Text style={styles.headerSub}>Tải ảnh từ máy tính hoặc dán phím tắt Ctrl + V</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Thanh công cụ thêm ảnh gọn gàng phía trên khi đã có ảnh */}
          {imageList.length > 0 && (
            <View style={styles.compactAddBar}>
              <TouchableOpacity
                style={styles.compactPickBtn}
                onPress={handleTriggerFileInput}
                activeOpacity={0.85}
                disabled={processingFiles}
              >
                {processingFiles ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.compactPickBtnText}>Đang xử lý {processProgress}...</Text>
                  </View>
                ) : (
                  <Text style={styles.compactPickBtnText}>📁 Chọn thêm ảnh từ máy tính</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.compactPasteBtn}
                onPress={handlePasteFromClipboardBtn}
                activeOpacity={0.85}
                disabled={processingFiles}
              >
                <Text style={styles.compactPasteBtnText}>📋 Dán thêm ảnh (Ctrl+V)</Text>
              </TouchableOpacity>

              <View style={{ flex: 1 }} />
              <Text style={styles.hintCtrlV}>💡 Mẹo: Nhấn Ctrl+V bất cứ lúc nào để dán thêm ảnh từ Clipboard</Text>
            </View>
          )}

          {/* Input file ẩn phục vụ chọn tệp trên Web */}
          {Platform.OS === 'web' && (
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.jpg,.jpeg,.png,.webp,.bmp,.heic,.jfif"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />
          )}

          {/* Thanh công cụ áp dụng nhanh cho tất cả (Chỉ hiện khi đã có ảnh) */}
          {imageList.length > 0 && (
            <View style={styles.batchToolbar}>
              <View style={styles.batchControlsRow}>
                {/* Chọn khách chung */}
                <View style={styles.batchControlCol}>
                  <Text style={styles.batchControlLabel}>Khách hàng chung:</Text>
                  <View style={styles.batchControlInputWrap}>
                    <View style={{ flex: 1, minWidth: 200 }}>
                      <CustomSelect
                        value={batchCustomer}
                        options={customers}
                        placeholder="Chọn khách áp dụng chung..."
                        renderSelected={(c) => c?.name || ''}
                        getOptionLabel={(c) => c?.name || ''}
                        onSelect={(c) => setBatchCustomer(c)}
                        zIndex={999999}
                        compact={true}
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.applyBtn, !batchCustomer && styles.applyBtnDisabled]}
                      onPress={handleApplyBatchCustomer}
                      disabled={!batchCustomer}
                    >
                      <Text style={styles.applyBtnText}>Áp dụng</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Chọn ngày chung */}
                <View style={styles.batchControlCol}>
                  <Text style={styles.batchControlLabel}>Ngày chung:</Text>
                  <View style={styles.batchControlInputWrap}>
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <DatePickerInput
                        value={batchDateStr}
                        onChange={(d) => setBatchDateStr(d)}
                        compact={true}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.applyBtn}
                      onPress={handleApplyBatchDate}
                    >
                      <Text style={styles.applyBtnText}>Áp dụng</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity onPress={handleClearAll} style={styles.clearAllBtn}>
                  <Text style={styles.clearAllBtnText}>🗑️ Xóa tất cả ({imageList.length})</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Danh sách các ảnh hiển thị dạng lưới thoáng, ảnh to rõ ràng */}
          <ScrollView
            style={styles.imageListScroll}
            contentContainerStyle={styles.imageListContent}
            showsVerticalScrollIndicator={true}
          >
            {imageList.length === 0 ? (
              <View style={styles.dropZoneBig}>
                <Text style={styles.dropZoneIcon}>📸</Text>
                <Text style={styles.dropZoneTitle}>Kéo thả ảnh hoặc dán (Ctrl + V)</Text>
                <Text style={styles.dropZoneSub}>
                  Chụp màn hình hoặc copy ảnh rồi nhấn <Text style={{ fontWeight: 'bold', color: '#1E293B' }}>Ctrl + V</Text>
                </Text>

                <View style={styles.dropZoneActions}>
                  <TouchableOpacity
                    style={styles.pickFileBtn}
                    onPress={handleTriggerFileInput}
                    activeOpacity={0.85}
                    disabled={processingFiles}
                  >
                    {processingFiles ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.pickFileBtnText}>Đang xử lý {processProgress}...</Text>
                      </View>
                    ) : (
                      <Text style={styles.pickFileBtnText}>📁 Chọn ảnh từ máy tính</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.pasteBtn}
                    onPress={handlePasteFromClipboardBtn}
                    activeOpacity={0.85}
                    disabled={processingFiles}
                  >
                    <Text style={styles.pasteBtnText}>📋 Dán ảnh từ Clipboard (Ctrl+V)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.cardsGrid}>
                {imageList.map((item, index) => {
                  const isRowActive = activeOpenRowId === item.id;

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.imageCardGrid,
                        !item.customerId && styles.imageCardWarning,
                        isRowActive && { zIndex: 999999, elevation: 999999 },
                      ]}
                    >
                      {/* Tiêu đề card & nút xóa */}
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.badgeIndex}>
                          <Text style={styles.badgeIndexText}>Ảnh #{index + 1}</Text>
                        </View>
                        {item.size ? (
                          <Text style={styles.fileSizeText}>{item.size}</Text>
                        ) : null}

                        <View style={{ flex: 1 }} />

                        <TouchableOpacity
                          style={styles.removeRowBtn}
                          onPress={() => removeRow(item.id)}
                          title="Xóa ảnh này"
                        >
                          <Text style={styles.removeRowBtnText}>🗑️ Xóa</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Khung ảnh to chiếm phần lớn diện tích */}
                      <TouchableOpacity
                        style={styles.largeThumbnailWrap}
                        onPress={() => handlePreviewImage(item)}
                        activeOpacity={0.85}
                        title="Bấm để phóng to xem rõ toàn màn hình"
                      >
                        <Image
                          source={{ uri: item.imageBase64 }}
                          style={styles.largeThumbnailImg}
                          resizeMode="contain"
                        />
                        <View style={styles.zoomBadge}>
                          <Text style={styles.zoomBadgeText}>🔍 Phóng to</Text>
                        </View>
                      </TouchableOpacity>

                      {/* Cấu hình Khách & Ngày (đã bỏ phần ghi chú) */}
                      <View style={styles.cardBottomControls}>
                        {/* Chọn khách hàng */}
                        <View
                          style={[
                            styles.fieldCol,
                            { flex: 1.4, minWidth: 160 },
                            isRowActive && { zIndex: 999999 },
                          ]}
                        >
                          <Text style={styles.fieldLabel}>
                            Khách hàng <Text style={{ color: '#EF4444' }}>*</Text>:
                          </Text>
                          <CustomSelect
                            value={item.selectedCustomer}
                            options={customers}
                            placeholder="-- Chọn khách mua nợ --"
                            renderSelected={(c) => c?.name || ''}
                            getOptionLabel={(c) => c?.name || ''}
                            onSelect={(c) =>
                              updateRow(item.id, {
                                customerId: c.id,
                                selectedCustomer: c,
                              })
                            }
                            zIndex={999999}
                            onOpenChange={(isOpen) =>
                              setActiveOpenRowId(isOpen ? item.id : null)
                            }
                            compact={true}
                            hasError={!item.customerId}
                          />
                        </View>

                        {/* Chọn ngày */}
                        <View style={[styles.fieldCol, { flex: 1, minWidth: 120 }]}>
                          <Text style={styles.fieldLabel}>Ngày công nợ:</Text>
                          <DatePickerInput
                            value={item.dateStr}
                            onChange={(d) => updateRow(item.id, { dateStr: d })}
                            compact={true}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* Footer nút hành động */}
          <View style={[styles.footer, isMobile && styles.footerMobile]}>
            <View style={[styles.footerSummary, isMobile && styles.footerSummaryMobile]}>
              <Text style={[styles.footerSummaryText, isMobile && { fontSize: 12, textAlign: 'center' }]}>
                Tổng số: <Text style={{ fontWeight: 'bold' }}>{imageList.length}</Text> ảnh |
                Đã chọn khách: <Text style={{ fontWeight: 'bold', color: '#10B981' }}>{validCount}</Text>/{imageList.length}
              </Text>
            </View>

            <View style={[styles.footerBtnsRow, isMobile && styles.footerBtnsRowMobile]}>
              <TouchableOpacity
                style={[styles.cancelBtn, isMobile && { flex: 1, alignItems: 'center' }]}
                onPress={() => setVisible(false)}
                disabled={submitting}
              >
                <Text style={styles.cancelBtnText}>Đóng</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  isMobile && { flex: 1.8, alignItems: 'center', justifyContent: 'center' },
                  (imageList.length === 0 || submitting) && styles.submitBtnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={imageList.length === 0 || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.submitBtnText, isMobile && { fontSize: 12 }]}>
                    💾 Lưu tất cả ({imageList.length})
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SmoothModal>

      {/* Modal phóng to xem ảnh chi tiết */}
      <InvoiceImageViewerModal ref={imageViewerRef} />
    </>
  );
});

const styles = StyleSheet.create({
  modalCard: {
    width: '100%',
    height: '100%',
    flex: 1,
    backgroundColor: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 90000,
    elevation: 90000,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
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
    fontSize: 15,
    fontWeight: 'bold',
    color: '#475569',
  },
  compactAddBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 10,
    flexWrap: 'wrap',
  },
  compactPickBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  compactPickBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  compactPasteBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  compactPasteBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  hintCtrlV: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
  dropZoneBig: {
    margin: 30,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingVertical: 50,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropZoneIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  dropZoneTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  dropZoneSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
  },
  dropZoneActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'center',
  },
  pickFileBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 8,
  },
  pickFileBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  pasteBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 8,
  },
  pasteBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  batchToolbar: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  batchControlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,
  },
  batchControlCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  batchControlLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  batchControlInputWrap: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  applyBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  clearAllBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  clearAllBtnText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  imageListScroll: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  imageListContent: {
    padding: 16,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'flex-start',
  },
  imageCardGrid: {
    flex: 1,
    minWidth: 320,
    maxWidth: 580,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    ...SHADOWS.small,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  imageCardWarning: {
    borderColor: '#F87171',
    backgroundColor: '#FEF2F2',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeIndex: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeIndexText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  fileSizeText: {
    fontSize: 11,
    color: '#64748B',
  },
  removeRowBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  removeRowBtnText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  largeThumbnailWrap: {
    width: '100%',
    height: 320,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  largeThumbnailImg: {
    width: '100%',
    height: '100%',
  },
  zoomBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  zoomBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  cardBottomControls: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  fieldCol: {
    display: 'flex',
    flexDirection: 'column',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  footer: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  footerMobile: {
    flexDirection: 'column',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  footerSummaryText: {
    fontSize: 13,
    color: '#475569',
  },
  footerSummaryMobile: {
    width: '100%',
    alignItems: 'center',
  },
  footerBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerBtnsRowMobile: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  submitBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dropZoneMobile: {
    padding: 10,
  },
  dropZoneContentMobile: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  batchToolbarMobile: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  imageCardMobile: {
    flexDirection: 'column',
    padding: 10,
    gap: 10,
  },
  thumbnailWrapMobile: {
    width: '100%',
    height: 150,
  },
});

export default InvoiceImageUploadModal;
