// meat-management-fe/src/components/PortalDebtActionModal.js
// Modal thao tác chỉnh sửa & thu công nợ trực tiếp từ Zalo Portal có bảo mật bằng mã PIN
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
import axios from 'axios';
import SmoothModal from './SmoothModal';
import CustomSelect from './CustomSelect';
import DatePickerInput from './DatePickerInput';
import MoneyInput from './MoneyInput';
import PopupModal from './PopupModal';
import { showGlobalToast } from '../store/toastStore';
import { COLORS } from '../theme';

// Định dạng tiền tệ VNĐ
const formatCurrency = (val) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(val || 0)
    .replace('₫', 'đ');

const formatNumber = (val) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(val || 0));

// Chuyển chuỗi DD/MM/YYYY thành Date object
const parseDDMMYYYY = (str) => {
  if (!str) return new Date();
  const parts = str.split('/');
  if (parts.length !== 3) return new Date();
  const [d, m, y] = parts.map(Number);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0);
};

// Lấy ngày hôm nay định dạng DD/MM/YYYY
const getTodayString = () => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Lấy ngày hôm qua định dạng DD/MM/YYYY
const getYesterdayString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Chuyển date bất kỳ thành DD/MM/YYYY
const toDateKey = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Lấy thứ trong tuần
const getWeekdayName = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const weekdays = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return weekdays[d.getDay()];
};

const PortalDebtActionModal = forwardRef(({ token, apiHost, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [actionToken, setActionToken] = useState(null);

  // Trạng thái nhập mã PIN
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);

  // Tab điều hướng: 'COLLECT' (Thu nợ) | 'CREATE' (Ghi nợ) | 'HISTORY' (Lịch sử & Sửa)
  const [activeTab, setActiveTab] = useState('COLLECT');
  const [dataLoading, setDataLoading] = useState(false);

  // Dữ liệu từ API bootstrap
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customPrices, setCustomPrices] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [recentPayments, setRecentPayments] = useState([]);

  // Form Thu nợ
  const [collectCustomerId, setCollectCustomerId] = useState('');
  const [collectAmount, setCollectAmount] = useState(0);
  const [collectDate, setCollectDate] = useState(getTodayString());
  const [collectNote, setCollectNote] = useState('');
  const [collectSubmitting, setCollectSubmitting] = useState(false);
  const [collectMode, setCollectMode] = useState('AMOUNT'); // 'AMOUNT' | 'BY_DAY'
  const [selectedDayKeys, setSelectedDayKeys] = useState([]);

  // Form Ghi nợ mới
  const [createCustomerId, setCreateCustomerId] = useState('');
  const [createDate, setCreateDate] = useState(getTodayString());
  const [createNote, setCreateNote] = useState('');
  const [createMode, setCreateMode] = useState('DETAIL'); // 'DETAIL' | 'QUICK'
  const [quickProductName, setQuickProductName] = useState('Tiền hàng');
  const [quickDebtAmount, setQuickDebtAmount] = useState(0);
  const [cartItems, setCartItems] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productQty, setProductQty] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [invoiceImage, setInvoiceImage] = useState(null); // Data URL base64 ảnh hóa đơn
  const invoiceFileInputRef = useRef(null);

  // Chỉnh sửa đơn nợ
  const [editingTx, setEditingTx] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [historyFilterDate, setHistoryFilterDate] = useState('');

  // Dropdown zIndex control
  const [activeSelect, setActiveSelect] = useState(null);

  const popupRef = useRef(null);

  // Đọc actionToken đã lưu từ SessionStorage nếu có
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && token) {
      const saved = window.sessionStorage.getItem(`portal_debt_action_${token}`);
      if (saved) {
        setActionToken(saved);
        setIsUnlocked(true);
      }
    }
  }, [token]);

  // Phơi bày phương thức điều khiển qua ref
  useImperativeHandle(ref, () => ({
    open: (options = {}) => {
      setVisible(true);
      setPinError('');
      setPinInput('');
      setSelectedDayKeys([]);
      setInvoiceImage(null);
      if (options.tab) {
        setActiveTab(options.tab);
      }
      if (actionToken || (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage.getItem(`portal_debt_action_${token}`))) {
        const tok = actionToken || window.sessionStorage.getItem(`portal_debt_action_${token}`);
        setActionToken(tok);
        setIsUnlocked(true);
        fetchBootstrapData(tok, options.defaultCustomerId);
      } else {
        setIsUnlocked(false);
      }
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Xác thực mã PIN bảo mật chủ buôn
  const handleVerifyPin = async () => {
    if (!pinInput.trim()) {
      setPinError('Vui lòng nhập mã PIN bảo mật.');
      return;
    }

    try {
      setPinSubmitting(true);
      setPinError('');
      const res = await axios.post(`${apiHost}/api/v1/portal/debt-action/verify-pin/${token}`, {
        pin: pinInput.trim(),
      });

      const tok = res.data?.actionToken;
      setActionToken(tok);
      setIsUnlocked(true);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.sessionStorage.setItem(`portal_debt_action_${token}`, tok);
      }
      showGlobalToast('Xác thực mã PIN thành công!', 'success');
      fetchBootstrapData(tok);
    } catch (err) {
      setPinError(err.response?.data?.message || 'Mã PIN bảo mật không chính xác. Vui lòng thử lại.');
    } finally {
      setPinSubmitting(false);
    }
  };

  // Tải dữ liệu bootstrap phục vụ thao tác công nợ
  const fetchBootstrapData = async (tok, defaultCustId = null) => {
    try {
      setDataLoading(true);
      const res = await axios.get(`${apiHost}/api/v1/portal/debt-action/bootstrap/${token}`, {
        headers: {
          'x-portal-action-token': tok || actionToken,
        },
      });

      const data = res.data?.data || {};
      setCustomers(data.customers || []);
      setProducts(data.products || []);
      setCustomPrices(data.customPrices || []);
      setRecentTransactions(data.recentTransactions || []);
      setRecentPayments(data.recentPayments || []);

      const initialCust = defaultCustId || data.customers?.[0]?.id || '';
      if (!collectCustomerId) setCollectCustomerId(initialCust);
      if (!createCustomerId) setCreateCustomerId(initialCust);
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu thao tác công nợ:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setIsUnlocked(false);
        setActionToken(null);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.sessionStorage.removeItem(`portal_debt_action_${token}`);
        }
      }
    } finally {
      setDataLoading(false);
    }
  };

  // Tìm đơn giá riêng của khách cho một mặt hàng (Bảo toàn đơn giá riêng)
  const getProductPriceForCustomer = (productId, custId) => {
    if (!productId || !custId) return 0;
    const cp = customPrices.find(
      (p) => p.productId === productId && p.customerId === custId
    );
    if (cp && cp.price != null) return Number(cp.price);
    const prod = products.find((p) => p.id === productId);
    return prod ? Number(prod.defaultPrice || 0) : 0;
  };

  // Xử lý khi chọn sản phẩm ở form Ghi nợ mới
  const handleSelectProduct = (prod) => {
    setSelectedProduct(prod);
    if (prod) {
      const price = getProductPriceForCustomer(prod.id, createCustomerId);
      setProductPrice(price ? String(price) : '');
    } else {
      setProductPrice('');
    }
  };

  // Thêm một mặt hàng vào giỏ nợ
  const handleAddToCart = () => {
    if (!selectedProduct) {
      showGlobalToast('Vui lòng chọn loại thịt.', 'warning');
      return;
    }
    const qty = parseFloat(productQty.replace(',', '.'));
    if (isNaN(qty) || qty <= 0) {
      showGlobalToast('Số lượng/số cân (kg) phải lớn hơn 0.', 'warning');
      return;
    }
    const prc = parseFloat(String(productPrice).replace(/[^0-9]/g, ''));
    if (isNaN(prc) || prc <= 0) {
      showGlobalToast('Đơn giá phải lớn hơn 0.', 'warning');
      return;
    }

    const subtotal = Math.round(qty * prc);
    const newItem = {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      quantity: qty,
      price: prc,
      costPrice: selectedProduct.costPrice || 0,
      amount: subtotal,
    };

    setCartItems([...cartItems, newItem]);
    setSelectedProduct(null);
    setProductQty('');
    setProductPrice('');
  };

  const handleRemoveCartItem = (idx) => {
    setCartItems(cartItems.filter((_, i) => i !== idx));
  };

  // Tính tổng tiền các món trong giỏ
  const totalCartAmount = useMemo(() => {
    return cartItems.reduce((sum, it) => sum + (it.amount || 0), 0);
  }, [cartItems]);

  // Tìm khách hàng đang chọn ở form Thu nợ
  const currentCollectCustomer = useMemo(() => {
    return customers.find((c) => c.id === collectCustomerId) || customers[0] || null;
  }, [customers, collectCustomerId]);

  // Danh sách các ngày nợ của khách hàng đang chọn
  const unpaidDays = useMemo(() => {
    return currentCollectCustomer?.unpaidDays || [];
  }, [currentCollectCustomer]);

  // Tổng tiền nợ của các ngày đã chọn
  const selectedDaysTotalAmount = useMemo(() => {
    return unpaidDays
      .filter((d) => selectedDayKeys.includes(d.dateKey))
      .reduce((sum, d) => sum + (d.remainingDebt || 0), 0);
  }, [unpaidDays, selectedDayKeys]);

  // Gom nhóm các đơn nợ theo từng ngày kèm hỗ trợ bộ lọc ngày
  const groupedTransactionsByDay = useMemo(() => {
    const filtered = recentTransactions.filter((tx) => {
      if (!historyFilterDate) return true;
      return toDateKey(tx.date) === historyFilterDate;
    });

    const map = new Map();
    filtered.forEach((tx) => {
      const key = toDateKey(tx.date);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          dateKey: key,
          rawDate: tx.date,
          weekday: getWeekdayName(tx.date),
          totalAmount: 0,
          transactions: [],
        });
      }
      const group = map.get(key);
      group.totalAmount += Number(tx.totalAmount || 0);
      group.transactions.push(tx);
    });

    return Array.from(map.values()).sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));
  }, [recentTransactions, historyFilterDate]);

  // Lọc danh sách phiếu thu theo ngày
  const filteredPayments = useMemo(() => {
    if (!historyFilterDate) return recentPayments;
    return recentPayments.filter((pm) => toDateKey(pm.paidAt) === historyFilterDate);
  }, [recentPayments, historyFilterDate]);

  // Chọn hoặc bỏ chọn một ngày nợ
  const handleToggleSelectDay = (dateKey) => {
    setSelectedDayKeys((prev) =>
      prev.includes(dateKey) ? prev.filter((k) => k !== dateKey) : [...prev, dateKey]
    );
  };

  // Chọn hoặc bỏ chọn toàn bộ ngày nợ
  const handleSelectAllDays = () => {
    if (selectedDayKeys.length === unpaidDays.length) {
      setSelectedDayKeys([]);
    } else {
      setSelectedDayKeys(unpaidDays.map((d) => d.dateKey));
    }
  };

  // Xử lý nộp form Thu nợ (hỗ trợ cả thu theo số tiền và thu theo ngày)
  const handleSubmitCollect = async () => {
    if (!collectCustomerId) {
      showGlobalToast('Vui lòng chọn khách hàng cần thu nợ.', 'warning');
      return;
    }

    // ─── THU NỢ THEO NGÀY ───
    if (collectMode === 'BY_DAY') {
      if (selectedDayKeys.length === 0) {
        showGlobalToast('Vui lòng chọn ít nhất một ngày nợ để thanh toán.', 'warning');
        return;
      }

      const selectedDays = unpaidDays.filter((d) => selectedDayKeys.includes(d.dateKey));
      const paidDateObj = parseDDMMYYYY(collectDate);
      const paymentsPayload = selectedDays.map((d) => ({
        amount: d.remainingDebt,
        paidAt: paidDateObj.toISOString(),
        note: `Thanh toán nợ ngày ${d.dateKey}${collectNote.trim() ? ' - ' + collectNote.trim() : ''}`,
      }));

      try {
        setCollectSubmitting(true);
        await axios.post(
          `${apiHost}/api/v1/portal/debt-action/collect-debt/${token}`,
          {
            customerId: collectCustomerId,
            payments: paymentsPayload,
          },
          {
            headers: { 'x-portal-action-token': actionToken },
          }
        );

        showGlobalToast(`Đã thu nợ thành công cho ${selectedDays.length} ngày!`, 'success');
        setSelectedDayKeys([]);
        setCollectNote('');
        fetchBootstrapData(actionToken);
        if (onRefresh) onRefresh();
      } catch (err) {
        console.error('Lỗi khi thu nợ theo ngày:', err);
        showGlobalToast(err.response?.data?.message || 'Không thể thu tiền công nợ theo ngày.', 'error');
      } finally {
        setCollectSubmitting(false);
      }
      return;
    }

    // ─── THU NỢ THEO SỐ TIỀN CỤ THỂ ───
    if (!collectAmount || collectAmount <= 0) {
      showGlobalToast('Vui lòng nhập số tiền thanh toán lớn hơn 0.', 'warning');
      return;
    }

    try {
      setCollectSubmitting(true);
      const paidDateObj = parseDDMMYYYY(collectDate);
      await axios.post(
        `${apiHost}/api/v1/portal/debt-action/collect-debt/${token}`,
        {
          customerId: collectCustomerId,
          amount: collectAmount,
          paidAt: paidDateObj.toISOString(),
          note: collectNote ? collectNote.trim() : null,
        },
        {
          headers: { 'x-portal-action-token': actionToken },
        }
      );

      showGlobalToast('Đã ghi nhận thu tiền công nợ thành công!', 'success');
      setCollectAmount(0);
      setCollectNote('');
      fetchBootstrapData(actionToken);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Lỗi khi thu nợ:', err);
      showGlobalToast(err.response?.data?.message || 'Không thể thu tiền công nợ.', 'error');
    } finally {
      setCollectSubmitting(false);
    }
  };

  // Xử lý mở trình chọn file ảnh hóa đơn
  const handlePickInvoiceImage = () => {
    if (Platform.OS === 'web' && invoiceFileInputRef.current) {
      invoiceFileInputRef.current.click();
    }
  };

  // Đọc file ảnh từ thiết bị
  const handleInvoiceFileChange = (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      showGlobalToast('Vui lòng chỉ chọn tệp hình ảnh (JPG, PNG, WebP).', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result;
      if (result) {
        setInvoiceImage(result);
        showGlobalToast('Đã chọn ảnh hóa đơn!', 'info');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Xóa ảnh hóa đơn đã chọn
  const handleRemoveInvoiceImage = () => {
    setInvoiceImage(null);
  };

  // Xử lý nộp form Ghi nợ mới
  const handleSubmitCreateDebt = async () => {
    if (!createCustomerId) {
      showGlobalToast('Vui lòng chọn khách hàng.', 'warning');
      return;
    }

    const txDateObj = parseDDMMYYYY(createDate);

    // ─── DẠNG 1: GHI NỢ NHANH (TIỀN HÀNG) ───
    if (createMode === 'QUICK') {
      if (!quickDebtAmount || quickDebtAmount <= 0) {
        showGlobalToast('Vui lòng nhập số tiền nợ lớn hơn 0.', 'warning');
        return;
      }

      try {
        setCreateSubmitting(true);
        await axios.post(
          `${apiHost}/api/v1/portal/debt-action/create-debt/${token}`,
          {
            customerId: createCustomerId,
            date: txDateObj.toISOString(),
            note: createNote ? createNote.trim() : null,
            invoiceImage: invoiceImage || null,
            items: [
              {
                productName: quickProductName.trim() || 'Tiền hàng',
                quantity: 1,
                price: quickDebtAmount,
                costPrice: 0,
              },
            ],
          },
          {
            headers: { 'x-portal-action-token': actionToken },
          }
        );

        showGlobalToast('Đã lưu đơn nợ nhanh thành công!', 'success');
        setQuickDebtAmount(0);
        setCreateNote('');
        setInvoiceImage(null);
        fetchBootstrapData(actionToken);
        if (onRefresh) onRefresh();
      } catch (err) {
        console.error('Lỗi khi tạo đơn nợ nhanh:', err);
        showGlobalToast(err.response?.data?.message || 'Không thể ghi nợ đơn hàng.', 'error');
      } finally {
        setCreateSubmitting(false);
      }
      return;
    }

    // ─── DẠNG 2: GHI NỢ CHI TIẾT (THEO MẶT HÀNG) ───
    if (cartItems.length === 0) {
      showGlobalToast('Vui lòng thêm ít nhất một loại thịt vào đơn nợ.', 'warning');
      return;
    }

    try {
      setCreateSubmitting(true);
      await axios.post(
        `${apiHost}/api/v1/portal/debt-action/create-debt/${token}`,
        {
          customerId: createCustomerId,
          date: txDateObj.toISOString(),
          note: createNote ? createNote.trim() : null,
          invoiceImage: invoiceImage || null,
          items: cartItems.map((it) => ({
            productId: it.productId,
            productName: it.productName,
            quantity: it.quantity,
            price: it.price,
            costPrice: it.costPrice,
          })),
        },
        {
          headers: { 'x-portal-action-token': actionToken },
        }
      );

      showGlobalToast('Đã lưu đơn nợ thành công!', 'success');
      setCartItems([]);
      setCreateNote('');
      setInvoiceImage(null);
      fetchBootstrapData(actionToken);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Lỗi khi tạo đơn nợ:', err);
      showGlobalToast(err.response?.data?.message || 'Không thể ghi nợ đơn hàng.', 'error');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Mở chế độ chỉnh sửa đơn nợ
  const handleStartEditTx = (tx) => {
    setEditingTx(tx);
    const d = new Date(tx.date);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    setEditDate(`${dd}/${mm}/${yyyy}`);
    setEditNote(tx.note || '');
    setEditItems(
      (tx.items || []).map((it) => ({
        id: it.id,
        productId: it.productId,
        productName: it.product?.name || it.productName || 'Thịt',
        quantity: it.quantity != null ? String(it.quantity) : '',
        price: it.price != null ? String(it.price) : '',
        costPrice: it.costPrice || 0,
      }))
    );
  };

  const handleCancelEditTx = () => {
    setEditingTx(null);
    setEditItems([]);
  };

  // Cập nhật dòng mặt hàng trong form chỉnh sửa
  const handleEditItemChange = (idx, field, value) => {
    const updated = [...editItems];
    updated[idx] = { ...updated[idx], [field]: value };
    setEditItems(updated);
  };

  const handleRemoveEditItem = (idx) => {
    setEditItems(editItems.filter((_, i) => i !== idx));
  };

  // Lưu chỉnh sửa đơn nợ
  const handleSaveEditTx = async () => {
    if (!editingTx) return;
    if (editItems.length === 0) {
      showGlobalToast('Đơn nợ phải có ít nhất một mặt hàng.', 'warning');
      return;
    }

    try {
      setEditSubmitting(true);
      const parsedItems = editItems.map((it) => {
        const q = parseFloat(String(it.quantity).replace(',', '.'));
        const p = parseFloat(String(it.price).replace(/[^0-9]/g, ''));
        if (isNaN(q) || q <= 0 || isNaN(p) || p <= 0) {
          throw new Error('Số lượng và đơn giá của mỗi dòng phải lớn hơn 0.');
        }
        return {
          productId: it.productId,
          productName: it.productName,
          quantity: q,
          price: p,
          costPrice: it.costPrice || 0,
        };
      });

      const txDateObj = parseDDMMYYYY(editDate);
      await axios.put(
        `${apiHost}/api/v1/portal/debt-action/update-debt/${token}/${editingTx.id}`,
        {
          date: txDateObj.toISOString(),
          note: editNote ? editNote.trim() : null,
          items: parsedItems,
        },
        {
          headers: { 'x-portal-action-token': actionToken },
        }
      );

      showGlobalToast('Cập nhật đơn nợ thành công!', 'success');
      setEditingTx(null);
      setEditItems([]);
      fetchBootstrapData(actionToken);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Lỗi khi cập nhật đơn nợ:', err);
      showGlobalToast(err.message || err.response?.data?.message || 'Không thể cập nhật đơn nợ.', 'error');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Xóa đơn nợ
  const handleDeleteTx = (tx) => {
    popupRef.current?.show({
      type: 'confirm',
      title: 'Xóa đơn nợ',
      message: `Bạn có chắc chắn muốn xóa đơn nợ ngày ${tx.date?.slice(0, 10)} (${formatCurrency(tx.totalAmount)}) của khách "${tx.customer?.name || ''}" không?`,
      confirmText: 'Xóa ngay',
      cancelText: 'Hủy',
      onConfirm: async () => {
        try {
          await axios.delete(
            `${apiHost}/api/v1/portal/debt-action/delete-debt/${token}/${tx.id}`,
            {
              headers: { 'x-portal-action-token': actionToken },
            }
          );
          showGlobalToast('Đã xóa đơn nợ thành công.', 'success');
          fetchBootstrapData(actionToken);
          if (onRefresh) onRefresh();
        } catch (err) {
          showGlobalToast(err.response?.data?.message || 'Không thể xóa đơn nợ.', 'error');
        }
      },
    });
  };

  // Xóa khoản thanh toán
  const handleDeletePayment = (pm) => {
    popupRef.current?.show({
      type: 'confirm',
      title: 'Xóa phiếu thu',
      message: `Bạn có chắc chắn muốn xóa phiếu thu số tiền ${formatCurrency(pm.amount)} của khách "${pm.customer?.name || ''}" không?`,
      confirmText: 'Xóa ngay',
      cancelText: 'Hủy',
      onConfirm: async () => {
        try {
          await axios.delete(
            `${apiHost}/api/v1/portal/debt-action/delete-payment/${token}/${pm.id}`,
            {
              headers: { 'x-portal-action-token': actionToken },
            }
          );
          showGlobalToast('Đã xóa khoản thanh toán thành công.', 'success');
          fetchBootstrapData(actionToken);
          if (onRefresh) onRefresh();
        } catch (err) {
          showGlobalToast(err.response?.data?.message || 'Không thể xóa khoản thanh toán.', 'error');
        }
      },
    });
  };

  // Danh sách options khách hàng cho CustomSelect
  const customerOptions = useMemo(() => {
    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      debt: c.debt || 0,
    }));
  }, [customers]);

  // Danh sách options thịt cho CustomSelect
  const productOptions = useMemo(() => {
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit || 'kg',
      defaultPrice: p.defaultPrice || 0,
      costPrice: p.costPrice || 0,
    }));
  }, [products]);

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
        <View style={styles.modalView}>
          {/* HEADER CHUẨN BOTTOM-SHEET */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerIcon}>⚡</Text>
              <Text style={styles.headerTitle}>QUẢN LÝ & THAO TÁC CÔNG NỢ</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* MÀN HÌNH NHẬP MÃ PIN (NẾU CHƯA XÁC THỰC) */}
          {!isUnlocked ? (
            <ScrollView
              contentContainerStyle={styles.pinScreenContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.pinLockCard}>
                <View style={styles.pinIconCircle}>
                  <Text style={styles.pinLockEmoji}>🔒</Text>
                </View>
                <Text style={styles.pinHeading}>Xác Thực Quyền Chủ Buôn</Text>
                <Text style={styles.pinDesc}>
                  Vui lòng nhập mã PIN bảo mật của bạn để mở khóa quyền chỉnh sửa và thu công nợ trực tiếp:
                </Text>

                <TextInput
                  style={styles.pinTextInput}
                  value={pinInput}
                  onChangeText={(t) => {
                    setPinInput(t);
                    setPinError('');
                  }}
                  placeholder="••••"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={6}
                  secureTextEntry
                  autoFocus
                  onSubmitEditing={handleVerifyPin}
                />

                {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}

                <TouchableOpacity
                  style={[styles.pinSubmitBtn, pinSubmitting && styles.btnDisabled]}
                  onPress={handleVerifyPin}
                  disabled={pinSubmitting}
                  activeOpacity={0.8}
                >
                  {pinSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.pinSubmitBtnText}>MỞ KHÓA THAO TÁC</Text>
                  )}
                </TouchableOpacity>

                <Text style={styles.pinNote}>
                  * Tính năng này giúp chủ buôn ghi nợ, sửa nợ và thu nợ ngay trên Zalo mà khách hàng không thể tự ý thao tác.
                </Text>
              </View>
            </ScrollView>
          ) : (
            <>
              {/* THANH CHUYỂN TAB TÁC VỤ */}
              <View style={styles.tabBar}>
                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'COLLECT' && styles.tabBtnActive]}
                  onPress={() => {
                    setActiveTab('COLLECT');
                    setEditingTx(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabBtnText, activeTab === 'COLLECT' && styles.tabBtnTextActive]}>
                    💵 Thu nợ
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'CREATE' && styles.tabBtnActive]}
                  onPress={() => {
                    setActiveTab('CREATE');
                    setEditingTx(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabBtnText, activeTab === 'CREATE' && styles.tabBtnTextActive]}>
                    ➕ Ghi nợ mới
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'HISTORY' && styles.tabBtnActive]}
                  onPress={() => setActiveTab('HISTORY')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabBtnText, activeTab === 'HISTORY' && styles.tabBtnTextActive]}>
                    ✏️ Sửa / Xóa nợ
                  </Text>
                </TouchableOpacity>
              </View>

              {dataLoading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="large" color="#059669" />
                  <Text style={styles.loadingText}>Đang tải dữ liệu khách hàng...</Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.modalBodyScroll}
                  contentContainerStyle={styles.modalBodyContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* TAB 1: THU TIỀN CÔNG NỢ */}
                  {activeTab === 'COLLECT' && (
                    <View style={styles.formContainer}>
                      {/* Chọn khách hàng (nếu nhóm có nhiều quán) */}
                      {customers.length > 1 && (
                        <View style={[styles.inputGroup, activeSelect === 'collectCustomer' && { zIndex: 999999 }]}>
                          <Text style={styles.inputLabel}>Chọn cửa hàng / khách hàng:</Text>
                          <CustomSelect
                            value={customerOptions.find((c) => c.id === collectCustomerId)}
                            options={customerOptions}
                            onSelect={(opt) => {
                              if (opt) {
                                setCollectCustomerId(opt.id);
                                setSelectedDayKeys([]);
                              }
                            }}
                            renderSelected={(opt) => opt?.name || ''}
                            getOptionLabel={(opt) => `${opt.name} (Nợ: ${formatCurrency(opt.debt)})`}
                            placeholder="Chọn khách hàng..."
                            zIndex={999999}
                            onOpenChange={(open) => setActiveSelect(open ? 'collectCustomer' : null)}
                          />
                        </View>
                      )}

                      {/* Thẻ hiển thị số nợ hiện tại */}
                      <View style={styles.debtBanner}>
                        <View>
                          <Text style={styles.debtBannerLabel}>Số nợ hiện tại của khách:</Text>
                          <Text style={styles.debtBannerCustomer}>
                            {currentCollectCustomer?.name || 'Khách hàng'}
                          </Text>
                        </View>
                        <Text style={styles.debtBannerAmount}>
                          {formatCurrency(currentCollectCustomer?.debt || 0)}
                        </Text>
                      </View>

                      {/* HAI SUB-TAB: TRẢ SỐ TIỀN HOẶC TRẢ THEO NGÀY */}
                      <View style={styles.subTabBar}>
                        <TouchableOpacity
                          style={[styles.subTabBtn, collectMode === 'AMOUNT' && styles.subTabBtnActive]}
                          onPress={() => setCollectMode('AMOUNT')}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.subTabBtnText, collectMode === 'AMOUNT' && styles.subTabBtnTextActive]}>
                            💵 Trả số tiền
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.subTabBtn, collectMode === 'BY_DAY' && styles.subTabBtnActive]}
                          onPress={() => setCollectMode('BY_DAY')}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.subTabBtnText, collectMode === 'BY_DAY' && styles.subTabBtnTextActive]}>
                            📅 Trả theo ngày {unpaidDays.length > 0 ? `(${unpaidDays.length})` : ''}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* ─── DẠNG 1: TRẢ THEO SỐ TIỀN CỤ THỂ ─── */}
                      {collectMode === 'AMOUNT' && (
                        <>
                          {/* Số tiền thanh toán */}
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Số tiền khách thanh toán (VNĐ):</Text>
                            <MoneyInput
                              value={collectAmount}
                              onChangeValue={setCollectAmount}
                              placeholder="Nhập số tiền..."
                            />
                          </View>

                          {/* Gợi ý chọn nhanh số tiền */}
                          <View style={styles.quickAmountRow}>
                            {currentCollectCustomer?.debt > 0 && (
                              <TouchableOpacity
                                style={[
                                  styles.quickAmountChip,
                                  collectAmount === currentCollectCustomer.debt && styles.quickAmountChipActive,
                                ]}
                                onPress={() => setCollectAmount(currentCollectCustomer.debt)}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.quickAmountChipText}>Toàn bộ nợ</Text>
                              </TouchableOpacity>
                            )}
                            {[500000, 1000000, 2000000, 5000000].map((amt) => (
                              <TouchableOpacity
                                key={amt}
                                style={[
                                  styles.quickAmountChip,
                                  collectAmount === amt && styles.quickAmountChipActive,
                                ]}
                                onPress={() => setCollectAmount(amt)}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.quickAmountChipText}>
                                  {amt >= 1000000 ? `${amt / 1000000}tr` : `${amt / 1000}k`}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </>
                      )}

                      {/* ─── DẠNG 2: TRẢ THEO NGÀY (CHỌN NHIỀU NGÀY 1 LÚC) ─── */}
                      {collectMode === 'BY_DAY' && (
                        <View style={styles.byDayContainer}>
                          {unpaidDays.length === 0 ? (
                            <View style={styles.emptyDayWrap}>
                              <Text style={styles.emptyDayIcon}>🎉</Text>
                              <Text style={styles.emptyDayTitle}>Không có ngày nợ nào chưa thanh toán!</Text>
                              <Text style={styles.emptyDayDesc}>
                                Khách hàng đã thanh toán đầy đủ các ngày nợ trước đó. Bạn có thể chọn tab "Trả số tiền" nếu khách trả tiền trước hoặc thu bổ sung.
                              </Text>
                            </View>
                          ) : (
                            <>
                              {/* Thanh công cụ chọn nhanh & thống kê */}
                              <View style={styles.daySelectionHeader}>
                                <TouchableOpacity
                                  style={styles.selectAllBtn}
                                  onPress={handleSelectAllDays}
                                  activeOpacity={0.7}
                                >
                                  <View style={[styles.checkboxBox, selectedDayKeys.length === unpaidDays.length && styles.checkboxBoxChecked]}>
                                    {selectedDayKeys.length === unpaidDays.length && <Text style={styles.checkboxCheckmark}>✓</Text>}
                                  </View>
                                  <Text style={styles.selectAllBtnText}>
                                    {selectedDayKeys.length === unpaidDays.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                                  </Text>
                                </TouchableOpacity>

                                <View style={styles.selectionSummaryWrap}>
                                  <Text style={styles.selectionCountText}>
                                    Đã chọn: <Text style={{ fontWeight: 'bold', color: '#059669' }}>{selectedDayKeys.length}</Text>/{unpaidDays.length} ngày
                                  </Text>
                                  <Text style={styles.selectionTotalAmountText}>
                                    {formatCurrency(selectedDaysTotalAmount)}
                                  </Text>
                                </View>
                              </View>

                              {/* Bảng danh sách các ngày còn nợ */}
                              <View style={styles.dayTableCard}>
                                <View style={styles.dayTableHeaderRow}>
                                  <Text style={[styles.dayTableColHeader, { width: 36, textAlign: 'center' }]}>Chọn</Text>
                                  <Text style={[styles.dayTableColHeader, { width: 95 }]}>Ngày</Text>
                                  <Text style={[styles.dayTableColHeader, { flex: 1 }]}>Đơn hàng</Text>
                                  <Text style={[styles.dayTableColHeader, { width: 100, textAlign: 'right' }]}>Nợ còn lại</Text>
                                </View>

                                {unpaidDays.map((day, idx) => {
                                  const isSelected = selectedDayKeys.includes(day.dateKey);
                                  return (
                                    <TouchableOpacity
                                      key={day.dateKey}
                                      style={[
                                        styles.dayTableRow,
                                        idx % 2 === 1 && styles.dayTableRowZebra,
                                        isSelected && styles.dayTableRowSelected,
                                      ]}
                                      onPress={() => handleToggleSelectDay(day.dateKey)}
                                      activeOpacity={0.7}
                                    >
                                      {/* Cột Checkbox */}
                                      <View style={[styles.dayTableCol, { width: 36, alignItems: 'center' }]}>
                                        <View style={[styles.checkboxBox, isSelected && styles.checkboxBoxChecked]}>
                                          {isSelected && <Text style={styles.checkboxCheckmark}>✓</Text>}
                                        </View>
                                      </View>

                                      {/* Cột Ngày & Thứ */}
                                      <View style={[styles.dayTableCol, { width: 95 }]}>
                                        <Text style={[styles.dayTableDateText, isSelected && styles.dayTableDateTextSelected]}>
                                          {day.dateKey}
                                        </Text>
                                        <Text style={styles.dayTableWeekdayText}>{day.weekday || ''}</Text>
                                      </View>

                                      {/* Cột Chi tiết đơn hàng */}
                                      <View style={[styles.dayTableCol, { flex: 1, paddingRight: 4 }]}>
                                        <Text style={styles.dayTableItemsText} numberOfLines={2}>
                                          {day.itemsSummary || 'Đơn hàng thịt'}
                                        </Text>
                                        {day.paidAmount > 0 && (
                                          <Text style={styles.dayTablePartialPaidText}>
                                            Đã trả: {formatCurrency(day.paidAmount)}
                                          </Text>
                                        )}
                                      </View>

                                      {/* Cột Nợ còn lại */}
                                      <View style={[styles.dayTableCol, { width: 100, alignItems: 'flex-end' }]}>
                                        <Text style={styles.dayTableDebtText}>
                                          {formatCurrency(day.remainingDebt)}
                                        </Text>
                                      </View>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </>
                          )}
                        </View>
                      )}

                      {/* Ngày thanh toán & Ghi chú */}
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Ngày thanh toán:</Text>
                        <DatePickerInput
                          value={collectDate}
                          onChange={setCollectDate}
                          compact={true}
                        />
                      </View>

                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Ghi chú thanh toán (nếu có):</Text>
                        <TextInput
                          style={styles.textInput}
                          value={collectNote}
                          onChangeText={setCollectNote}
                          placeholder={
                            collectMode === 'BY_DAY'
                              ? 'Ví dụ: Đã nhận tiền mặt, chuyển khoản VCB...'
                              : 'Ví dụ: Chuyển khoản VCB, trả tiền mặt...'
                          }
                          placeholderTextColor="#94A3B8"
                        />
                      </View>

                      {/* Nút nộp Thu nợ */}
                      <TouchableOpacity
                        style={[
                          styles.primaryActionBtn,
                          (collectSubmitting || (collectMode === 'BY_DAY' && selectedDayKeys.length === 0)) && styles.btnDisabled,
                        ]}
                        onPress={handleSubmitCollect}
                        disabled={collectSubmitting || (collectMode === 'BY_DAY' && selectedDayKeys.length === 0)}
                        activeOpacity={0.8}
                      >
                        {collectSubmitting ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.primaryActionBtnText}>
                            {collectMode === 'BY_DAY'
                              ? `💵 XÁC NHẬN THU NỢ (${selectedDayKeys.length} NGÀY - ${formatCurrency(selectedDaysTotalAmount)})`
                              : `💵 XÁC NHẬN THU NỢ (${formatCurrency(collectAmount)})`}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* TAB 2: GHI NỢ ĐƠN HÀNG MỚI */}
                  {activeTab === 'CREATE' && (
                    <View style={styles.formContainer}>
                      {/* Chọn khách hàng */}
                      {customers.length > 1 && (
                        <View style={[styles.inputGroup, activeSelect === 'createCustomer' && { zIndex: 999999 }]}>
                          <Text style={styles.inputLabel}>Chọn khách hàng ghi nợ:</Text>
                          <CustomSelect
                            value={customerOptions.find((c) => c.id === createCustomerId)}
                            options={customerOptions}
                            onSelect={(opt) => {
                              if (opt) setCreateCustomerId(opt.id);
                            }}
                            renderSelected={(opt) => opt?.name || ''}
                            getOptionLabel={(opt) => opt.name}
                            placeholder="Chọn khách hàng..."
                            zIndex={999999}
                            onOpenChange={(open) => setActiveSelect(open ? 'createCustomer' : null)}
                          />
                        </View>
                      )}

                      {/* 2 SUB-TABS: CHI TIẾT HOẶC NHẬP NHANH */}
                      <View style={styles.subTabBar}>
                        <TouchableOpacity
                          style={[styles.subTabBtn, createMode === 'DETAIL' && styles.subTabBtnActive]}
                          onPress={() => setCreateMode('DETAIL')}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.subTabBtnText, createMode === 'DETAIL' && styles.subTabBtnTextActive]}>
                            📝 Chi tiết
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.subTabBtn, createMode === 'QUICK' && styles.subTabBtnActive]}
                          onPress={() => setCreateMode('QUICK')}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.subTabBtnText, createMode === 'QUICK' && styles.subTabBtnTextActive]}>
                            ⚡ Nhập nhanh
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* ─── DẠNG 1: GHI NỢ CHI TIẾT (THEO TỪNG MÓN THỊT) ─── */}
                      {createMode === 'DETAIL' && (
                        <>
                          {/* Khung thêm mặt hàng */}
                          <View style={[styles.cardBox, activeSelect === 'productSelect' && { zIndex: 999999 }]}>
                            <Text style={styles.cardBoxTitle}>Thêm mặt hàng thịt:</Text>

                            {/* Chọn loại thịt */}
                            <View style={styles.inputSubGroup}>
                              <Text style={styles.inputLabelSmall}>Loại thịt:</Text>
                              <CustomSelect
                                value={selectedProduct}
                                options={productOptions}
                                onSelect={handleSelectProduct}
                                renderSelected={(p) => p?.name || ''}
                                getOptionLabel={(p) => p.name}
                                placeholder="Chọn loại thịt..."
                                zIndex={999999}
                                compact={true}
                                onOpenChange={(open) => setActiveSelect(open ? 'productSelect' : null)}
                              />
                            </View>

                            {/* Số cân (kg) và Đơn giá (VNĐ) trên cùng 1 hàng */}
                            <View style={styles.rowTwoCols}>
                              <View style={styles.colHalf}>
                                <Text style={styles.inputLabelSmall}>Số cân (kg):</Text>
                                <TextInput
                                  style={styles.textInputCompact}
                                  value={productQty}
                                  onChangeText={setProductQty}
                                  placeholder="VD: 5.4"
                                  placeholderTextColor="#94A3B8"
                                  keyboardType="decimal-pad"
                                />
                              </View>

                              <View style={styles.colHalf}>
                                <Text style={styles.inputLabelSmall}>Đơn giá (đ/kg):</Text>
                                <TextInput
                                  style={styles.textInputCompact}
                                  value={productPrice ? formatNumber(productPrice) : ''}
                                  onChangeText={(t) => setProductPrice(t.replace(/[^0-9]/g, ''))}
                                  placeholder="Đơn giá..."
                                  placeholderTextColor="#94A3B8"
                                  keyboardType="number-pad"
                                />
                              </View>
                            </View>

                            {/* Thành tiền xem trước & Nút thêm món */}
                            <View style={styles.previewSubtotalRow}>
                              <Text style={styles.previewSubtotalText}>
                                Thành tiền:{' '}
                                <Text style={styles.previewSubtotalHighlight}>
                                  {formatCurrency(
                                    Math.round(
                                      (parseFloat(productQty.replace(',', '.')) || 0) *
                                      (parseFloat(productPrice) || 0)
                                    )
                                  )}
                                </Text>
                              </Text>

                              <TouchableOpacity
                                style={styles.addCartBtn}
                                onPress={handleAddToCart}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.addCartBtnText}>➕ Thêm vào đơn</Text>
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Bảng danh sách mặt hàng đã thêm */}
                          {cartItems.length > 0 && (
                            <View style={styles.cartTableCard}>
                              <View style={styles.cartTableHeader}>
                                <Text style={[styles.cartTh, { flex: 2 }]}>Mặt hàng</Text>
                                <Text style={[styles.cartTh, { flex: 1, textAlign: 'center' }]}>Kg</Text>
                                <Text style={[styles.cartTh, { flex: 1.2, textAlign: 'right' }]}>Giá</Text>
                                <Text style={[styles.cartTh, { flex: 1.5, textAlign: 'right' }]}>Thành tiền</Text>
                                <Text style={[styles.cartTh, { width: 32 }]}></Text>
                              </View>

                              {cartItems.map((item, idx) => (
                                <View key={idx} style={styles.cartTableRow}>
                                  <Text style={[styles.cartTd, { flex: 2 }]} numberOfLines={1}>
                                    {item.productName}
                                  </Text>
                                  <Text style={[styles.cartTd, { flex: 1, textAlign: 'center' }]}>
                                    {item.quantity}
                                  </Text>
                                  <Text style={[styles.cartTd, { flex: 1.2, textAlign: 'right' }]}>
                                    {formatNumber(item.price)}
                                  </Text>
                                  <Text style={[styles.cartTd, styles.cartTdHighlight, { flex: 1.5, textAlign: 'right' }]}>
                                    {formatCurrency(item.amount)}
                                  </Text>
                                  <TouchableOpacity
                                    style={styles.cartDeleteBtn}
                                    onPress={() => handleRemoveCartItem(idx)}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.cartDeleteBtnText}>✕</Text>
                                  </TouchableOpacity>
                                </View>
                              ))}

                              <View style={styles.cartTotalRow}>
                                <Text style={styles.cartTotalLabel}>TỔNG CỘNG ĐƠN NỢ:</Text>
                                <Text style={styles.cartTotalValue}>
                                  {formatCurrency(totalCartAmount)}
                                </Text>
                              </View>
                            </View>
                          )}
                        </>
                      )}

                      {/* ─── DẠNG 2: GHI NỢ NHANH (TIỀN HÀNG) ─── */}
                      {createMode === 'QUICK' && (
                        <>
                          {/* Tên khoản nợ / loại hàng */}
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Tên khoản nợ / Loại hàng:</Text>
                            <TextInput
                              style={styles.textInput}
                              value={quickProductName}
                              onChangeText={setQuickProductName}
                              placeholder="Ví dụ: Tiền hàng, Tiền phụ phí..."
                              placeholderTextColor="#94A3B8"
                            />
                          </View>

                          {/* Số tiền nợ */}
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Số tiền nợ (VNĐ):</Text>
                            <MoneyInput
                              value={quickDebtAmount}
                              onChangeValue={setQuickDebtAmount}
                              placeholder="Nhập số tiền nợ..."
                            />
                          </View>

                          {/* Gợi ý chọn nhanh số tiền */}
                          <View style={styles.quickAmountRow}>
                            {[500000, 1000000, 2000000, 3000000, 5000000, 10000000].map((amt) => (
                              <TouchableOpacity
                                key={amt}
                                style={[
                                  styles.quickAmountChip,
                                  quickDebtAmount === amt && styles.quickAmountChipActive,
                                ]}
                                onPress={() => setQuickDebtAmount(amt)}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.quickAmountChipText}>
                                  {amt >= 1000000 ? `${amt / 1000000}tr` : `${amt / 1000}k`}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </>
                      )}

                      {/* Ngày giao hàng */}
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Ngày giao hàng:</Text>
                        <DatePickerInput
                          value={createDate}
                          onChange={setCreateDate}
                          compact={true}
                        />
                      </View>

                      {/* Ghi chú đơn nợ */}
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Ghi chú đơn nợ:</Text>
                        <TextInput
                          style={styles.textInput}
                          value={createNote}
                          onChangeText={setCreateNote}
                          placeholder={
                            createMode === 'QUICK'
                              ? 'Ví dụ: Giao bổ sung, nợ tiền hàng...'
                              : 'Ghi chú giao hàng...'
                          }
                          placeholderTextColor="#94A3B8"
                        />
                      </View>

                      {/* Đính kèm ảnh hóa đơn / Tích kê giao hàng */}
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>📸 Ảnh hóa đơn / Tích kê:</Text>
                        {invoiceImage ? (
                          <View style={styles.invoicePreviewContainer}>
                            <Image
                              source={{ uri: invoiceImage }}
                              style={styles.invoicePreviewImg}
                              resizeMode="contain"
                            />
                            <View style={styles.invoicePreviewActions}>
                              <TouchableOpacity
                                style={styles.invoiceChangeBtn}
                                onPress={handlePickInvoiceImage}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.invoiceChangeBtnText}>🔄 Đổi ảnh</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.invoiceDeleteBtn}
                                onPress={handleRemoveInvoiceImage}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.invoiceDeleteBtnText}>✕ Xóa</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.attachInvoiceBtn}
                            onPress={handlePickInvoiceImage}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.attachInvoiceIcon}>📷</Text>
                            <View style={styles.attachInvoiceTextWrap}>
                              <Text style={styles.attachInvoiceMainText}>Chụp / Chọn ảnh hóa đơn</Text>
                              <Text style={styles.attachInvoiceSubText}>Đính kèm ảnh tích kê giao hàng cho đơn nợ này</Text>
                            </View>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Nút lưu đơn nợ */}
                      <TouchableOpacity
                        style={[
                          styles.primaryActionBtn,
                          (createSubmitting || (createMode === 'DETAIL' ? cartItems.length === 0 : quickDebtAmount <= 0)) && styles.btnDisabled,
                        ]}
                        onPress={handleSubmitCreateDebt}
                        disabled={createSubmitting || (createMode === 'DETAIL' ? cartItems.length === 0 : quickDebtAmount <= 0)}
                        activeOpacity={0.8}
                      >
                        {createSubmitting ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.primaryActionBtnText}>
                            {createMode === 'QUICK'
                              ? `⚡ LƯU ĐƠN NỢ NHANH (${formatCurrency(quickDebtAmount)})`
                              : `📝 LƯU ĐƠN NỢ (${formatCurrency(totalCartAmount)})`}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* TAB 3: LỊCH SỬ & CHỈNH SỬA / XÓA NỢ */}
                  {activeTab === 'HISTORY' && (
                    <View style={styles.formContainer}>
                      {/* KHUNG FORM CHỈNH SỬA ĐƠN NỢ CỤ THỂ (NẾU ĐANG CHỌN SỬA) */}
                      {editingTx ? (
                        <View style={styles.editTxCard}>
                          <View style={styles.editTxHeader}>
                            <Text style={styles.editTxTitle}>
                              ✏️ Chỉnh sửa đơn nợ #{editingTx.id.slice(0, 8)}
                            </Text>
                            <TouchableOpacity onPress={handleCancelEditTx}>
                              <Text style={styles.editTxCancelBtn}>Hủy ✕</Text>
                            </TouchableOpacity>
                          </View>

                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabelSmall}>Ngày giao hàng:</Text>
                            <DatePickerInput
                              value={editDate}
                              onChange={setEditDate}
                              compact={true}
                            />
                          </View>

                          <Text style={styles.inputLabelSmall}>Danh sách mặt hàng:</Text>
                          {editItems.map((it, idx) => (
                            <View key={idx} style={styles.editItemRow}>
                              <Text style={styles.editItemName} numberOfLines={1}>
                                • {it.productName}
                              </Text>
                              <View style={styles.editItemInputs}>
                                <TextInput
                                  style={styles.editItemQtyInput}
                                  value={it.quantity}
                                  onChangeText={(t) => handleEditItemChange(idx, 'quantity', t)}
                                  placeholder="Kg"
                                  keyboardType="decimal-pad"
                                />
                                <Text style={styles.editItemUnit}>kg x</Text>
                                <TextInput
                                  style={styles.editItemPriceInput}
                                  value={it.price ? formatNumber(it.price) : ''}
                                  onChangeText={(t) =>
                                    handleEditItemChange(idx, 'price', t.replace(/[^0-9]/g, ''))
                                  }
                                  placeholder="Đơn giá"
                                  keyboardType="number-pad"
                                />
                                <TouchableOpacity
                                  style={styles.editItemDeleteBtn}
                                  onPress={() => handleRemoveEditItem(idx)}
                                >
                                  <Text style={styles.editItemDeleteBtnText}>✕</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}

                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabelSmall}>Ghi chú:</Text>
                            <TextInput
                              style={styles.textInputCompact}
                              value={editNote}
                              onChangeText={setEditNote}
                              placeholder="Ghi chú đơn..."
                            />
                          </View>

                          <TouchableOpacity
                            style={[styles.saveEditBtn, editSubmitting && styles.btnDisabled]}
                            onPress={handleSaveEditTx}
                            disabled={editSubmitting}
                            activeOpacity={0.8}
                          >
                            {editSubmitting ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.saveEditBtnText}>💾 LƯU CẬP NHẬT ĐƠN NỢ</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      {/* DANH SÁCH CÁC ĐƠN NỢ GẦN ĐÂY */}
                      <View style={styles.historySectionHeaderRow}>
                        <Text style={styles.historySectionTitle}>📦 Các đơn nợ gần đây:</Text>
                        {historyFilterDate ? (
                          <View style={styles.activeFilterTag}>
                            <Text style={styles.activeFilterTagText}>Lọc: {historyFilterDate}</Text>
                          </View>
                        ) : null}
                      </View>

                      {/* BỘ LỌC NGÀY CHO LỊCH SỬ ĐƠN NỢ */}
                      <View style={styles.historyFilterWrap}>
                        <View style={styles.historyFilterChipsRow}>
                          <TouchableOpacity
                            style={[styles.filterChip, !historyFilterDate && styles.filterChipActive]}
                            onPress={() => setHistoryFilterDate('')}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.filterChipText, !historyFilterDate && styles.filterChipTextActive]}>
                              Tất cả
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.filterChip, historyFilterDate === getTodayString() && styles.filterChipActive]}
                            onPress={() => setHistoryFilterDate(getTodayString())}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.filterChipText, historyFilterDate === getTodayString() && styles.filterChipTextActive]}>
                              Hôm nay
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.filterChip, historyFilterDate === getYesterdayString() && styles.filterChipActive]}
                            onPress={() => setHistoryFilterDate(getYesterdayString())}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.filterChipText, historyFilterDate === getYesterdayString() && styles.filterChipTextActive]}>
                              Hôm qua
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {/* Ô chọn ngày tùy ý */}
                        <View style={styles.historyDatePickerWrap}>
                          <View style={{ flex: 1 }}>
                            <DatePickerInput
                              value={historyFilterDate || getTodayString()}
                              onChange={(val) => setHistoryFilterDate(val)}
                              compact={true}
                            />
                          </View>
                          {historyFilterDate ? (
                            <TouchableOpacity
                              style={styles.clearFilterBtn}
                              onPress={() => setHistoryFilterDate('')}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.clearFilterBtnText}>✕ Bỏ lọc</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>

                      {/* DANH SÁCH ĐƠN NỢ GOM NHÓM THEO NGÀY */}
                      {groupedTransactionsByDay.length === 0 ? (
                        <Text style={styles.emptyNotice}>
                          {historyFilterDate
                            ? `Không có đơn nợ nào trong ngày ${historyFilterDate}.`
                            : 'Chưa có đơn nợ nào được ghi nhận.'}
                        </Text>
                      ) : (
                        <View style={styles.historyGroupList}>
                          {groupedTransactionsByDay.map((dayGroup) => (
                            <View key={dayGroup.dateKey} style={styles.dayHistoryCard}>
                              {/* HEADER CỦA NGÀY */}
                              <View style={styles.dayHistoryCardHeader}>
                                <View style={styles.dayHistoryCardHeaderLeft}>
                                  <Text style={styles.dayHistoryCardIcon}>📅</Text>
                                  <Text style={styles.dayHistoryCardDateText}>{dayGroup.dateKey}</Text>
                                  <Text style={styles.dayHistoryCardWeekdayText}>({dayGroup.weekday})</Text>
                                  <View style={styles.dayHistoryCountBadge}>
                                    <Text style={styles.dayHistoryCountText}>{dayGroup.transactions.length} đơn</Text>
                                  </View>
                                </View>

                                <Text style={styles.dayHistoryCardTotalText}>
                                  +{formatCurrency(dayGroup.totalAmount)}
                                </Text>
                              </View>

                              {/* DANH SÁCH CÁC ĐƠN TRONG NGÀY */}
                              <View style={styles.dayHistoryCardBody}>
                                {dayGroup.transactions.map((tx, idx) => (
                                  <View
                                    key={tx.id}
                                    style={[
                                      styles.historyRowCompact,
                                      idx % 2 === 1 && styles.historyRowCompactZebra,
                                      idx === dayGroup.transactions.length - 1 && { borderBottomWidth: 0 },
                                    ]}
                                  >
                                    <View style={styles.historyLeft}>
                                      {customers.length > 1 && (
                                        <Text style={styles.historyCustName}>
                                          [{tx.customer?.name || 'Khách'}]
                                        </Text>
                                      )}
                                      <Text style={styles.historyItemsSummary} numberOfLines={2}>
                                        {(tx.items || []).map((it) => {
                                          const pName = it.product?.name || it.productName || 'Thịt';
                                          return `${pName} (${it.quantity}kg)`;
                                        }).join(', ')}
                                      </Text>
                                      {tx.note ? (
                                        <Text style={styles.historyNote} numberOfLines={1}>
                                          💬 {tx.note}
                                        </Text>
                                      ) : null}
                                    </View>

                                    <View style={styles.historyRight}>
                                      <Text style={styles.historyAmountDebt}>
                                        +{formatCurrency(tx.totalAmount)}
                                      </Text>
                                      <View style={styles.historyActions}>
                                        <TouchableOpacity
                                          style={styles.actionPencilBtn}
                                          onPress={() => handleStartEditTx(tx)}
                                          activeOpacity={0.7}
                                        >
                                          <Text style={styles.actionPencilText}>✏️ Sửa</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          style={styles.actionTrashBtn}
                                          onPress={() => handleDeleteTx(tx)}
                                          activeOpacity={0.7}
                                        >
                                          <Text style={styles.actionTrashText}>🗑️ Xóa</Text>
                                        </TouchableOpacity>
                                      </View>
                                    </View>
                                  </View>
                                ))}
                              </View>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* DANH SÁCH CÁC PHIẾU THU GẦN ĐÂY */}
                      <Text style={[styles.historySectionTitle, { marginTop: 16 }]}>
                        💵 Các phiếu thu tiền gần đây {historyFilterDate ? `(Ngày ${historyFilterDate})` : ''}:
                      </Text>
                      {filteredPayments.length === 0 ? (
                        <Text style={styles.emptyNotice}>
                          {historyFilterDate
                            ? `Không có phiếu thu nào trong ngày ${historyFilterDate}.`
                            : 'Chưa có phiếu thu nào.'}
                        </Text>
                      ) : (
                        <View style={styles.historyList}>
                          {filteredPayments.map((pm) => (
                            <View key={pm.id} style={styles.historyRow}>
                              <View style={styles.historyLeft}>
                                <Text style={styles.historyDate}>
                                  {pm.paidAt ? pm.paidAt.slice(0, 10).split('-').reverse().join('/') : ''}
                                </Text>
                                <Text style={styles.historyCustName}>
                                  [{pm.customer?.name || 'Khách'}]
                                </Text>
                                {pm.note ? (
                                  <Text style={styles.historyNote} numberOfLines={1}>
                                    {pm.note}
                                  </Text>
                                ) : null}
                              </View>

                              <View style={styles.historyRight}>
                                <Text style={styles.historyAmountPaid}>
                                  -{formatCurrency(pm.amount)}
                                </Text>
                                <TouchableOpacity
                                  style={styles.actionTrashBtn}
                                  onPress={() => handleDeletePayment(pm)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.actionTrashText}>🗑️ Xóa</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </ScrollView>
              )}
            </>
          )}
        </View>
      </SmoothModal>

      {/* Input ẩn chọn ảnh hóa đơn */}
      {Platform.OS === 'web' && (
        <input
          type="file"
          ref={invoiceFileInputRef}
          style={{ display: 'none' }}
          accept="image/*"
          onChange={handleInvoiceFileChange}
        />
      )}

      {/* POPUP XÁC NHẬN ĐỘC LẬP TẦNG CAO NHẤT */}
      <PopupModal ref={popupRef} />
    </>
  );
});

export default PortalDebtActionModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    height: '92%',
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 16,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    letterSpacing: 0.3,
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
    color: '#64748B',
    fontWeight: 'bold',
  },

  // Pin Screen
  pinScreenContent: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  pinLockCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    alignItems: 'center',
  },
  pinIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pinLockEmoji: {
    fontSize: 28,
  },
  pinHeading: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  pinDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  pinTextInput: {
    width: 180,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 8,
    color: '#0F172A',
    marginBottom: 10,
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  pinErrorText: {
    fontSize: 12,
    color: '#EF4444',
    marginBottom: 10,
    fontWeight: '500',
  },
  pinSubmitBtn: {
    width: '100%',
    height: 46,
    backgroundColor: '#059669',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  pinSubmitBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  pinNote: {
    marginTop: 14,
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#059669',
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },

  // Modal Scroll Content
  modalBodyScroll: {
    flex: 1,
  },
  modalBodyContent: {
    paddingVertical: 12,
    paddingBottom: 24,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },

  // Form Elements
  formContainer: {
    gap: 12,
  },
  inputGroup: {
    gap: 4,
  },
  inputSubGroup: {
    gap: 4,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  inputLabelSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  textInput: {
    height: 42,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  textInputCompact: {
    height: 38,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    outlineStyle: 'none',
    outlineWidth: 0,
  },

  // Debt Banner
  debtBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
  },
  debtBannerLabel: {
    fontSize: 11,
    color: '#991B1B',
    fontWeight: '500',
  },
  debtBannerCustomer: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#7F1D1D',
  },
  debtBannerAmount: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#DC2626',
  },

  // Quick Amount
  quickAmountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickAmountChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickAmountChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  quickAmountChipText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },

  // Primary Action Button (Fixed Bottom Style)
  primaryActionBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryActionBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // Card Box (Ghi nợ)
  cardBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
  },
  cardBoxTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 8,
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  colHalf: {
    flex: 1,
    gap: 4,
  },
  previewSubtotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  previewSubtotalText: {
    fontSize: 13,
    color: '#475569',
  },
  previewSubtotalHighlight: {
    fontWeight: 'bold',
    color: '#059669',
  },
  addCartBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#0F172A',
  },
  addCartBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },

  // Cart Table
  cartTableCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  cartTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  cartTh: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B',
  },
  cartTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  cartTd: {
    fontSize: 12,
    color: '#334155',
  },
  cartTdHighlight: {
    fontWeight: 'bold',
    color: '#0F172A',
  },
  cartDeleteBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    marginLeft: 6,
  },
  cartDeleteBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  cartTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
  },
  cartTotalLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  cartTotalValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#059669',
  },

  // History Tab
  historySectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 6,
  },
  emptyNotice: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  historyList: {
    gap: 6,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 8,
  },
  historyLeft: {
    flex: 1,
    paddingRight: 8,
  },
  historyDate: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B',
  },
  historyCustName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  historyItemsSummary: {
    fontSize: 11,
    color: '#64748B',
  },
  historyNote: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  historyAmountDebt: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  historyAmountPaid: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#059669',
  },
  historyActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionPencilBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#E0F2FE',
  },
  actionPencilText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284C7',
  },
  actionTrashBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  actionTrashText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },

  // Edit Tx Inline Card
  editTxCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  editTxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#FCD34D',
    paddingBottom: 6,
  },
  editTxTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#92400E',
  },
  editTxCancelBtn: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#B45309',
  },
  editItemRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  editItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  editItemInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editItemQtyInput: {
    width: 60,
    height: 32,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 6,
    fontSize: 12,
    textAlign: 'center',
  },
  editItemUnit: {
    fontSize: 12,
    color: '#64748B',
  },
  editItemPriceInput: {
    flex: 1,
    height: 32,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 6,
    fontSize: 12,
  },
  editItemDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editItemDeleteBtnText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  saveEditBtn: {
    height: 40,
    borderRadius: 8,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveEditBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  // Sub-tabs Thu nợ (Trả số tiền / Trả theo ngày)
  subTabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  subTabBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  subTabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  subTabBtnTextActive: {
    color: '#059669',
    fontWeight: 'bold',
  },
  // Thu nợ theo ngày
  byDayContainer: {
    gap: 8,
  },
  emptyDayWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyDayIcon: {
    fontSize: 28,
  },
  emptyDayTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptyDayDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  daySelectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectAllBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  selectionSummaryWrap: {
    alignItems: 'flex-end',
  },
  selectionCountText: {
    fontSize: 11,
    color: '#64748B',
  },
  selectionTotalAmountText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  // Bảng ngày nợ (Table / Grid View)
  dayTableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  dayTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  dayTableColHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
    textTransform: 'uppercase',
  },
  dayTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dayTableRowZebra: {
    backgroundColor: '#F8FAFC',
  },
  dayTableRowSelected: {
    backgroundColor: '#ECFDF5',
  },
  dayTableCol: {
    justifyContent: 'center',
  },
  dayTableDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  dayTableDateTextSelected: {
    color: '#059669',
    fontWeight: 'bold',
  },
  dayTableWeekdayText: {
    fontSize: 10,
    color: '#64748B',
  },
  dayTableItemsText: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 15,
  },
  dayTablePartialPaidText: {
    fontSize: 10,
    color: '#059669',
    fontStyle: 'italic',
  },
  dayTableDebtText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  // Checkbox chuẩn
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    borderColor: '#059669',
    backgroundColor: '#059669',
  },
  checkboxCheckmark: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    lineHeight: 14,
  },
  // BỘ LỌC NGÀY VÀ GOM NHÓM LỊCH SỬ ĐƠN NỢ
  historySectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  activeFilterTag: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  activeFilterTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  historyFilterWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    gap: 8,
    marginBottom: 10,
  },
  historyFilterChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  filterChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  historyDatePickerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearFilterBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearFilterBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  // Gom nhóm đơn theo từng ngày
  historyGroupList: {
    gap: 10,
  },
  dayHistoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  dayHistoryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  dayHistoryCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayHistoryCardIcon: {
    fontSize: 14,
  },
  dayHistoryCardDateText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  dayHistoryCardWeekdayText: {
    fontSize: 12,
    color: '#64748B',
  },
  dayHistoryCountBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  dayHistoryCountText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#475569',
  },
  dayHistoryCardTotalText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  dayHistoryCardBody: {
    backgroundColor: '#FFFFFF',
  },
  historyRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  historyRowCompactZebra: {
    backgroundColor: '#FAFAFA',
  },
  attachInvoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 10,
    gap: 10,
  },
  attachInvoiceIcon: {
    fontSize: 24,
  },
  attachInvoiceTextWrap: {
    flex: 1,
  },
  attachInvoiceMainText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  attachInvoiceSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  invoicePreviewContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    overflow: 'hidden',
    padding: 6,
    alignItems: 'center',
  },
  invoicePreviewImg: {
    width: '100%',
    height: 140,
    borderRadius: 6,
    backgroundColor: '#1E293B',
  },
  invoicePreviewActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    gap: 8,
    marginTop: 8,
  },
  invoiceChangeBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  invoiceChangeBtnText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  invoiceDeleteBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  invoiceDeleteBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

