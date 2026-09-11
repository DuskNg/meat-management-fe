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
import { api, API_HOST } from '../api/client';
import { COLORS, SHADOWS } from '../theme';
import { showGlobalToast } from '../store/toastStore';
import {
  saveInvoiceDraft,
  loadInvoiceDraft,
  clearInvoiceDraft,
} from '../utils/invoiceDraftStorage';

// Định dạng ngày hôm nay dạng DD/MM/YYYY
const getTodayFormatted = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
};

// Định dạng ngày hiển thị DD/MM/YYYY
const formatDate = (dateInput) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount || 0).replace('₫', 'đ');
};

// Chuẩn hóa đường dẫn ảnh đầy đủ (Cloudinary hoặc local uploads)
const getFullImageUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:image/')) {
    return path;
  }
  const host = API_HOST || '';
  return `${host}${path.startsWith('/') ? '' : '/'}${path}`;
};

// Lấy khoảng ngày nhanh cho bộ lọc quản lý ảnh
const getManagePresetRange = (presetKey) => {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  const y = today.getFullYear();
  const m = today.getMonth();

  if (presetKey === 'today') {
    const t = fmt(today);
    return { from: t, to: t };
  }
  if (presetKey === 'last_7_days') {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return { from: fmt(from), to: fmt(today) };
  }
  if (presetKey === 'this_month') {
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { from: fmt(first), to: fmt(last) };
  }
  if (presetKey === 'last_month') {
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    return { from: fmt(first), to: fmt(last) };
  }
  return { from: '', to: '' };
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

  // Tab hiện tại: 'upload' (đăng tải ảnh mới) hoặc 'manage' (quản lý ảnh đã lưu)
  const [activeTab, setActiveTab] = useState('upload');

  // Bộ chọn hàng loạt (Batch apply) ở Tab Tải ảnh
  const [batchCustomer, setBatchCustomer] = useState(null);
  const [batchDateStr, setBatchDateStr] = useState(getTodayFormatted());
  const [activeOpenRowId, setActiveOpenRowId] = useState(null);

  // State cho Tab Quản lý ảnh đã lưu
  const [savedInvoices, setSavedInvoices] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [filterCustomer, setFilterCustomer] = useState(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [filterPreset, setFilterPreset] = useState('all'); // 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'all'
  const [selectedDeleteIds, setSelectedDeleteIds] = useState([]);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [manageFilterCustomerOpen, setManageFilterCustomerOpen] = useState(false);

  const fileInputRef = useRef(null);
  const imageViewerRef = useRef(null);
  const idCounterRef = useRef(1);

  // State phục vụ tính năng lưu cache bản nháp (Draft)
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedTime, setDraftSavedTime] = useState('');
  const [draftSaveStatus, setDraftSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const isLoadedDraftRef = useRef(false);
  const saveTimeoutRef = useRef(null);

  // State phục vụ tính năng thu phóng (Scale/Zoom) ảnh tập trung vào giữa
  const [batchScale, setBatchScale] = useState(1.4); // Mức scale mặc định 140%
  const isItemDraggingRef = useRef(false);

  // Tải danh sách ảnh hóa đơn đã lưu từ máy chủ theo bộ lọc
  const fetchSavedInvoices = async (overrideParams = {}) => {
    try {
      setLoadingSaved(true);
      const params = {
        customerId:
          overrideParams.customerId !== undefined
            ? overrideParams.customerId
            : filterCustomer?.id || '',
        fromDate:
          overrideParams.fromDate !== undefined
            ? overrideParams.fromDate
            : filterFromDate,
        toDate:
          overrideParams.toDate !== undefined
            ? overrideParams.toDate
            : filterToDate,
        search:
          overrideParams.search !== undefined
            ? overrideParams.search
            : filterSearch,
      };

      // Xóa các key rỗng
      Object.keys(params).forEach((key) => {
        if (!params[key]) delete params[key];
      });

      const res = await api.get('/transactions/invoices', { params });
      const list = res.data?.data || [];
      setSavedInvoices(list);
      setSelectedDeleteIds([]);
    } catch (err) {
      console.error('[FETCH INVOICES ERROR]', err);
      showGlobalToast('Không thể tải danh sách ảnh hóa đơn.', 'error');
    } finally {
      setLoadingSaved(false);
    }
  };

  // Mở modal từ bên ngoài
  useImperativeHandle(ref, () => ({
    open: async (initialCustomerId = null, initialDate = null, initialTab = 'upload') => {
      setVisible(true);
      setActiveTab(initialTab);
      setSelectedDeleteIds([]);
      isLoadedDraftRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      let customerList = customers;

      // Tải danh sách khách hàng hoạt động
      try {
        setLoadingCustomers(true);
        const res = await api.get('/customers?isBadDebt=false');
        customerList = res.data?.data || [];
        setCustomers(customerList);
      } catch (err) {
        showGlobalToast('Không thể tải danh sách khách hàng.', 'error');
      } finally {
        setLoadingCustomers(false);
      }

      // Nếu mở Tab Quản lý ảnh
      if (initialTab === 'manage') {
        if (initialCustomerId) {
          const found = customerList.find((c) => c.id === initialCustomerId);
          if (found) {
            setFilterCustomer(found);
            fetchSavedInvoices({ customerId: found.id });
            return;
          }
        }
        fetchSavedInvoices();
        return;
      }

      // Nếu mở Tab Đăng tải mới (upload): Kiểm tra và khôi phục bản nháp từ IndexedDB
      try {
        const draft = await loadInvoiceDraft();
        if (draft && Array.isArray(draft.imageList) && draft.imageList.length > 0) {
          // Khôi phục danh sách ảnh & video đang nhập dở
          setImageList(draft.imageList);

          // Khôi phục hoặc ưu tiên khách hàng
          if (initialCustomerId) {
            const found = customerList.find((c) => c.id === initialCustomerId);
            setBatchCustomer(found || draft.batchCustomer || null);
          } else {
            setBatchCustomer(draft.batchCustomer || null);
          }

          // Khôi phục ngày
          setBatchDateStr(draft.batchDateStr || initialDate || getTodayFormatted());

          // Định dạng thời gian đã lưu nháp
          const savedTime = draft.savedAt
            ? `${new Date(draft.savedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${formatDate(draft.savedAt)}`
            : '';
          setDraftSavedTime(savedTime);
          setDraftRestored(true);
          setDraftSaveStatus('saved');
          showGlobalToast(`Đã khôi phục ${draft.imageList.length} tệp hóa đơn đang nhập dở!`, 'info');
        } else {
          // Chưa có bản nháp nào
          setImageList([]);
          if (initialCustomerId) {
            const found = customerList.find((c) => c.id === initialCustomerId);
            setBatchCustomer(found || null);
          } else {
            setBatchCustomer(null);
          }
          setBatchDateStr(initialDate || getTodayFormatted());
          setDraftRestored(false);
          setDraftSaveStatus('idle');
        }
      } catch (draftErr) {
        console.warn('[INVOICE DRAFT LOAD WARNING]', draftErr);
        setImageList([]);
        setBatchCustomer(null);
        setBatchDateStr(initialDate || getTodayFormatted());
        setDraftRestored(false);
      } finally {
        // Cho phép cơ chế auto-save hoạt động sau khi đã hoàn thành khôi phục nháp
        setTimeout(() => {
          isLoadedDraftRef.current = true;
        }, 300);
      }
    },
    close: () => {
      setVisible(false);
    },
    fetchSaved: () => {
      fetchSavedInvoices();
    },
  }));

  // Tự động lưu bản nháp vào IndexedDB khi có thay đổi dữ liệu đang nhập dở
  useEffect(() => {
    if (!visible || !isLoadedDraftRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    if (imageList.length > 0) {
      setDraftSaveStatus('saving');
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveInvoiceDraft({
            imageList,
            batchCustomer,
            batchDateStr,
            savedAt: Date.now(),
          });
          setDraftSaveStatus('saved');
        } catch (saveErr) {
          console.error('[AUTO SAVE DRAFT ERROR]', saveErr);
        }
      }, 500);
    } else {
      // Khi danh sách ảnh rỗng, dọn sạch bản nháp trong IndexedDB
      clearInvoiceDraft();
      setDraftRestored(false);
      setDraftSaveStatus('idle');
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [imageList, batchCustomer, batchDateStr, visible]);

  // Kiểm tra đường dẫn hoặc chuỗi data xem có phải video không
  const checkIsVideo = (src) => {
    if (!src || typeof src !== 'string') return false;
    if (src.startsWith('data:video/')) return true;
    if (src.includes('/video/upload/')) return true;
    return /\.(mp4|mov|webm|m4v|avi|mkv)($|\?)/i.test(src);
  };

  // Kiểm tra file có phải là định dạng hình ảnh hoặc video hợp lệ
  const isMediaFile = (file) => {
    if (!file) return false;
    if (file.type) {
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) return true;
    }
    return /\.(jpe?g|png|webp|bmp|heic|jfif|gif|mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name || '');
  };

  const isVideoFile = (file) => {
    if (!file) return false;
    if (file.type && file.type.startsWith('video/')) return true;
    return /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name || '');
  };

  // Đọc file và xử lý:
  // - Nếu là video: đọc thành chuỗi Data URI base64 nguyên bản (giới hạn khuyến nghị < 80MB)
  // - Nếu là ảnh: tự động nén nhẹ nếu ảnh quá lớn (> 1600px) để tối ưu lưu trữ Cloudinary
  const readFileAsBase64 = (file) => {
    return new Promise((resolve) => {
      const isVid = isVideoFile(file);

      // Nếu là Video
      if (isVid) {
        if (file.size > 80 * 1024 * 1024) {
          showGlobalToast(`Video "${file.name}" vượt quá 80MB. Hãy chọn video ngắn hơn!`, 'warning');
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            base64: e.target.result,
            size: file.size,
            isVideo: true,
            mediaType: 'video',
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
        return;
      }

      // Nếu là Ảnh
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawData = e.target.result;
        if (typeof window === 'undefined' || typeof document === 'undefined') {
          resolve({ base64: rawData, size: file.size, isVideo: false, mediaType: 'image' });
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
              resolve({
                base64: compressed,
                size: Math.round(compressed.length * 0.75),
                isVideo: false,
                mediaType: 'image',
              });
              return;
            }
          } catch (_) {}
          resolve({ base64: rawData, size: file.size, isVideo: false, mediaType: 'image' });
        };
        img.onerror = () => {
          resolve({ base64: rawData, size: file.size, isVideo: false, mediaType: 'image' });
        };
        img.src = rawData;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  // Xử lý đọc tệp ảnh/video thành chuỗi base64 và nạp vào hàng chờ tuần tự có báo tiến độ
  const processFiles = async (files) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files).filter(isMediaFile);
    if (fileArr.length === 0) {
      showGlobalToast('Không tìm thấy tệp ảnh hoặc video hợp lệ (nhận JPG, PNG, WEBP, MP4, MOV, WEBM, v.v.).', 'warning');
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
          const isVid = res.isVideo;
          const formattedSize = isVid
            ? `${(res.size / (1024 * 1024)).toFixed(1)} MB`
            : `${(res.size / 1024).toFixed(0)} KB`;

          newItems.push({
            id: `media_${Date.now()}_${idCounterRef.current++}_${i}`,
            name: file.name || (isVid ? `Video ${imageList.length + newItems.length + 1}` : `Hóa đơn ${imageList.length + newItems.length + 1}`),
            size: formattedSize,
            imageBase64: res.base64,
            mediaType: isVid ? 'video' : 'image',
            selectedCustomer: batchCustomer || null,
            customerId: batchCustomer?.id || null,
            dateStr: batchDateStr || getTodayFormatted(),
            note: '',
            scale: isVid ? 1.0 : (batchScale || 1.4), // Mặc định tự động phóng to 140% tập trung vào giữa hóa đơn để bỏ rìa thừa
            offsetX: 0,
            offsetY: 0,
          });
        }
      }

      if (newItems.length > 0) {
        setImageList((prev) => [...prev, ...newItems]);
        showGlobalToast(`Đã thêm thành công ${newItems.length} ảnh/video vào danh sách!`, 'success');
      } else {
        showGlobalToast('Không thể đọc dữ liệu tệp đã chọn.', 'error');
      }
    } catch (err) {
      console.error('[PROCESS FILES ERROR]', err);
      showGlobalToast('Có lỗi xảy ra khi xử lý tệp.', 'error');
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

  // Xóa toàn bộ ảnh và dọn sạch bản nháp
  const handleClearAll = () => {
    if (imageList.length === 0) return;
    if (popupModalRef?.current) {
      popupModalRef.current.show({
        type: 'confirm',
        title: 'Xóa toàn bộ ảnh',
        message: 'Bạn có chắc chắn muốn xóa toàn bộ danh sách ảnh hóa đơn đang chờ lưu không? Bản nháp lưu trữ cũng sẽ được xóa.',
        onConfirm: async () => {
          setImageList([]);
          await clearInvoiceDraft();
          setDraftRestored(false);
          setDraftSaveStatus('idle');
          showGlobalToast('Đã xóa toàn bộ ảnh và dọn sạch bản nháp.', 'info');
        },
      });
    } else {
      setImageList([]);
      clearInvoiceDraft();
      setDraftRestored(false);
      setDraftSaveStatus('idle');
    }
  };

  // Xóa riêng bản nháp đang nhập dở
  const handleDiscardDraft = () => {
    if (popupModalRef?.current) {
      popupModalRef.current.show({
        type: 'confirm',
        title: 'Xóa bản nháp',
        message: 'Bạn có chắc chắn muốn xóa dữ liệu bản nháp đang nhập dở này không? Danh sách ảnh/video sẽ được làm mới.',
        onConfirm: async () => {
          setImageList([]);
          await clearInvoiceDraft();
          setDraftRestored(false);
          setDraftSaveStatus('idle');
          showGlobalToast('Đã xóa bản nháp hóa đơn thành công.', 'info');
        },
      });
    } else {
      setImageList([]);
      clearInvoiceDraft();
      setDraftRestored(false);
      setDraftSaveStatus('idle');
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

  // Điều chỉnh mức thu phóng của một ảnh lẻ
  const handleAdjustItemZoom = (id, delta) => {
    setImageList((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const current = item.scale !== undefined ? item.scale : 1.4;
        const next = Math.min(3.0, Math.max(1.0, Math.round((current + delta) * 100) / 100));
        return {
          ...item,
          scale: next,
          offsetX: next <= 1.05 ? 0 : item.offsetX || 0,
          offsetY: next <= 1.05 ? 0 : item.offsetY || 0,
        };
      })
    );
  };

  // Bật/tắt nhanh giữa mức gốc 100% và mức phóng to 140% tập trung giữa
  const handleToggleItemZoom = (id) => {
    setImageList((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const current = item.scale !== undefined ? item.scale : 1.4;
        const next = current > 1.05 ? 1.0 : 1.4;
        return { ...item, scale: next, offsetX: 0, offsetY: 0 };
      })
    );
  };

  // Đặt lại vị trí và mức zoom về mặc định
  const handleResetItemZoom = (id) => {
    setImageList((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return { ...item, scale: 1.4, offsetX: 0, offsetY: 0 };
      })
    );
  };

  // Áp dụng mức thu phóng cho toàn bộ ảnh trong danh sách
  const handleApplyBatchScale = (targetScale) => {
    setImageList((prev) =>
      prev.map((item) => ({
        ...item,
        scale: item.mediaType === 'video' ? 1.0 : targetScale,
        offsetX: 0,
        offsetY: 0,
      }))
    );
    showGlobalToast(`Đã áp dụng mức thu phóng ${Math.round(targetScale * 100)}% cho toàn bộ ảnh!`, 'success');
  };

  // Xử lý kéo di chuyển tâm ảnh (Pan) trên Web
  const handleItemMouseDown = (e, itemId) => {
    if (Platform.OS !== 'web') return;
    if (e.button !== 0) return; // Chỉ nhận click chuột trái
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const currentItem = imageList.find((i) => i.id === itemId);
    const initialOffsetX = currentItem?.offsetX || 0;
    const initialOffsetY = currentItem?.offsetY || 0;

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        isItemDraggingRef.current = true;
      }
      setImageList((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? { ...it, offsetX: Math.round(initialOffsetX + dx), offsetY: Math.round(initialOffsetY + dy) }
            : it
        )
      );
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setTimeout(() => {
        isItemDraggingRef.current = false;
      }, 50);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Lăn con lăn chuột để zoom mượt mà trên khung ảnh
  const handleWheelZoom = (e, itemId) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setImageList((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const current = item.scale !== undefined ? item.scale : 1.4;
        const next = Math.min(3.0, Math.max(1.0, Math.round((current + delta) * 100) / 100));
        return {
          ...item,
          scale: next,
          offsetX: next <= 1.05 ? 0 : item.offsetX || 0,
          offsetY: next <= 1.05 ? 0 : item.offsetY || 0,
        };
      })
    );
  };

  // Xem phóng to ảnh hoặc video
  const handlePreviewImage = (item) => {
    if (imageViewerRef.current) {
      const isVid = item.mediaType === 'video' || checkIsVideo(item.imageBase64);
      imageViewerRef.current.open({
        images: [{ imageUrl: item.imageBase64, isVideo: isVid }],
        title: item.selectedCustomer?.name || (isVid ? 'Video hóa đơn' : 'Ảnh hóa đơn'),
        subtitle: `Ngày: ${item.dateStr}`,
      });
    }
  };

  // Chuyển đổi giữa 2 tab Tải ảnh và Quản lý ảnh
  const handleChangeTab = (tab) => {
    setActiveTab(tab);
    if (tab === 'manage' && savedInvoices.length === 0 && !loadingSaved) {
      fetchSavedInvoices();
    }
  };

  // Áp dụng bộ lọc khoảng ngày nhanh (Hôm nay, 7 ngày qua, Tháng này, Toàn bộ)
  const handleApplyPreset = (presetKey) => {
    setFilterPreset(presetKey);
    const range = getManagePresetRange(presetKey);
    setFilterFromDate(range.from);
    setFilterToDate(range.to);
    fetchSavedInvoices({ fromDate: range.from, toDate: range.to });
  };

  // Đặt lại toàn bộ bộ lọc về mặc định
  const handleResetFilters = () => {
    setFilterCustomer(null);
    setFilterSearch('');
    setFilterFromDate('');
    setFilterToDate('');
    setFilterPreset('all');
    fetchSavedInvoices({ customerId: '', search: '', fromDate: '', toDate: '' });
  };

  // Thực hiện tìm kiếm theo bộ lọc hiện tại
  const handleSearchSubmit = () => {
    fetchSavedInvoices();
  };

  // Xóa đơn lẻ một ảnh hóa đơn đã lưu
  const handleDeleteSingleInvoice = (invoice) => {
    if (!invoice?.id) return;
    const custName = invoice.customer?.name || 'này';
    const dateStr = formatDate(invoice.date);

    if (popupModalRef?.current) {
      popupModalRef.current.show({
        type: 'confirm',
        title: 'Xóa tệp hóa đơn',
        message: `Bạn có chắc chắn muốn xóa tệp hóa đơn của nhà hàng "${custName}" (ngày ${dateStr}) không? Tệp sẽ bị xóa vĩnh viễn khỏi hệ thống và Cloudinary.`,
        onConfirm: async () => {
          try {
            await api.delete(`/transactions/invoices/${invoice.id}`);
            showGlobalToast('Đã xóa tệp hóa đơn thành công!', 'success');
            setSavedInvoices((prev) => prev.filter((item) => item.id !== invoice.id));
            setSelectedDeleteIds((prev) => prev.filter((id) => id !== invoice.id));
            if (onRefresh) onRefresh();
          } catch (err) {
            const msg = err.response?.data?.message || 'Có lỗi xảy ra khi xóa tệp hóa đơn.';
            showGlobalToast(msg, 'error');
          }
        },
      });
    }
  };

  // Xóa hàng loạt nhiều ảnh hóa đơn đã chọn
  const handleDeleteBulkInvoices = () => {
    if (selectedDeleteIds.length === 0) {
      showGlobalToast('Vui lòng tích chọn ít nhất 1 tệp để xóa.', 'warning');
      return;
    }

    if (popupModalRef?.current) {
      popupModalRef.current.show({
        type: 'confirm',
        title: 'Xóa nhiều tệp hóa đơn',
        message: `Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedDeleteIds.length} tệp hóa đơn đã chọn không? Hành động này không thể hoàn tác.`,
        onConfirm: async () => {
          try {
            setDeletingBulk(true);
            const idsToDelete = [...selectedDeleteIds];
            let successCount = 0;
            for (const id of idsToDelete) {
              try {
                await api.delete(`/transactions/invoices/${id}`);
                successCount++;
              } catch (_) {}
            }
            showGlobalToast(`Đã xóa thành công ${successCount}/${idsToDelete.length} tệp hóa đơn!`, 'success');
            setSelectedDeleteIds([]);
            fetchSavedInvoices();
            if (onRefresh) onRefresh();
          } catch (err) {
            showGlobalToast('Có lỗi xảy ra khi xóa tệp.', 'error');
          } finally {
            setDeletingBulk(false);
          }
        },
      });
    }
  };

  // Bật/tắt chọn một ảnh để xóa
  const toggleSelectDelete = (id) => {
    setSelectedDeleteIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Chọn hoặc bỏ chọn toàn bộ ảnh đang hiển thị
  const handleSelectAllSaved = () => {
    if (savedInvoices.length === 0) return;
    if (selectedDeleteIds.length === savedInvoices.length) {
      setSelectedDeleteIds([]);
    } else {
      setSelectedDeleteIds(savedInvoices.map((inv) => inv.id));
    }
  };

  // Mở modal xem phóng to ảnh hoặc video đã lưu (cho phép lướt qua lại giữa các tệp)
  const handleViewSavedImage = (invoice, index) => {
    if (imageViewerRef.current) {
      const viewerImages = savedInvoices.map((inv) => {
        const isVid = checkIsVideo(inv.imageUrl);
        return {
          id: inv.id,
          imageUrl: getFullImageUrl(inv.imageUrl),
          isVideo: isVid,
          title: inv.customer?.name || (isVid ? 'Video hóa đơn' : 'Ảnh hóa đơn'),
          subtitle: `Ngày: ${formatDate(inv.date)}`,
        };
      });

      const currentIsVid = checkIsVideo(invoice.imageUrl);
      imageViewerRef.current.open({
        images: viewerImages,
        initialIndex: index,
        title: invoice.customer?.name || (currentIsVid ? 'Video hóa đơn' : 'Ảnh hóa đơn'),
        subtitle: `Ngày: ${formatDate(invoice.date)}`,
        onDelete: () => handleDeleteSingleInvoice(invoice),
      });
    }
  };

  // Lưu toàn bộ danh sách ảnh & video hóa đơn lên máy chủ và Cloudinary
  const handleSubmit = async () => {
    if (imageList.length === 0) {
      showGlobalToast('Danh sách chưa có ảnh hoặc video hóa đơn nào.', 'warning');
      return;
    }

    // Kiểm tra từng ảnh đã có khách hàng chưa
    const missingCustomerIdx = imageList.findIndex((item) => !item.customerId);
    if (missingCustomerIdx !== -1) {
      showGlobalToast(
        `Tệp số #${missingCustomerIdx + 1} chưa được chọn khách hàng. Vui lòng chọn khách cho tất cả các tệp!`,
        'error'
      );
      return;
    }

    // ── ĐỐI CHIẾU CÔNG NỢ: kiểm tra từng khách + ngày có trong đơn nợ không ──
    try {
      // Tổng hợp danh sách duy nhất: { customerId, dateStr, customerName }
      const uniquePairs = [];
      const seen = new Set();
      for (const item of imageList) {
        const key = `${item.customerId}_${item.dateStr}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniquePairs.push({
            customerId: item.customerId,
            dateStr: item.dateStr || getTodayFormatted(),
            customerName: item.customerName || customers.find(c => c.id === item.customerId)?.name || item.customerId,
          });
        }
      }

      // Gọi API kiểm tra từng cặp khách + ngày
      const checkRes = await api.post('/transactions/check-debt-existence', {
        pairs: uniquePairs.map(p => ({
          customerId: p.customerId,
          date: parseDateString(p.dateStr),
        })),
      });

      const existenceMap = checkRes.data?.data || {}; // { "customerId_dateISO": true/false }

      // Tìm những cặp KHÔNG có công nợ trong ngày
      const missing = uniquePairs.filter(p => {
        const isoDate = parseDateString(p.dateStr).split('T')[0];
        const key = `${p.customerId}_${isoDate}`;
        return existenceMap[key] === false;
      });

      if (missing.length > 0) {
        // Hiển thị cảnh báo qua PopupModal yêu cầu xác nhận
        const missingNames = missing.map(m =>
          `• ${m.customerName} (${m.dateStr})`
        ).join('\n');

        await new Promise((resolve) => {
          popupModalRef?.current?.show({
            type: 'confirm',
            title: '⚠️ Có khách chưa có công nợ trong ngày!',
            message: `Các khách sau có ảnh/video nhưng CHƯA có đơn công nợ trong ngày tương ứng:\n\n${missingNames}\n\nBạn có muốn lưu ảnh trước và bổ sung công nợ sau không?`,
            confirmText: 'Lưu ảnh trước',
            cancelText: 'Hủy để bổ sung',
            onConfirm: () => resolve('proceed'),
            onCancel: () => resolve('cancel'),
          });
        }).then(async (decision) => {
          if (decision === 'cancel') return;
          await doSaveInvoices();
        });
        return;
      }
    } catch (checkErr) {
      // Nếu lỗi kiểm tra (network...) thì bỏ qua và tiếp tục lưu bình thường
      console.warn('[DEBT CHECK WARNING]', checkErr?.message);
    }

    // Không có cảnh báo → lưu trực tiếp
    await doSaveInvoices();
  };

  // Hàm thực thi lưu ảnh/video lên server sau khi đã xác nhận
  const doSaveInvoices = async () => {
    try {
      setSubmitting(true);

      const payload = {
        items: imageList.map((item) => ({
          customerId: item.customerId,
          date: parseDateString(item.dateStr),
          imageBase64: item.imageBase64,
          mediaType: item.mediaType || (checkIsVideo(item.imageBase64) ? 'video' : 'image'),
          note: null,
        })),
      };

      const res = await api.post('/transactions/invoices/batch', payload);

      showGlobalToast(
        res.data?.message || `Đã lưu thành công ${imageList.length} tệp hóa đơn và đính kèm đơn nợ!`,
        'success'
      );

      // Dọn sạch bản nháp sau khi đã lưu thành công lên máy chủ
      await clearInvoiceDraft();
      setDraftRestored(false);
      setDraftSaveStatus('idle');
      setImageList([]);
      setVisible(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      const msg = err.response?.data?.message || 'Có lỗi xảy ra khi lưu tệp hóa đơn. Vui lòng thử lại!';
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
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle} numberOfLines={1}>HÓA ĐƠN BÁN HÀNG</Text>
                <Text style={styles.headerSub} numberOfLines={1}>Tải ảnh & video hóa đơn Cloudinary hoặc quản lý tệp đã lưu</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Thanh chuyển đổi Tab: Đăng tải mới & Quản lý tệp đã lưu */}
          <View style={styles.tabNavRow}>
            <TouchableOpacity
              style={[styles.tabNavItem, activeTab === 'upload' && styles.tabNavItemActive]}
              onPress={() => handleChangeTab('upload')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabNavText, activeTab === 'upload' && styles.tabNavTextActive]} numberOfLines={1}>
                📤 Đăng tải mới (Ảnh / Video)
              </Text>
              {imageList.length > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{imageList.length}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavItem, activeTab === 'manage' && styles.tabNavItemActive]}
              onPress={() => handleChangeTab('manage')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabNavText, activeTab === 'manage' && styles.tabNavTextActive]} numberOfLines={1}>
                🗂️ Quản lý tệp đã lưu
              </Text>
              {savedInvoices.length > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: '#3B82F6' }]}>
                  <Text style={styles.tabBadgeText}>{savedInvoices.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* ======================================================== */}
          {/* TAB 1: ĐĂNG TẢI ẢNH & VIDEO MỚI */}
          {/* ======================================================== */}
          {activeTab === 'upload' && (
            <View style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Banner thông báo khôi phục bản nháp đang nhập dở */}
              {draftRestored && imageList.length > 0 && (
                <View style={styles.draftNoticeBanner}>
                  <View style={styles.draftNoticeLeft}>
                    <Text style={styles.draftNoticeIcon}>💾</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.draftNoticeTitle}>
                        Đã khôi phục dữ liệu đang nhập dở ({imageList.length} tệp)
                      </Text>
                      <Text style={styles.draftNoticeSub}>
                        {draftSavedTime ? `Bản nháp tự lưu lúc ${draftSavedTime}. ` : ''}Dữ liệu lưu an toàn trong bộ nhớ đệm, bạn có thể tiếp tục chỉnh sửa hoặc tải lên.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.draftNoticeRight}>
                    <TouchableOpacity
                      style={styles.draftDiscardBtn}
                      onPress={handleDiscardDraft}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.draftDiscardBtnText}>🗑️ Xóa bản nháp này</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Thanh công cụ thêm ảnh & video khi đã có tệp */}
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
                      <Text style={styles.compactPickBtnText}>📁 Chọn thêm ảnh/video</Text>
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

                  {/* Trạng thái tự động lưu bản nháp */}
                  {draftSaveStatus === 'saving' && (
                    <View style={styles.draftSaveBadge}>
                      <ActivityIndicator size="small" color="#D97706" style={{ transform: [{ scale: 0.7 }] }} />
                      <Text style={styles.draftSaveSavingText}>Đang lưu nháp...</Text>
                    </View>
                  )}
                  {draftSaveStatus === 'saved' && (
                    <View style={styles.draftSaveBadge}>
                      <Text style={styles.draftSaveSavedText}>✓ Đã tự lưu nháp</Text>
                    </View>
                  )}

                  <Text style={styles.hintCtrlV}>💡 Mẹo: Chọn video ngắn hoặc nhấn Ctrl+V để dán ảnh hóa đơn nhanh</Text>
                </View>
              )}

              {/* Input file ẩn phục vụ chọn tệp ảnh và video trên Web */}
              {Platform.OS === 'web' && (
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,.jpg,.jpeg,.png,.webp,.bmp,.heic,.jfif,.mp4,.mov,.webm,.m4v"
                  style={{ display: 'none' }}
                  onChange={handleFileInputChange}
                />
              )}

              {/* Thanh công cụ áp dụng nhanh cho tất cả (Chỉ hiện khi đã có tệp) */}
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

                    {/* Thu phóng ảnh chung */}
                    <View style={styles.batchControlCol}>
                      <Text style={styles.batchControlLabel}>Thu phóng ảnh:</Text>
                      <View style={styles.batchControlInputWrap}>
                        <View style={styles.batchZoomWrap}>
                          <TouchableOpacity
                            style={styles.batchZoomBtn}
                            onPress={() => setBatchScale((prev) => Math.max(1.0, Math.round((prev - 0.15) * 100) / 100))}
                            title="Giảm độ zoom (-)"
                            activeOpacity={0.7}
                          >
                            <Text style={styles.batchZoomBtnText}>−</Text>
                          </TouchableOpacity>
                          <View style={styles.batchZoomBadge}>
                            <Text style={styles.batchZoomBadgeText}>{Math.round(batchScale * 100)}%</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.batchZoomBtn}
                            onPress={() => setBatchScale((prev) => Math.min(3.0, Math.round((prev + 0.15) * 100) / 100))}
                            title="Tăng độ zoom (+)"
                            activeOpacity={0.7}
                          >
                            <Text style={styles.batchZoomBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          style={styles.applyBtn}
                          onPress={() => handleApplyBatchScale(batchScale)}
                          title="Áp dụng mức phóng to này cho toàn bộ ảnh"
                          activeOpacity={0.8}
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

              {/* Danh sách các ảnh/video hiển thị dạng lưới thoáng, to rõ ràng */}
              <ScrollView
                style={styles.imageListScroll}
                contentContainerStyle={styles.imageListContent}
                showsVerticalScrollIndicator={true}
              >
                {imageList.length === 0 ? (
                  <View style={styles.dropZoneBig}>
                    <Text style={styles.dropZoneIcon}>📸 🎬</Text>
                    <Text style={styles.dropZoneTitle}>Kéo thả ảnh hoặc video vào đây (hoặc dán Ctrl + V)</Text>
                    <Text style={styles.dropZoneSub}>
                      Hỗ trợ ảnh hóa đơn (JPG, PNG, WEBP) và video clip (MP4, MOV, WEBM) lưu trữ đám mây Cloudinary
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
                          <Text style={styles.pickFileBtnText}>📁 Chọn ảnh hoặc video từ máy tính</Text>
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
                      const isItemVid = item.mediaType === 'video' || checkIsVideo(item.imageBase64);

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
                            <View style={[styles.badgeIndex, isItemVid && { backgroundColor: '#7C3AED' }]}>
                              <Text style={styles.badgeIndexText}>
                                {isItemVid ? '🎬 Video' : '📷 Ảnh'} #{index + 1}
                              </Text>
                            </View>
                            {item.size ? (
                              <Text style={styles.fileSizeText}>{item.size}</Text>
                            ) : null}

                            <View style={{ flex: 1 }} />

                            <TouchableOpacity
                              style={styles.removeRowBtn}
                              onPress={() => removeRow(item.id)}
                              title="Xóa tệp này"
                            >
                              <Text style={styles.removeRowBtnText}>🗑️ Xóa</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Khung ảnh / video to chiếm phần lớn diện tích */}
                          {isItemVid ? (
                            <View style={styles.largeThumbnailWrap}>
                              {Platform.OS === 'web' ? (
                                <video
                                  src={item.imageBase64}
                                  controls
                                  style={styles.largeThumbnailImg}
                                />
                              ) : (
                                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ fontSize: 36 }}>🎬</Text>
                                  <Text style={{ color: '#FFFFFF', fontSize: 13, marginTop: 6 }}>Video hóa đơn</Text>
                                </View>
                              )}
                              <TouchableOpacity
                                style={styles.zoomBadge}
                                onPress={() => handlePreviewImage(item)}
                              >
                                <Text style={styles.zoomBadgeText}>🔍 Toàn màn hình</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View
                              style={styles.largeThumbnailWrap}
                              {...(Platform.OS === 'web'
                                ? {
                                    onWheel: (e) => handleWheelZoom(e, item.id),
                                  }
                                : {})}
                            >
                              <View
                                style={[
                                  styles.imageZoomWrapper,
                                  Platform.OS === 'web' && {
                                    cursor: (item.scale || 1.4) > 1.05 ? 'grab' : 'pointer',
                                    userSelect: 'none',
                                  },
                                ]}
                                {...(Platform.OS === 'web'
                                  ? {
                                      onMouseDown: (e) => handleItemMouseDown(e, item.id),
                                    }
                                  : {})}
                              >
                                <Image
                                  source={{ uri: item.imageBase64 }}
                                  style={[
                                    styles.largeThumbnailImg,
                                    {
                                      transform: [
                                        { scale: item.scale !== undefined ? item.scale : 1.4 },
                                        { translateX: item.offsetX || 0 },
                                        { translateY: item.offsetY || 0 },
                                      ],
                                    },
                                  ]}
                                  resizeMode="contain"
                                />
                              </View>

                              {/* Thanh điều khiển Thu/Phóng Zoom nhanh ngay trên ảnh */}
                              <View style={styles.cardZoomControls}>
                                <TouchableOpacity
                                  style={styles.zoomBtnMini}
                                  onPress={() => handleAdjustItemZoom(item.id, -0.15)}
                                  title="Thu nhỏ (-)"
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.zoomBtnMiniText}>−</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={styles.zoomLevelBadge}
                                  onPress={() => handleToggleItemZoom(item.id)}
                                  title="Bấm để chuyển đổi giữa 100% và 140%"
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.zoomLevelBadgeText}>
                                    {Math.round((item.scale !== undefined ? item.scale : 1.4) * 100)}%
                                  </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={styles.zoomBtnMini}
                                  onPress={() => handleAdjustItemZoom(item.id, 0.15)}
                                  title="Phóng to (+)"
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.zoomBtnMiniText}>+</Text>
                                </TouchableOpacity>

                                {(item.scale > 1.05 || item.offsetX !== 0 || item.offsetY !== 0) && (
                                  <TouchableOpacity
                                    style={styles.zoomResetMini}
                                    onPress={() => handleResetItemZoom(item.id)}
                                    title="Đặt lại vị trí tâm và mức zoom 140%"
                                    activeOpacity={0.75}
                                  >
                                    <Text style={styles.zoomResetMiniText}>↺</Text>
                                  </TouchableOpacity>
                                )}
                              </View>

                              {/* Nút Xem Phóng To Toàn Màn Hình */}
                              <TouchableOpacity
                                style={styles.zoomBadge}
                                onPress={() => handlePreviewImage(item)}
                                activeOpacity={0.8}
                                title="Bấm để xem phóng to chi tiết toàn màn hình"
                              >
                                <Text style={styles.zoomBadgeText}>🔍 Phóng to</Text>
                              </TouchableOpacity>
                            </View>
                          )}

                          {/* Cấu hình Khách & Ngày */}
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

              {/* Footer nút hành động cho Tab Tải ảnh */}
              <View style={[styles.footer, isMobile && styles.footerMobile]}>
                <View style={[styles.footerSummary, isMobile && styles.footerSummaryMobile]}>
                  <Text style={[styles.footerSummaryText, isMobile && { fontSize: 12, textAlign: 'center' }]}>
                    Tổng số: <Text style={{ fontWeight: 'bold' }}>{imageList.length}</Text> tệp (
                    {imageList.filter((i) => i.mediaType === 'video').length > 0
                      ? `${imageList.filter((i) => i.mediaType !== 'video').length} ảnh, ${imageList.filter((i) => i.mediaType === 'video').length} video`
                      : `${imageList.length} ảnh`}
                    ) | Đã chọn khách: <Text style={{ fontWeight: 'bold', color: '#10B981' }}>{validCount}</Text>/{imageList.length}
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
          )}

          {/* ======================================================== */}
          {/* TAB 2: QUẢN LÝ ẢNH HÓA ĐƠN ĐÃ LƯU */}
          {/* ======================================================== */}
          {activeTab === 'manage' && (
            <View style={styles.manageContainer}>
              {/* Thanh Bộ Lọc & Tìm Kiếm Tinh Gọn */}
              <View
                style={[
                  styles.manageFilterSection,
                  manageFilterCustomerOpen && { zIndex: 999999, elevation: 999999 },
                ]}
              >
                {/* HÀNG 1: Ô Tìm kiếm + Chọn Nhà Hàng (Chia 2 cột cân xứng) */}
                <View style={styles.manageFilterRow1}>
                  {/* Ô tìm kiếm từ khóa */}
                  <View style={styles.searchBoxInner}>
                    <Text style={styles.searchIcon}>🔍</Text>
                    <TextInput
                      style={styles.searchTextInput}
                      value={filterSearch}
                      onChangeText={setFilterSearch}
                      placeholder="Tìm tên khách, SĐT..."
                      placeholderTextColor="#94A3B8"
                      onSubmitEditing={handleSearchSubmit}
                      returnKeyType="search"
                    />
                    {filterSearch ? (
                      <TouchableOpacity
                        style={styles.clearSearchBtn}
                        onPress={() => {
                          setFilterSearch('');
                          fetchSavedInvoices({ search: '' });
                        }}
                      >
                        <Text style={styles.clearSearchText}>✕</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {/* Chọn nhà hàng / khách hàng */}
                  <View
                    style={[
                      styles.customerFilterWrap,
                      manageFilterCustomerOpen && { zIndex: 999999 },
                    ]}
                  >
                    <CustomSelect
                      value={filterCustomer}
                      options={[{ id: '', name: '🏢 Tất cả nhà hàng' }, ...customers]}
                      placeholder="-- Tất cả nhà hàng --"
                      renderSelected={(c) => c?.name || '🏢 Tất cả nhà hàng'}
                      getOptionLabel={(c) => c?.name || ''}
                      onSelect={(c) => {
                        const val = c?.id ? c : null;
                        setFilterCustomer(val);
                        fetchSavedInvoices({ customerId: val?.id || '' });
                      }}
                      onOpenChange={(isOpen) => setManageFilterCustomerOpen(isOpen)}
                      zIndex={999999}
                      compact={true}
                    />
                  </View>
                </View>

                {/* HÀNG 2: Khoảng thời gian (Từ -> Đến) + Nút Lọc & Đặt lại (Cùng 1 dòng liền mạch) */}
                <View style={styles.manageFilterRow2}>
                  <View style={styles.dateRangeGroup}>
                    <Text style={styles.dateRangeLabel}>Từ</Text>
                    <View style={styles.dateInputWrap}>
                      <DatePickerInput
                        value={filterFromDate}
                        onChange={(d) => {
                          setFilterFromDate(d);
                          setFilterPreset('');
                        }}
                        compact={true}
                      />
                    </View>
                    <Text style={styles.dateRangeArrow}>→</Text>
                    <Text style={styles.dateRangeLabel}>Đến</Text>
                    <View style={styles.dateInputWrap}>
                      <DatePickerInput
                        value={filterToDate}
                        onChange={(d) => {
                          setFilterToDate(d);
                          setFilterPreset('');
                        }}
                        compact={true}
                      />
                    </View>
                  </View>

                  <View style={styles.filterBtnGroup}>
                    <TouchableOpacity
                      style={styles.searchSubmitBtn}
                      onPress={handleSearchSubmit}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.searchSubmitBtnText}>Lọc</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.resetFilterBtn}
                      onPress={handleResetFilters}
                      activeOpacity={0.85}
                      title="Đặt lại bộ lọc"
                    >
                      <Text style={styles.resetFilterBtnText}>🔄</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* HÀNG 3: Mốc nhanh (Presets) dạng dải cuộn ngang mượt mà */}
                <View style={styles.presetsRowWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.presetsScrollContent}
                  >
                    {[
                      { key: 'all', label: 'Tất cả' },
                      { key: 'today', label: 'Hôm nay' },
                      { key: 'last_7_days', label: '7 ngày qua' },
                      { key: 'this_month', label: 'Tháng này' },
                      { key: 'last_month', label: 'Tháng trước' },
                    ].map((p) => {
                      const isActive =
                        filterPreset === p.key ||
                        (!filterPreset && p.key === 'all' && !filterFromDate && !filterToDate);
                      return (
                        <TouchableOpacity
                          key={p.key}
                          style={[styles.presetChip, isActive && styles.presetChipActive]}
                          onPress={() => handleApplyPreset(p.key)}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[styles.presetChipText, isActive && styles.presetChipTextActive]}
                          >
                            {p.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {/* Thanh thao tác hàng loạt (Bulk Bar) */}
              <View style={styles.manageActionBar}>
                <View style={styles.manageActionLeft}>
                  <TouchableOpacity
                    style={styles.selectAllBtn}
                    onPress={handleSelectAllSaved}
                    activeOpacity={0.7}
                    disabled={savedInvoices.length === 0}
                  >
                    <View
                      style={[
                        styles.checkboxBox,
                        savedInvoices.length > 0 &&
                          selectedDeleteIds.length === savedInvoices.length &&
                          styles.checkboxBoxChecked,
                      ]}
                    >
                      {savedInvoices.length > 0 &&
                        selectedDeleteIds.length === savedInvoices.length && (
                          <Text style={styles.checkmark}>✓</Text>
                        )}
                    </View>
                    <Text style={styles.selectAllText}>
                      {savedInvoices.length > 0 &&
                      selectedDeleteIds.length === savedInvoices.length
                        ? 'Bỏ chọn tất cả'
                        : 'Chọn tất cả'}
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.savedCountText}>
                    Tổng số: <Text style={{ fontWeight: 'bold' }}>{savedInvoices.length}</Text> ảnh
                    {selectedDeleteIds.length > 0 && (
                      <Text style={{ color: '#DC2626', fontWeight: 'bold' }}>
                        {' '}(Đã chọn {selectedDeleteIds.length})
                      </Text>
                    )}
                  </Text>
                </View>

                {selectedDeleteIds.length > 0 && (
                  <TouchableOpacity
                    style={styles.bulkDeleteBtn}
                    onPress={handleDeleteBulkInvoices}
                    disabled={deletingBulk}
                    activeOpacity={0.85}
                  >
                    {deletingBulk ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.bulkDeleteBtnText}>
                        🗑️ Xóa {selectedDeleteIds.length} ảnh đã chọn
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Lưới danh sách ảnh hóa đơn đã lưu */}
              <ScrollView
                style={styles.savedScroll}
                contentContainerStyle={styles.savedScrollContent}
                showsVerticalScrollIndicator={true}
              >
                {loadingSaved ? (
                  <View style={styles.loadingSavedWrap}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.loadingSavedText}>Đang tải danh sách ảnh hóa đơn...</Text>
                  </View>
                ) : savedInvoices.length === 0 ? (
                  <View style={styles.emptySavedWrap}>
                    <Text style={styles.emptySavedIcon}>📭</Text>
                    <Text style={styles.emptySavedTitle}>Không tìm thấy ảnh hóa đơn nào</Text>
                    <Text style={styles.emptySavedSub}>
                      Không có ảnh hóa đơn nào phù hợp với bộ lọc ngày hoặc từ khóa tìm kiếm.
                    </Text>
                    <TouchableOpacity
                      style={styles.emptyResetBtn}
                      onPress={handleResetFilters}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.emptyResetBtnText}>🔄 Xem toàn bộ ảnh</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.savedGrid}>
                    {savedInvoices.map((inv, index) => {
                      const isSelected = selectedDeleteIds.includes(inv.id);
                      const fullUrl = getFullImageUrl(inv.imageUrl);
                      const custName = inv.customer?.name || 'Chưa gắn khách';
                      const custPhone = inv.customer?.phone || '';
                      const isVideoItem = checkIsVideo(inv.imageUrl);

                      return (
                        <View
                          key={inv.id}
                          style={[
                            styles.savedCard,
                            isSelected && styles.savedCardSelected,
                          ]}
                        >
                          {/* Card Header: Checkbox + Khách + Huy hiệu Media + Nút xóa */}
                          <View style={styles.savedCardHeader}>
                            <TouchableOpacity
                              style={styles.cardCheckboxWrap}
                              onPress={() => toggleSelectDelete(inv.id)}
                              activeOpacity={0.7}
                            >
                              <View
                                style={[
                                  styles.checkboxBox,
                                  isSelected && styles.checkboxBoxChecked,
                                ]}
                              >
                                {isSelected && <Text style={styles.checkmark}>✓</Text>}
                              </View>
                            </TouchableOpacity>

                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.savedCustName} numberOfLines={1}>
                                  🏪 {custName}
                                </Text>
                                <View style={[styles.miniMediaBadge, isVideoItem ? styles.miniMediaVideo : styles.miniMediaImage]}>
                                  <Text style={styles.miniMediaText}>
                                    {isVideoItem ? '🎬 Video' : '📷 Ảnh'}
                                  </Text>
                                </View>
                              </View>
                              {custPhone ? (
                                <Text style={styles.savedCustPhone}>📞 {custPhone}</Text>
                              ) : null}
                            </View>

                            <TouchableOpacity
                              style={styles.deleteSingleBtn}
                              onPress={() => handleDeleteSingleInvoice(inv)}
                              title="Xóa tệp này"
                              activeOpacity={0.7}
                            >
                              <Text style={styles.deleteSingleBtnText}>🗑️ Xóa</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Khung ảnh / video Thumbnail */}
                          <TouchableOpacity
                            style={styles.savedThumbnailWrap}
                            onPress={() => handleViewSavedImage(inv, index)}
                            activeOpacity={0.88}
                            title={isVideoItem ? 'Bấm để phát video toàn màn hình' : 'Bấm để phóng to xem chi tiết'}
                          >
                            {isVideoItem ? (
                              Platform.OS === 'web' ? (
                                <video
                                  src={fullUrl}
                                  preload="metadata"
                                  style={styles.savedThumbnailImg}
                                />
                              ) : (
                                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ fontSize: 32 }}>🎬</Text>
                                  <Text style={{ color: '#FFFFFF', fontSize: 11, marginTop: 4 }}>Video hóa đơn</Text>
                                </View>
                              )
                            ) : (
                              <Image
                                source={{ uri: fullUrl }}
                                style={[styles.savedThumbnailImg, { transform: [{ scale: 1.25 }] }]}
                                resizeMode="contain"
                              />
                            )}
                            <View style={styles.zoomBadge}>
                              <Text style={styles.zoomBadgeText}>
                                {isVideoItem ? '▶️ Phát video' : '🔍 Phóng to'}
                              </Text>
                            </View>
                          </TouchableOpacity>

                          {/* Card Footer: Ngày & Chi tiết đơn nợ */}
                          <View style={styles.savedCardFooter}>
                            <View style={styles.savedCardDateBadge}>
                              <Text style={styles.savedCardDateText}>
                                📅 {formatDate(inv.date)}
                              </Text>
                            </View>

                            {inv.transaction && (
                              <View style={styles.savedCardDebtBadge}>
                                <Text style={styles.savedCardDebtText}>
                                  🧾 Đơn: {formatCurrency(inv.transaction.totalAmount)}
                                </Text>
                              </View>
                            )}

                            <View style={{ flex: 1 }} />

                            <TouchableOpacity
                              style={styles.viewDetailBtn}
                              onPress={() => handleViewSavedImage(inv, index)}
                              activeOpacity={0.75}
                            >
                              <Text style={styles.viewDetailBtnText}>
                                {isVideoItem ? '▶️ Phát' : 'Xem ảnh'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>

              {/* Footer cho Tab Quản Lý */}
              <View style={[styles.footer, isMobile && styles.footerMobile]}>
                <View style={[styles.footerSummary, isMobile && styles.footerSummaryMobile]}>
                  <Text style={[styles.footerSummaryText, isMobile && { fontSize: 12, textAlign: 'center' }]}>
                    Tổng số: <Text style={{ fontWeight: 'bold' }}>{savedInvoices.length}</Text> ảnh |
                    Đã chọn: <Text style={{ fontWeight: 'bold', color: '#DC2626' }}>{selectedDeleteIds.length}</Text> ảnh
                  </Text>
                </View>

                <View style={[styles.footerBtnsRow, isMobile && styles.footerBtnsRowMobile]}>
                  <TouchableOpacity
                    style={[styles.cancelBtn, isMobile && { flex: 1, alignItems: 'center' }]}
                    onPress={() => setVisible(false)}
                  >
                    <Text style={styles.cancelBtnText}>Đóng</Text>
                  </TouchableOpacity>

                  {selectedDeleteIds.length > 0 && (
                    <TouchableOpacity
                      style={[
                        styles.bulkDeleteFooterBtn,
                        isMobile && { flex: 1.8, alignItems: 'center', justifyContent: 'center' },
                      ]}
                      onPress={handleDeleteBulkInvoices}
                      disabled={deletingBulk}
                    >
                      {deletingBulk ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={[styles.bulkDeleteFooterBtnText, isMobile && { fontSize: 12 }]}>
                          🗑️ Xóa {selectedDeleteIds.length} ảnh đã chọn
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
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
    overflow: 'hidden',
    maxWidth: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    width: '100%',
    maxWidth: '100%',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerIcon: {
    fontSize: 18,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 11,
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
    flexShrink: 0,
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
    margin: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingVertical: 36,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  dropZoneIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  dropZoneTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
    textAlign: 'center',
  },
  dropZoneSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 18,
    maxWidth: 380,
  },
  dropZoneActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    width: '100%',
  },
  pickFileBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  pickFileBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  pasteBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  pasteBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
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
    height: 380, // Tăng chiều cao lên 380 để không gian hiển thị hóa đơn rộng rãi, rõ chữ
    backgroundColor: '#0F172A',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageZoomWrapper: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  largeThumbnailImg: {
    width: '100%',
    height: '100%',
  },
  cardZoomControls: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 10,
  },
  zoomBtnMini: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnMiniText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  zoomLevelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  zoomLevelBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  zoomResetMini: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomResetMiniText: {
    color: '#FCD34D',
    fontSize: 12,
    fontWeight: 'bold',
  },
  batchZoomWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  batchZoomBtn: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  batchZoomBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: 'bold',
  },
  batchZoomBadge: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchZoomBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 10,
    width: '100%',
    maxWidth: '100%',
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
    gap: 8,
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
  // Styles cho thanh điều hướng Tab
  tabNavRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 10,
    gap: 6,
    width: '100%',
    maxWidth: '100%',
  },
  tabNavItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  tabNavItemActive: {
    borderBottomColor: '#2563EB',
    backgroundColor: '#FFFFFF',
  },
  tabNavText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  tabNavTextActive: {
    color: '#2563EB',
    fontWeight: '800',
  },
  tabBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // Styles cho Tab Quản Lý Ảnh Đã Lưu
  manageContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#F1F5F9',
  },
  manageFilterSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
    zIndex: 10,
  },
  manageFilterRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  searchBoxInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 36,
  },
  searchIcon: {
    fontSize: 12,
    marginRight: 6,
    opacity: 0.7,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    outlineStyle: 'none',
    padding: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  customerFilterWrap: {
    flex: 1.1,
    minWidth: 140,
  },
  manageFilterRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
  },
  dateRangeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  dateRangeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  dateInputWrap: {
    flex: 1,
    minWidth: 95,
  },
  dateRangeArrow: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  filterBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchSubmitBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  searchSubmitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  resetFilterBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    width: 34,
    height: 34,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetFilterBtnText: {
    fontSize: 13,
    color: '#475569',
  },
  presetsRowWrap: {
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  presetsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  presetChipText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },

  // Action Bar ở Tab Quản Lý
  manageActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
    flexWrap: 'wrap',
  },
  manageActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    lineHeight: 14,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  savedCountText: {
    fontSize: 13,
    color: '#475569',
  },
  bulkDeleteBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bulkDeleteBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },

  // Danh sách ảnh đã lưu
  savedScroll: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  savedScrollContent: {
    padding: 16,
  },
  loadingSavedWrap: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingSavedText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  emptySavedWrap: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptySavedIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  emptySavedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  emptySavedSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 360,
    marginBottom: 12,
  },
  emptyResetBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  emptyResetBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  savedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'flex-start',
  },
  savedCard: {
    flex: 1,
    minWidth: 280,
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 10,
    gap: 8,
    ...SHADOWS.small,
  },
  savedCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  savedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardCheckboxWrap: {
    padding: 4,
  },
  savedCustName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  savedCustPhone: {
    fontSize: 11,
    color: '#64748B',
  },
  deleteSingleBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  deleteSingleBtnText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  savedThumbnailWrap: {
    width: '100%',
    height: 260, // Tăng từ 220 lên 260 để nội dung hóa đơn hiển thị to rõ ràng
    backgroundColor: '#0F172A',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  savedThumbnailImg: {
    width: '100%',
    height: '100%',
  },
  savedCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  savedCardDateBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  savedCardDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  savedCardDebtBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  savedCardDebtText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  viewDetailBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  viewDetailBtnText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '700',
  },
  bulkDeleteFooterBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bulkDeleteFooterBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // Banner thông báo khôi phục bản nháp
  draftNoticeBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  draftNoticeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 240,
  },
  draftNoticeIcon: {
    fontSize: 20,
  },
  draftNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  draftNoticeSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  draftNoticeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  draftDiscardBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  draftDiscardBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Huy hiệu hiển thị trạng thái tự động lưu bản nháp
  draftSaveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  draftSaveSavingText: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
  },
  draftSaveSavedText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },

  // Huy hiệu phân biệt Video / Ảnh nhỏ trên thẻ Card
  miniMediaBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  miniMediaVideo: {
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#D8B4FE',
  },
  miniMediaImage: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  miniMediaText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B21A8',
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
