import React, { useRef, useMemo, useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  Linking,
  UIManager,
  LayoutAnimation,
  Alert,
} from 'react-native';

// Kích hoạt LayoutAnimation trên Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import { COLORS, FONTS, SHADOWS } from '../../src/theme';
import DebtModal from '../../src/components/DebtModal';
import PaymentModal from '../../src/components/PaymentModal';
import TransactionDetailModal from '../../src/components/TransactionDetailModal';
import EditDebtModal from '../../src/components/EditDebtModal';
import EditPaymentModal from '../../src/components/EditPaymentModal';
import EditCustomerModal from '../../src/components/EditCustomerModal';
import MonthDetailDrawer from '../../src/components/MonthDetailDrawer';
import ScanTicketModal from '../../src/components/ScanTicketModal';
import PopupModal from '../../src/components/PopupModal';
import { startNativeRecording, stopNativeRecording } from '../../src/utils/mediaActions';

export default function CustomerDetailScreen() {
  const auth = useAuthStore();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const debtModalRef = useRef(null);
  const paymentModalRef = useRef(null);
  const detailModalRef = useRef(null);
  const editDebtModalRef = useRef(null);
  const editPaymentModalRef = useRef(null);
  const editCustomerModalRef = useRef(null);
  const monthDrawerRef = useRef(null); // Ref điều khiển Sidebar chi tiết tháng
  const scrollViewRef = useRef(null); // Ref để điều khiển cuộn của ScrollView
  const scanTicketModalRef = useRef(null); // Ref điều khiển Modal kết quả quét tích kê
  const popupModalRef = useRef(null); // Ref điều khiển Popup thông báo dùng chung

  const [scanning, setScanning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Hàm xử lý kết quả phân tích chung cho cả giọng nói và nhập chữ
  const processParseResult = (responseData, sourceTitle) => {
    const { customerId, customerName, data } = responseData;
    const results = Array.isArray(data) ? data : [data].filter(Boolean);
    const firstResult = results[0];
    if (!firstResult) {
      popupModalRef.current?.show({
        title: 'Không có kết quả',
        message: 'AI không trả về dữ liệu giao dịch để hiển thị.',
        type: 'warning'
      });
      return;
    }

    if (results.length === 1 && firstResult.status === 'incomplete') {
      popupModalRef.current?.show({
        title: 'Thông tin chưa đầy đủ',
        message: `Câu thoại thiếu thông tin bắt buộc: ${(firstResult.missing_fields || []).join(', ')}. Vui lòng bổ sung đầy đủ.`,
        type: 'warning'
      });
      return;
    }

    const activeCustomerId = id;

    if (results.length === 1 && firstResult.transaction_type === 'tra_tien') {
      setTimeout(() => {
        paymentModalRef.current?.open(firstResult.amount || '');
      }, 100);
    } else {
      const items = results.map((result) => {
        const amount = Number(result.amount) || 0;
        const hasWeight = Number(result.weight_kg) > 0;
        const quantity = hasWeight ? Number(result.weight_kg) : (result.transaction_type === 'ghi_no_nhanh' ? 1 : 0);
        const price = hasWeight ? amount / quantity : (quantity ? amount : 0);
        return {
          product: {
            name: result.meat_type || 'Thịt lẻ',
            unit: hasWeight || result.transaction_type === 'ghi_no_thu_cong' ? 'kg' : 'phần',
            defaultPrice: price
          },
          quantity,
          price,
          voiceDate: result.date,
          voiceCustomerName: result.customer_name || customerName,
          voiceTotalAmount: amount,
        };
      });

      scanTicketModalRef.current?.open(
        items,
        sourceTitle,
        results.map((result) => result.raw_transcript).filter(Boolean).join(' | '),
        firstResult.date,
        customerName,
        activeCustomerId
      );
    }
  };

  // Hộp thoại nhập chữ dự phòng khi thiết bị không hỗ trợ hoặc lỗi micro
  const handleTypeTextFallback = () => {
    setTimeout(() => {
      popupModalRef.current?.show({
        title: 'Nhập câu thoại ghi nợ',
        message: 'Ví dụ: "Ngày 5 tháng 7, chị Lan, 2 cân ba chỉ, 150 nghìn" hoặc "chị Hoa trả 100 nghìn"',
        type: 'confirm',
        confirmText: 'Phân tích',
        cancelText: 'Hủy',
        showTextInput: true,
        textInputPlaceholder: 'Nhập câu nói của bạn tại đây...',
        onConfirm: async (text) => {
          if (!text || !text.trim()) return;

          setScanning(true);
          try {
            const response = await api.post('/transactions/voice-to-text', {
              transcript: text.trim()
            });

            if (response.data.success) {
              processParseResult(response.data, '🎤 KẾT QUẢ PHÂN TÍCH AI');
            } else {
              popupModalRef.current?.show({
                title: 'Thất bại',
                message: response.data.message || 'Không thể phân tích văn bản.',
                type: 'error'
              });
            }
          } catch (parseErr) {
            console.error(parseErr);
            popupModalRef.current?.show({
              title: 'Lỗi kết nối',
              message: parseErr.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ phân tích.',
              type: 'error'
            });
          } finally {
            setScanning(false);
          }
        }
      });
    }, 100);
  };

  // Xử lý thu âm và chuyển đổi ghi nợ bằng giọng nói tiếng Việt qua Gemini API
  const handleToggleRecording = async () => {
    if (Platform.OS !== 'web') {
      try {
        if (isRecording) {
          const audio = await stopNativeRecording(mediaRecorderRef.current);
          mediaRecorderRef.current = null;
          setIsRecording(false);
          setScanning(true);
          const response = await api.post('/transactions/voice-to-text', {
            audio: audio.dataUri,
            mimeType: audio.mimeType,
          }, { timeout: 120000 });
          if (response.data.success) {
            processParseResult(response.data, 'KET QUA GHI NO GIONG NOI');
          } else {
            popupModalRef.current?.show({
              title: 'That bai',
              message: response.data.message || 'Khong the dich giong noi.',
              type: 'error',
            });
          }
          setScanning(false);
        } else {
          mediaRecorderRef.current = await startNativeRecording();
          setIsRecording(true);
        }
      } catch (err) {
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setScanning(false);
        popupModalRef.current?.show({
          title: err.message === 'MIC_PERMISSION_DENIED' ? 'Chua cap quyen microphone' : 'Loi ghi am',
          message: err.message === 'MIC_PERMISSION_DENIED'
            ? 'Hay cap quyen microphone trong Cai dat de dung giong noi.'
            : 'Khong the ghi am tren thiet bi nay.',
          type: 'error',
        });
      }
      return;
      popupModalRef.current?.show({
        title: 'Thông báo',
        message: 'Chức năng ghi nợ giọng nói hiện hỗ trợ trên giao diện Web.',
        type: 'info'
      });
      return;
    }

    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());

          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Audio = reader.result;

            setScanning(true);
            try {
              const response = await api.post('/transactions/voice-to-text', {
                audio: base64Audio,
                mimeType: 'audio/webm'
              }, { timeout: 120000 });

              if (response.data.success) {
                processParseResult(response.data, '🎤 KẾT QUẢ GHI NỢ GIỌNG NÓI');
              } else {
                popupModalRef.current?.show({
                  title: 'Thất bại',
                  message: response.data.message || 'Không thể dịch giọng nói.',
                  type: 'error'
                });
              }
            } catch (err) {
              console.error(err);
              popupModalRef.current?.show({
                title: err.response?.status === 400 ? 'Lỗi nhận diện' : 'Lỗi kết nối',
                message: err.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ dịch giọng nói.',
                type: 'error'
              });
            } finally {
              setScanning(false);
            }
          };
          reader.readAsDataURL(audioBlob);
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error(err);
        popupModalRef.current?.show({
          title: 'Lỗi thiết bị',
          message: 'Không thể truy cập Micro. Bạn có muốn tự nhập câu thoại bằng chữ để AI phân tích không?',
          type: 'confirm',
          confirmText: 'Nhập chữ',
          cancelText: 'Hủy bỏ',
          onConfirm: () => handleTypeTextFallback(),
        });
      }
    }
  };

  // Xử lý quay lại trang danh sách khách hàng
  const handleBack = () => {
    router.replace({
      pathname: '/',
      params: { view: 'customers' }
    });
  };

  // Xử lý xác nhận xóa khách hàng trước khi thực hiện qua PopupModal
  const confirmDeleteCustomer = () => {
    popupModalRef.current?.show({
      title: 'Xác nhận xóa',
      message: 'Bạn có chắc chắn muốn xóa khách hàng này không? Mọi lịch sử giao dịch liên quan sẽ không thể truy cập trực tiếp nữa.',
      type: 'confirm',
      confirmText: 'Xóa ngay',
      cancelText: 'Hủy bỏ',
      onConfirm: handleDeleteCustomer,
    });
  };

  // Gửi yêu cầu xóa khách hàng đến API backend
  const handleDeleteCustomer = async () => {
    try {
      const response = await api.delete(`/customers/${id}`);
      if (response.data.success) {
        popupModalRef.current?.show({
          title: 'Thành công',
          message: 'Đã xóa khách hàng thành công.',
          type: 'success',
          onConfirm: () => {
            router.replace('/'); // Trở về trang chủ
          }
        });
      } else {
        popupModalRef.current?.show({
          title: 'Thất bại',
          message: response.data.message || 'Không thể xóa khách hàng.',
          type: 'error'
        });
      }
    } catch (err) {
      console.error(err);
      popupModalRef.current?.show({
        title: 'Lỗi kết nối',
        message: err.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ để xóa khách hàng.',
        type: 'error'
      });
    }
  };

  // Xử lý chuyển đổi trạng thái nợ xấu (Bad Debt)
  const handleToggleBadDebt = async () => {
    if (!customer) return;
    const nextStatus = !customer.isBadDebt;

    popupModalRef.current?.show({
      title: nextStatus ? 'Đánh dấu nợ xấu' : 'Khôi phục hoạt động',
      message: nextStatus
        ? `Bạn có chắc chắn muốn đánh dấu khách hàng "${customer.name}" là nợ xấu? Khách hàng này sẽ được chuyển vào Kho lưu trữ nợ xấu và khóa chức năng ghi nợ mới.`
        : `Bạn có chắc chắn muốn khôi phục khách hàng "${customer.name}" hoạt động bình thường không?`,
      type: 'confirm',
      confirmText: 'Xác nhận',
      cancelText: 'Hủy',
      onConfirm: async () => {
        try {
          const response = await api.put(`/customers/${id}`, { isBadDebt: nextStatus });
          if (response.data.success) {
            popupModalRef.current?.show({
              title: 'Thành công',
              message: nextStatus ? 'Đã chuyển khách hàng vào kho nợ xấu.' : 'Đã khôi phục khách hàng hoạt động bình thường.',
              type: 'success',
              onConfirm: () => {
                handleRefreshAll();
              }
            });
          } else {
            alert(response.data.message || 'Thao tác thất bại.');
          }
        } catch (err) {
          console.error(err);
          alert(err.response?.data?.message || 'Có lỗi xảy ra khi thực hiện thao tác.');
        }
      }
    });
  };

  // Xử lý thực hiện cuộc gọi điện thoại cho khách hàng
  const handleCall = (phoneNumber) => {
    if (phoneNumber) {
      Linking.openURL(`tel:${phoneNumber}`).catch(() => {
        popupModalRef.current?.show({
          title: 'Thông báo',
          message: 'Thiết bị của bạn không hỗ trợ tính năng gọi điện.',
          type: 'warning'
        });
      });
    }
  };

  // Xử lý điều hướng nhắn tin Zalo cho khách hàng
  const handleZalo = (phoneNumber) => {
    if (phoneNumber) {
      // Bỏ các ký tự không phải số
      let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

      // Định dạng số điện thoại chuẩn Zalo App (84xxxxxxxxx)
      let appPhone = cleanPhone;
      if (appPhone.startsWith('0')) {
        appPhone = '84' + appPhone.slice(1);
      } else if (!appPhone.startsWith('84')) {
        appPhone = '84' + appPhone;
      }

      // Định dạng số điện thoại chuẩn Web (0xxxxxxxxx)
      let webPhone = cleanPhone;
      if (webPhone.startsWith('84')) {
        webPhone = '0' + webPhone.slice(2);
      }

      // Thử mở bằng giao thức zalo:// để gọi trực tiếp ứng dụng Zalo
      const zaloAppUrl = `zalo://conversation?phone=${appPhone}`;
      const zaloWebUrl = `https://zalo.me/${webPhone}`;

      Linking.openURL(zaloAppUrl).catch(() => {
        // Dự phòng: Nếu không mở được app trực tiếp, chuyển hướng sang trang web Zalo
        Linking.openURL(zaloWebUrl).catch(() => {
          popupModalRef.current?.show({
            title: 'Thông báo',
            message: 'Không thể mở ứng dụng Zalo.',
            type: 'warning'
          });
        });
      });
    }
  };

  // Xử lý mở địa chỉ khách hàng trên ứng dụng bản đồ (Google Maps / Apple Maps)
  const handleOpenMap = (address) => {
    if (address) {
      const query = encodeURIComponent(address);
      const url = Platform.select({
        ios: `maps://app?q=${query}`,
        android: `geo:0,0?q=${query}`,
        default: `https://www.google.com/maps/search/?api=1&query=${query}`,
      });
      Linking.openURL(url).catch(() => {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
      });
    }
  };

  // 1. Tải thông tin chi tiết khách hàng
  const {
    data: customerResponse,
    isLoading: isLoadingCustomer,
    refetch: refetchCustomer,
  } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => (await api.get(`/customers/${id}`)).data,
  });

  // 2. Tải lịch sử đơn ghi nợ
  const {
    data: transactionsResponse,
    isLoading: isLoadingTrans,
    refetch: refetchTrans,
  } = useQuery({
    queryKey: ['transactions', id],
    queryFn: async () => (await api.get(`/transactions?customerId=${id}`)).data,
  });

  // 3. Tải lịch sử thu tiền
  const {
    data: paymentsResponse,
    isLoading: isLoadingPayments,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: ['payments', id],
    queryFn: async () => (await api.get(`/payments?customerId=${id}`)).data,
  });

  const customer = customerResponse?.data;
  const transactions = transactionsResponse?.data || [];
  const payments = paymentsResponse?.data || [];

  // Tạo hiệu ứng chuyển cảnh mượt mà khi tải dữ liệu xong (chỉ chạy trên Mobile)
  useEffect(() => {
    if (Platform.OS !== 'web' && LayoutAnimation) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [isLoadingCustomer, isLoadingTrans, isLoadingPayments, transactions, payments]);

  // 4. Làm mới toàn bộ dữ liệu
  const handleRefreshAll = () => {
    refetchCustomer();
    refetchTrans();
    refetchPayments();
  };

  // ─── Helper: tạo date key "DD/MM/YYYY" từ ISO string ────────────────────
  const toDateKey = (dateStr) => {
    const d = new Date(dateStr);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // 5. Nhóm tất cả giao dịch theo ngày (DD/MM/YYYY)
  //    Mỗi ngày là 1 ô tile duy nhất trên grid
  // 5. Nhóm tất cả giao dịch theo ngày (DD/MM/YYYY) và thực hiện phân bổ thanh toán FIFO
  //    Mỗi ngày là 1 ô tile duy nhất trên grid
  // Nhóm các giao dịch và thanh toán theo tháng mục tiêu và theo ngày thực tế phát sinh
  const monthGroups = useMemo(() => {
    // 1. Phân loại các đợt thanh toán (thanh toán cụ thể ngày vs thanh toán cụ thể tháng vs thanh toán chung)
    const remainingDebtMap = {};
    transactions.forEach((t) => {
      remainingDebtMap[t.id] = parseFloat(t.totalAmount || 0);
    });

    const remainingPayMap = {};
    payments.forEach((p) => {
      remainingPayMap[p.id] = parseFloat(p.amount || 0);
    });

    const transAllocations = {}; // t.id -> array of { paymentId, date, amount, note }
    const payAllocations = {};   // p.id -> array of { transactionId, date, amount, note }

    const recordAllocation = (tId, tDate, tNote, pId, pDate, pNote, amount) => {
      if (!transAllocations[tId]) transAllocations[tId] = [];
      transAllocations[tId].push({ paymentId: pId, date: pDate, amount, note: pNote });

      if (!payAllocations[pId]) payAllocations[pId] = [];
      payAllocations[pId].push({ transactionId: tId, date: tDate, amount, note: tNote });
    };

    // A. Phân bổ theo ngày cụ thể (Specific Date matching)
    payments.forEach((p) => {
      const trimNote = (p.note || '').trim();
      const dateMatch = trimNote.match(/^Thanh toán nợ ngày (\d{2})\/(\d{2})\/(\d{4})/);
      if (dateMatch) {
        const dateKey = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
        const dayTransactions = transactions
          .filter((t) => toDateKey(t.date) === dateKey)
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        dayTransactions.forEach((t) => {
          const debtAmt = remainingDebtMap[t.id];
          const payAmt = remainingPayMap[p.id];
          if (debtAmt > 0 && payAmt > 0) {
            const allocAmt = Math.min(debtAmt, payAmt);
            remainingDebtMap[t.id] -= allocAmt;
            remainingPayMap[p.id] -= allocAmt;
            recordAllocation(t.id, t.date, t.note, p.id, p.paidAt, p.note, allocAmt);
          }
        });
      }
    });

    // B. Phân bổ theo tháng cụ thể (Specific Month matching)
    payments.forEach((p) => {
      const trimNote = (p.note || '').trim();
      const monthMatch = trimNote.match(/^Thanh toán nợ Tháng (\d{2})\/(\d{4})/);
      if (monthMatch) {
        const monthKey = `${monthMatch[1]}/${monthMatch[2]}`;
        const monthTransactions = transactions
          .filter((t) => {
            const d = new Date(t.date);
            const mm = (d.getMonth() + 1).toString().padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${mm}/${yyyy}` === monthKey;
          })
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        monthTransactions.forEach((t) => {
          const debtAmt = remainingDebtMap[t.id];
          const payAmt = remainingPayMap[p.id];
          if (debtAmt > 0 && payAmt > 0) {
            const allocAmt = Math.min(debtAmt, payAmt);
            remainingDebtMap[t.id] -= allocAmt;
            remainingPayMap[p.id] -= allocAmt;
            recordAllocation(t.id, t.date, t.note, p.id, p.paidAt, p.note, allocAmt);
          }
        });
      }
    });

    // C. Phân bổ chung FIFO (cho phần còn dư của thanh toán cụ thể và thanh toán chung)
    const sortedPayments = [...payments].sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    sortedPayments.forEach((p) => {
      sortedTransactions.forEach((t) => {
        const debtAmt = remainingDebtMap[t.id];
        const payAmt = remainingPayMap[p.id];
        if (debtAmt > 0 && payAmt > 0) {
          const allocAmt = Math.min(debtAmt, payAmt);
          remainingDebtMap[t.id] -= allocAmt;
          remainingPayMap[p.id] -= allocAmt;
          recordAllocation(t.id, t.date, t.note, p.id, p.paidAt, p.note, allocAmt);
        }
      });
    });

    // 5. Gom nhóm các giao dịch và thanh toán theo tháng mục tiêu, sau đó theo ngày thực tế phát sinh
    const groups = {}; // key: "MM/YYYY"

    const getTransactionTargetMonth = (t) => {
      const d = new Date(t.date);
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}/${yyyy}`;
    };

    const getPaymentTargetMonth = (p) => {
      const trimNote = (p.note || '').trim();
      const monthMatch = trimNote.match(/^Thanh toán nợ Tháng (\d{2})\/(\d{4})/);
      const dateMatch = trimNote.match(/^Thanh toán nợ ngày (\d{2})\/(\d{2})\/(\d{4})/);

      if (monthMatch) {
        return `${monthMatch[1]}/${monthMatch[2]}`;
      }
      if (dateMatch) {
        return `${dateMatch[2]}/${dateMatch[3]}`;
      }
      const d = new Date(p.paidAt);
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}/${yyyy}`;
    };

    const getOrCreateMonthGroup = (monthKey) => {
      if (!groups[monthKey]) {
        groups[monthKey] = {
          monthKey,
          monthLabel: `Tháng ${monthKey}`,
          daysMap: new Map(),
          totalDebt: 0,
          remainingDebt: 0,
        };
      }
      return groups[monthKey];
    };

    // Đưa giao dịch vào đúng tháng mục tiêu và ngày thực tế
    transactions.forEach((t) => {
      const monthKey = getTransactionTargetMonth(t);
      const mGroup = getOrCreateMonthGroup(monthKey);

      const key = toDateKey(t.date);
      if (!mGroup.daysMap.has(key)) {
        mGroup.daysMap.set(key, {
          dateKey: key,
          date: t.date, // Dùng ngày giao dịch thực tế
          transactions: [],
          payments: [],
          totalDebt: 0,
          remainingDebt: 0,
          totalPayment: 0,
        });
      }
      const g = mGroup.daysMap.get(key);
      const originalAmt = parseFloat(t.totalAmount);
      const remainingAmt = remainingDebtMap[t.id] !== undefined ? remainingDebtMap[t.id] : originalAmt;

      g.transactions.push({
        id: t.id,
        type: 'debt',
        date: t.date,
        amount: originalAmt,
        remainingAmount: remainingAmt,
        note: t.note,
        items: t.items || [],
        allocations: transAllocations[t.id] || [], // Truyền thông tin phân bổ thanh toán
      });
      g.totalDebt += originalAmt;
      g.remainingDebt += remainingAmt;

      mGroup.totalDebt += originalAmt;
      mGroup.remainingDebt += remainingAmt;
    });

    // Đưa khoản thanh toán vào đúng tháng mục tiêu và ngày thực tế thu tiền
    payments.forEach((p) => {
      const payMonthKey = getPaymentTargetMonth(p);
      const mGroup = getOrCreateMonthGroup(payMonthKey);
      const payDateKey = toDateKey(p.paidAt);

      if (!mGroup.daysMap.has(payDateKey)) {
        mGroup.daysMap.set(payDateKey, {
          dateKey: payDateKey,
          date: p.paidAt, // Dùng ngày thanh toán thực tế
          transactions: [],
          payments: [],
          totalDebt: 0,
          remainingDebt: 0,
          totalPayment: 0,
        });
      }
      const g = mGroup.daysMap.get(payDateKey);
      
      // Kiểm tra xem lượt trả này đã được thêm vào ngày này chưa để tránh nhân đôi
      if (!g.payments.some((existingPay) => existingPay.id === p.id)) {
        const allocations = payAllocations[p.id] || [];
        g.payments.push({
          id: p.id,
          type: 'payment',
          date: p.paidAt,
          amount: parseFloat(p.amount), // Ghi nhận toàn bộ số tiền trả vào ngày thực tế
          note: p.note,
          allocations: allocations,
        });
        g.totalPayment += parseFloat(p.amount);
      }
    });

    // Chuyển đối map ngày sang danh sách và sắp xếp từ ngày mới nhất đến cũ nhất
    const result = Object.values(groups).map((mGroup) => {
      const days = Array.from(mGroup.daysMap.values()).sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );

      // Tính tổng đã thanh toán của tháng dựa trên nợ gốc và nợ còn lại
      const totalPayment = Math.max(0, mGroup.totalDebt - mGroup.remainingDebt);

      return {
        monthKey: mGroup.monthKey,
        monthLabel: mGroup.monthLabel,
        days,
        totalDebt: mGroup.totalDebt,
        remainingDebt: mGroup.remainingDebt,
        totalPayment,
      };
    });

    // Sắp xếp các tháng từ mới nhất đến cũ nhất
    return result.sort((a, b) => {
      const [aM, aY] = a.monthKey.split('/').map(Number);
      const [bM, bY] = b.monthKey.split('/').map(Number);
      return bY - aY || bM - aM;
    });

  }, [transactions, payments]);

  // ─── Helper: định dạng tiền VNĐ ─────────────────────────────────────────
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(amount)
      .replace('₫', 'đ');

  // ─── Helper: tiền rút gọn cho tile (280k / 1.5tr) ───────────────────────
  const formatAmountShort = (amount) => {
    if (amount >= 1_000_000) {
      const v = (amount / 1_000_000).toFixed(1).replace(/\.0$/, '');
      return `${v}tr`;
    }
    return `${Math.round(amount / 1_000)}k`;
  };

  // ─── Helper: ngày/tháng ngắn (10/06) ────────────────────────────────────
  const formatShortDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  // ─── Helper: thứ viết rõ (Thứ 2 … C.Nhật) ───────────────────────────
  const getWeekday = (dateStr) =>
    ['C.Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][new Date(dateStr).getDay()];

  // ─── Tính kích thước tile chính xác để hiển thị khít 3 ô trên 1 hàng ───
  const NUM_COLS = 3;
  const TILE_GAP = 8;
  const SIDE_PAD = 16; // Dùng làm padding cho danh sách ngoài trong JSX render
  const CONTAINER_PADDING = 4; // Padding của container tháng bên trong
  const REAL_SIDE_PAD = SIDE_PAD + CONTAINER_PADDING; // Tổng padding thực tế mỗi bên
  const contentWidth = Math.min(width, 600);
  // Trừ đi 12px đệm an toàn để tránh rớt cột do thanh cuộn (scrollbar) hoặc làm tròn pixel
  const tileSize = Math.floor(
    (contentWidth - 12 - REAL_SIDE_PAD * 2 - TILE_GAP * (NUM_COLS - 1)) / NUM_COLS
  );

  const isLoading = isLoadingCustomer || isLoadingTrans || isLoadingPayments;

  // Tính toán avatar cho khách hàng hiển thị trên Header
  const firstLetter = customer ? (customer.name || 'K').trim().charAt(0).toUpperCase() : 'K';
  const avatarBgColors = ['#FFE2E2', '#E3F2FD', '#E8F5E9', '#FFF3E0', '#F3E5F5', '#E0F7FA'];
  const avatarTextColors = ['#D32F2F', '#1976D2', '#388E3C', '#F57C00', '#7B1FA2', '#0097A7'];
  const charCode = customer && customer.name ? customer.name.charCodeAt(0) : 0;
  const colorIdx = charCode % avatarBgColors.length;
  const avatarBg = avatarBgColors[colorIdx];
  const avatarText = avatarTextColors[colorIdx];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.contentWrapper}>
        {/* ── HEADER đơn giản: Nút Quay lại bên trái, Profile khách hàng bên phải (Avatar bên trái Tên) ── */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButtonNew}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Text style={styles.backTextNew}>← Quay lại</Text>
          </TouchableOpacity>

          {customer ? (
            <View style={styles.customerProfileCardRight}>
              <View style={[styles.avatarContainerRight, { backgroundColor: avatarBg }]}>
                <Text style={[styles.avatarTextRight, { color: avatarText }]}>
                  {firstLetter}
                </Text>
              </View>
              <View style={styles.customerDetailsRight}>
                <Text style={styles.customerGreetingRight}>Khách hàng 👥</Text>
                <Text style={styles.customerNameRight} numberOfLines={1}>
                  {customer.name}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.headerPlaceholder} />
          )}
        </View>

        {/* ── NỘI DUNG CUỘN ──────────────────────────────────────────────── */}
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={handleRefreshAll}
              colors={[COLORS.primaryDark]}
              tintColor={COLORS.primaryDark}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Thẻ tổng nợ */}
          <View style={[
            styles.debtSummaryCard,
            customer?.isBadDebt
              ? styles.cardBadDebt
              : customer?.debt > 0
                ? styles.cardHasDebt
                : styles.cardNoDebt,
          ]}>
            <Text style={customer?.isBadDebt ? styles.debtLabelBad : styles.debtLabel}>
              {customer?.isBadDebt ? '⚠️ SỐ NỢ XẤU KHOANH VÙNG:' : 'SỐ TIỀN CÒN NỢ HIỆN TẠI:'}
            </Text>
            <Text style={[
              styles.debtValue,
              customer?.isBadDebt
                ? styles.textBadDebt
                : customer?.debt > 0
                  ? styles.textDebt
                  : styles.textPayment,
            ]}>
              {formatCurrency(customer?.debt || 0)}
            </Text>
          </View>

          {/* Thông tin liên hệ */}
          {(customer?.phone || customer?.address || customer?.note) ? (
            <View style={styles.infoSection}>
              {customer?.phone ? (
                // Hàng chứa SĐT và các nút gọi, zalo ngang hàng (bỏ border/padding nếu không có thông tin phía sau)
                <View style={[
                  styles.phoneSectionContainer,
                  !(customer?.address || customer?.note) && { borderBottomWidth: 0, paddingBottom: 0 }
                ]}>
                  <Text style={styles.phoneText} numberOfLines={1}>📞 {customer.phone}</Text>
                  <View style={styles.phoneContactActions}>
                    <TouchableOpacity
                      style={[styles.contactActionBtn, styles.callBtn]}
                      onPress={() => handleCall(customer.phone)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.contactActionText, styles.callBtnText]}>Gọi 📞</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.contactActionBtn, styles.zaloBtn]}
                      onPress={() => handleZalo(customer.phone)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.contactActionText, styles.zaloBtnText]}>Zalo 💬</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
              {customer?.address ? (
                // Hiển thị địa chỉ và nút Tìm trên bản đồ dưới dạng nút lồng inline (bỏ border/padding nếu không có ghi chú phía sau)
                <View style={[
                  styles.addressSectionContainer,
                  !customer?.note && { borderBottomWidth: 0, paddingBottom: 0 }
                ]}>
                  <Text style={styles.addressText}>
                    📍{customer.address}{' '}
                    <Text
                      style={styles.inlineMapBtn}
                      onPress={() => handleOpenMap(customer.address)}
                    >
                      {' '}Tìm trên bản đồ 🗺️{' '}
                    </Text>
                  </Text>
                </View>
              ) : null}
              {customer?.note
                ? <Text style={styles.infoRow}>💡 Ghi chú: {customer.note}</Text>
                : null}
            </View>
          ) : null}

          {/* Nhóm nút Quản trị khách hàng (Sửa/Xóa) */}
          {customer ? (
            <View style={styles.customerAdminActions}>
              <TouchableOpacity
                style={styles.editCustomerBtnNew}
                onPress={() => editCustomerModalRef.current?.open(customer)}
                activeOpacity={0.7}
              >
                <Text style={styles.editCustomerBtnTextNew}>Sửa thông tin ✏️</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={customer?.isBadDebt ? styles.restoreCustomerBtn : styles.badDebtCustomerBtn}
                onPress={handleToggleBadDebt}
                activeOpacity={0.7}
              >
                <Text style={customer?.isBadDebt ? styles.restoreCustomerBtnText : styles.badDebtCustomerBtnText}>
                  {customer?.isBadDebt ? 'Khôi phục 🔄' : 'Nợ xấu ⚠️'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteCustomerBtnNew}
                onPress={confirmDeleteCustomer}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteCustomerBtnTextNew}>Xóa 🗑️</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* ── TIÊU ĐỀ LỊCH SỬ ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📚 LỊCH SỬ MUA BÁN</Text>
          </View>

          {/* Chú thích */}
          {monthGroups.length > 0 && (
            <View style={styles.legend}>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
                  <Text style={styles.legendText}>Hết nợ</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.danger }]} />
                  <Text style={styles.legendText}>Còn nợ</Text>
                </View>
              </View>
              <Text style={styles.legendHint}>• Bấm vào ô để xem chi tiết</Text>
            </View>
          )}

          {/* ── LỊCH SỬ MUA BÁN THEO THÁNG ── */}
          {isLoading && monthGroups.length === 0 ? (
            <ActivityIndicator
              size="large"
              color={COLORS.primaryDark}
              style={{ marginTop: 40 }}
            />
          ) : monthGroups.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyText}>
                Chưa có lịch sử mua bán hay thu tiền nào.
              </Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: SIDE_PAD + CONTAINER_PADDING }}>
              <View style={styles.monthGrid}>
                {monthGroups.map((month) => {
                  // Xác định trạng thái nợ của tháng để hiển thị màu sắc phù hợp
                  const hasDebt = month.remainingDebt > 0;

                  let bgColor, bdColor, txtColor, statusLabel;
                  if (!hasDebt) {
                    // Đã thanh toán hết nợ: màu xanh lá nhạt
                    bgColor = '#F0FDF4';
                    bdColor = '#86EFAC';
                    txtColor = COLORS.primary;
                    statusLabel = 'Hết nợ ✅';
                  } else {
                    // Còn nợ chưa thanh toán: màu đỏ nhạt
                    bgColor = '#FFF1F1';
                    bdColor = '#FECACA';
                    txtColor = COLORS.danger;
                    statusLabel = 'Còn nợ ⚠️';
                  }

                  // Định dạng tháng hiển thị rút gọn (Tháng MM/YY)
                  const [mm, yyyy] = month.monthKey.split('/');
                  const shortYear = yyyy.substring(2);
                  const shortMonthLabel = `Tháng ${mm}/${shortYear}`;

                  return (
                    <TouchableOpacity
                      key={month.monthKey}
                      style={[
                        styles.monthTile,
                        {
                          width: tileSize,
                          height: tileSize - 14, // Giảm bớt chiều cao theo yêu cầu người dùng
                          backgroundColor: bgColor,
                          borderColor: bdColor,
                        },
                      ]}
                      onPress={() => monthDrawerRef.current?.open(month)}
                      activeOpacity={0.7}
                    >
                      {/* Trạng thái nợ */}
                      <Text
                        style={[styles.monthTileStatus, { color: txtColor }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {statusLabel}
                      </Text>

                      {/* Nhãn hiển thị tháng */}
                      <Text style={styles.monthTileName} numberOfLines={1} adjustsFontSizeToFit>
                        {shortMonthLabel}
                      </Text>

                      {/* Dư nợ còn lại trong tháng */}
                      <Text style={[styles.monthTileAmount, { color: txtColor }]} numberOfLines={1}>
                        {hasDebt ? formatAmountShort(month.remainingDebt) : '0đ'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── NÚT CỐ ĐỊNH DƯỚI ĐÁY ── */}
        {customer?.isBadDebt ? (
          <View style={styles.bottomBarLocked}>
            <Text style={styles.lockedText}>
              ⚠️ Khách hàng này đang ở trạng thái nợ xấu. Vui lòng khôi phục hoạt động để ghi nợ mới.
            </Text>
          </View>
        ) : (
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                isRecording ? styles.btnRecording : styles.btnVoice
              ]}
              onPress={handleToggleRecording}
              disabled={scanning}
            >
              {scanning ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : isRecording ? (
                <Text style={styles.actionButtonText}>🔴 ĐANG GHI... (BẤM DỪNG)</Text>
              ) : (
                <Text style={styles.actionButtonText}>🎤 NÓI GHI NỢ</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.btnDebt]}
              onPress={() => debtModalRef.current?.open()}
              disabled={isRecording || scanning}
            >
              <Text style={styles.actionButtonText}>🔴 GHI NỢ MỚI</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <DebtModal ref={debtModalRef} customerId={id} onRefresh={handleRefreshAll} />
      <PaymentModal ref={paymentModalRef} customerId={id} onRefresh={handleRefreshAll} />
      <ScanTicketModal ref={scanTicketModalRef} customerId={id} onRefresh={handleRefreshAll} />
      <TransactionDetailModal
        ref={detailModalRef}
        customerId={id}
        monthGroups={monthGroups}
        onRefresh={handleRefreshAll}
        onEditTransaction={(transaction) => editDebtModalRef.current?.open(transaction)}
        onEditPayment={(payment) => editPaymentModalRef.current?.open(payment)}
      />
      <EditDebtModal ref={editDebtModalRef} onRefresh={handleRefreshAll} />
      <EditPaymentModal ref={editPaymentModalRef} onRefresh={handleRefreshAll} />
      <EditCustomerModal ref={editCustomerModalRef} onRefresh={handleRefreshAll} />
      <MonthDetailDrawer
        ref={monthDrawerRef}
        monthGroups={monthGroups}
        formatCurrency={formatCurrency}
        formatShortDate={formatShortDate}
        formatAmountShort={formatAmountShort}
        getWeekday={getWeekday}
        paymentModalRef={paymentModalRef}
        detailModalRef={detailModalRef}
        debtModalRef={debtModalRef}
      />
      <PopupModal ref={popupModalRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: COLORS.background,
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9', // Viền siêu mỏng nhạt màu
    ...SHADOWS.card,
  },
  backButtonNew: {
    width: 90,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backTextNew: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  customerProfileCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainerRight: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    marginRight: 10,
  },
  avatarTextRight: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  customerDetailsRight: {
    alignItems: 'flex-start',
  },
  customerGreetingRight: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  customerNameRight: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
    maxWidth: 150, // Giới hạn chiều rộng tên khách hàng tránh tràn
  },
  headerPlaceholder: {
    width: 90,
  },
  // Style cho nhóm nút hành động quản lý khách hàng phía dưới
  customerAdminActions: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  editCustomerBtnNew: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#ECFDF5', // Xanh lục pastel nhạt
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    ...SHADOWS.card,
  },
  editCustomerBtnTextNew: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#047857',
  },
  deleteCustomerBtnNew: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFF1F1', // Đỏ pastel nhạt
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    ...SHADOWS.card,
  },
  deleteCustomerBtnTextNew: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  // Container SĐT: Hiển thị ngang hàng SĐT và các nút hành động (giảm padding để gọn hơn)
  phoneSectionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingBottom: 10,
  },
  phoneRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  // Chữ hiển thị số điện thoại (đậm, to rõ hơn)
  phoneText: {
    fontSize: FONTS.body + 1,
    color: COLORS.text,
    fontWeight: 'bold',
    marginRight: 8,
  },
  phoneActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtn: {
    backgroundColor: COLORS.inputBg,
    borderColor: COLORS.border,
  },
  editBtnText: {
    color: COLORS.textSecondary,
  },
  phoneActionText: {
    fontSize: FONTS.caption + 1, // Tăng thêm 1
    fontWeight: 'bold',
  },
  phoneContactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  // Nút hành động liên lạc (Gọi, Zalo) thiết kế nhỏ gọn pill (tăng nhẹ kích thước theo yêu cầu)
  contactActionBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callBtn: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#A7F3D0',
  },
  callBtnText: {
    color: COLORS.primaryDark,
  },
  zaloBtn: {
    backgroundColor: '#EBF5FF',
    borderColor: '#BFE0FF',
  },
  zaloBtnText: {
    color: '#0068FF',
  },
  // Chữ trên nút hành động (tăng nhẹ cỡ chữ)
  contactActionText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingBottom: 130,
  },
  debtSummaryCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    ...SHADOWS.card,
  },
  cardHasDebt: {
    backgroundColor: COLORS.dangerLight,
    borderColor: '#FECACA',
  },
  cardNoDebt: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#A7F3D0',
  },
  debtLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  debtValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  // Khung thông tin khách hàng (giảm padding từ 16 xuống 12)
  infoSection: {
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoRow: {
    fontSize: FONTS.body + 1, // Tăng thêm 1
    color: COLORS.text,
    marginTop: 8,
    lineHeight: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
    gap: 10,
  },
  sectionTitle: {
    flex: 1,
    fontSize: FONTS.subtitle + 1, // Tăng thêm 1
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
  },
  countBadge: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  countText: {
    fontSize: FONTS.caption + 1, // Tăng thêm 1
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  legend: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendText: {
    fontSize: FONTS.caption + 1, // Tăng thêm 1
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  legendHint: {
    fontSize: FONTS.caption + 1, // Tăng thêm 1
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
  // ── Grid ô vuông ─────────────────────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 8,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...SHADOWS.card,
  },
  tileWeekday: {
    fontSize: 14, // Tăng từ 13
    fontWeight: 'bold',
  },
  tileDate: {
    fontSize: 14, // Tăng từ 13
    fontWeight: '700',
    color: COLORS.text,
  },
  tileAmount: {
    fontSize: 17, // Tăng từ 16
    fontWeight: 'bold',
  },
  tileMixedBadge: {
    fontSize: 11, // Tăng từ 10
    fontWeight: 'bold',
    color: COLORS.primaryDark,
    marginTop: -2,
  },
  // ── Trạng thái rỗng ───────────────────────────────────────────────────────
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 49, // Tăng từ 48
    marginBottom: 16,
  },
  emptyText: {
    fontSize: FONTS.body + 1, // Tăng thêm 1
    color: COLORS.textLight,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
  // ── Bottom bar ────────────────────────────────────────────────────────────
  bottomBar: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(248, 250, 252, 0.97)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  actionButton: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  btnDebt: {
    backgroundColor: COLORS.danger,
  },
  btnScanTicket: {
    backgroundColor: '#2563EB', // Màu xanh dương Premium
  },
  btnVoice: {
    backgroundColor: '#4F46E5', // Màu xanh dương pha tím Indigo cao cấp
  },
  btnRecording: {
    backgroundColor: COLORS.dangerDark, // Màu đỏ ghi âm cảnh báo đang ghi âm
  },
  // Container cho phần hiển thị địa chỉ
  addressSectionContainer: {
    marginTop: 10,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingBottom: 10,
  },
  // Style cho chữ địa chỉ
  addressText: {
    fontSize: FONTS.body + 1, // Tăng thêm 1
    color: COLORS.text,
    lineHeight: 22,
  },
  // Style cho nút bản đồ lồng inline chạy theo đuôi text địa chỉ
  inlineMapBtn: {
    color: '#1D4ED8',
    fontWeight: 'bold',
    fontSize: 12,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    overflow: 'hidden', // Cực kỳ quan trọng để hiển thị border radius trên iOS
  },
  monthExpandedContainer: {
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  monthSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  monthDebtSummaryContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    marginRight: 10,
  },
  monthDebtSummaryText: {
    fontSize: 14, // Tăng từ 13
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  monthDebtSummaryValue: {
    color: COLORS.danger,
    fontWeight: 'bold',
    fontSize: 19, // Tăng từ 18
  },
  monthPaymentBtn: {
    backgroundColor: '#ECFDF5', // Xanh lá pastel siêu nhẹ cao cấp
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20, // Bo tròn dạng capsule mềm mại
  },
  monthPaymentBtnText: {
    color: '#047857', // Chữ xanh lá đậm sang trọng
    fontSize: 14, // Tăng từ 13
    fontWeight: 'bold',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  textDebt: { color: COLORS.danger },
  textPayment: { color: COLORS.primary },
  // ── Phần hiển thị theo tháng ──
  monthSection: {
    marginBottom: 16,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
    ...SHADOWS.card,
  },
  monthHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthChevron: {
    fontSize: 13, // Tăng từ 12
    color: COLORS.textSecondary,
    width: 16,
    textAlign: 'center',
  },
  monthStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  monthTitle: {
    fontSize: 17, // Tăng từ 16
    fontWeight: 'bold',
    color: COLORS.text,
  },
  monthHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewDetailText: {
    fontSize: FONTS.caption + 1, // Tăng thêm 1
    fontWeight: 'bold',
    color: COLORS.primaryDark,
  },
  monthChevronRight: {
    fontSize: 11, // Tăng từ 10
    color: COLORS.primaryDark,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthTile: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 6, // Giảm nhẹ padding để tăng diện tích hiển thị hàng ngang
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...SHADOWS.card,
  },
  monthTileStatus: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  monthTileName: {
    fontSize: 12, // Giảm nhẹ cỡ chữ để "Tháng MM/YY" nằm trọn vẹn trên 1 hàng
    fontWeight: '700',
    color: COLORS.text,
  },
  monthTileAmount: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  cardBadDebt: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  debtLabelBad: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#D97706',
  },
  textBadDebt: {
    color: '#B45309',
  },
  badDebtCustomerBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEF3C7', // Vàng nhạt
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
    ...SHADOWS.card,
  },
  badDebtCustomerBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#D97706',
  },
  restoreCustomerBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E0F2FE', // Xanh nhạt
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    ...SHADOWS.card,
  },
  restoreCustomerBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  bottomBarLocked: {
    backgroundColor: '#FFF1F1',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#DC2626',
    textAlign: 'center',
  },
});
