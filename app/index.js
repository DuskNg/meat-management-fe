// meat-management-fe/app/index.js
import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../src/api/client';
import { useAuthStore } from '../src/store/authStore';
import { COLORS, FONTS, SHADOWS } from '../src/theme';
import AddCustomerModal from '../src/components/AddCustomerModal';
import ProductListModal from '../src/components/ProductListModal';
import ProfileModal from '../src/components/ProfileModal';
import EditCustomerModal from '../src/components/EditCustomerModal';
import PopupModal from '../src/components/PopupModal';
import ScanTicketModal from '../src/components/ScanTicketModal';
import ExportDebtModal from '../src/components/ExportDebtModal';
import DebtModal from '../src/components/DebtModal';
import PaymentModal from '../src/components/PaymentModal';
import TransactionDetailModal from '../src/components/TransactionDetailModal';
import EditDebtModal from '../src/components/EditDebtModal';
import EditPaymentModal from '../src/components/EditPaymentModal';
import CustomerDebtHistoryModal from '../src/components/CustomerDebtHistoryModal';
import DailyReportModal from '../src/components/DailyReportModal';
import AddBadDebtModal from '../src/components/AddBadDebtModal';
import AddSupplierModal from '../src/components/AddSupplierModal';
import SupplierDebtModal from '../src/components/SupplierDebtModal';
import SupplierPaymentModal from '../src/components/SupplierPaymentModal';
import SupplierHistoryModal from '../src/components/SupplierHistoryModal';
import AddEmployeeModal from '../src/components/AddEmployeeModal';
import SalaryAdvanceModal from '../src/components/SalaryAdvanceModal';
import EmployeeHistoryModal from '../src/components/EmployeeHistoryModal';
import EditEmployeeModal from '../src/components/EditEmployeeModal';
import AnimatedPressable from '../src/components/AnimatedPressable';
import { captureTicketImage, selectTicketImages, startNativeRecording, stopNativeRecording } from '../src/utils/mediaActions';

// Giữ nguyên markup/action hiện có nhưng bổ sung feedback scale cho toàn bộ nút của dashboard.
const TouchableOpacity = AnimatedPressable;

// Loại bỏ dấu tiếng Việt để phục vụ tìm kiếm không dấu
const removeDiacritics = (str) => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
};

export default function DashboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const auth = useAuthStore();
  const modalRef = useRef(null);
  const productModalRef = useRef(null);
  const profileModalRef = useRef(null);
  const editCustomerModalRef = useRef(null);
  const popupModalRef = useRef(null);
  const scanTicketModalRef = useRef(null);
  const exportDebtModalRef = useRef(null);
  const customerDebtHistoryModalRef = useRef(null);
  const debtModalRef = useRef(null);
  const paymentModalRef = useRef(null);
  const detailModalRef = useRef(null);
  const editDebtModalRef = useRef(null);
  const editPaymentModalRef = useRef(null);
  const dailyReportModalRef = useRef(null);
  const addBadDebtModalRef = useRef(null); // Modal thêm bản ghi nợ xấu mới
  const addSupplierModalRef = useRef(null);
  const supplierDebtModalRef = useRef(null);
  const supplierPaymentModalRef = useRef(null);
  const supplierHistoryModalRef = useRef(null);
  const addEmployeeModalRef = useRef(null);
  const salaryAdvanceModalRef = useRef(null);
  const employeeHistoryModalRef = useRef(null);
  const editEmployeeModalRef = useRef(null);

  const [currentView, setCurrentView] = useState(params.view || 'menu'); // 'menu' hoặc 'customers' để điều hướng
  const [search, setSearch] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showDebtSummary, setShowDebtSummary] = useState(false);
  const [selectedRevenueMonth, setSelectedRevenueMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  });

  // States quản lý tab nhân viên và chấm công / tính lương
  const [employeeTab, setEmployeeTab] = useState('STAFF'); // 'STAFF' (Nhân sự), 'ATTENDANCE' (Chấm công), 'SALARY' (Bảng lương)
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().split('T')[0]); // Ngày chấm công mặc định hôm nay
  const [attendanceList, setAttendanceList] = useState([]); // Danh sách chấm công tạm thời để gửi lưu
  const [showSaveToast, setShowSaveToast] = useState(false); // Trạng thái hiển thị thông báo toast khi lưu chấm công thành công
  const [salaryMonth, setSalaryMonth] = useState(() => {
    const d = new Date();
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }); // Tháng tính lương mặc định tháng hiện tại

  const [isRecording, setIsRecording] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanningMsg, setScanningMsg] = useState('AI đang phân tích...');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Đồng bộ view khi URL thay đổi (bao gồm cả khi reload hoặc bấm quay lại)
  React.useEffect(() => {
    setCurrentView(params.view || 'menu');
  }, [params.view]);

  // 1. Dùng React Query tải danh sách khách hàng và cache lại
  const { data: customersResponse, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get('/customers?isBadDebt=false');
      return response.data;
    },
  });

  // 1.5. Dùng React Query tải danh sách khách hàng nợ xấu
  const { data: badCustomersResponse, isLoading: isLoadingBad, refetch: refetchBad, isRefetching: isRefetchingBad } = useQuery({
    queryKey: ['bad_customers'],
    queryFn: async () => {
      const response = await api.get('/customers?isBadDebt=true');
      return response.data;
    },
  });

  const { data: paymentsResponse, isLoading: isLoadingPayments, refetch: refetchPayments } = useQuery({
    queryKey: ['customer_payments_summary'],
    queryFn: async () => {
      const response = await api.get('/payments');
      return response.data;
    },
    enabled: showDebtSummary,
  });

  // Các hàm làm mới dữ liệu khách hàng kèm theo lịch sử nợ chi tiết nếu đang mở
  const handleRefreshAll = () => {
    refetch();
    if (showDebtSummary) {
      refetchPayments();
    }
    customerDebtHistoryModalRef.current?.refresh();
  };

  const handleRefreshBadAll = () => {
    refetchBad();
    customerDebtHistoryModalRef.current?.refresh();
  };

  // 1.8. Dùng React Query tải danh sách nhà cung cấp
  const { data: suppliersResponse, isLoading: isLoadingSuppliers, refetch: refetchSuppliers, isRefetching: isRefetchingSuppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const response = await api.get('/suppliers');
      return response.data;
    },
  });

  // 1.9. Dùng React Query tải danh sách nhân viên
  const { data: employeesResponse, isLoading: isLoadingEmployees, refetch: refetchEmployees } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const response = await api.get('/employees');
      return response.data;
    },
  });

  // States và logic chấm công & bảng lương nhân viên
  const [salaryData, setSalaryData] = useState([]);
  const [loadingSalary, setLoadingSalary] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);

  // States phụ để nhập thưởng phạt khi mở rộng thẻ nhân viên để chốt lương
  const [activeSalaryEmpId, setActiveSalaryEmpId] = useState(null);
  const [bonusInput, setBonusInput] = useState('');
  const [deductionInput, setDeductionInput] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [payingSalaryEmpId, setPayingSalaryEmpId] = useState(null);

  // Lấy danh sách chấm công
  const fetchAttendanceList = async (dateStr) => {
    try {
      const response = await api.get(`/employees/attendance?date=${dateStr}`);
      if (response.data.success) {
        setAttendanceList(response.data.data);
      }
    } catch (err) {
      console.error("Lỗi tải danh sách chấm công:", err);
    }
  };

  // Lấy bảng lương tháng
  const fetchSalaryData = async (monthStr) => {
    setLoadingSalary(true);
    try {
      const response = await api.get(`/employees/salary/calculate?monthKey=${monthStr}`);
      if (response.data.success) {
        setSalaryData(response.data.data);
      }
    } catch (err) {
      console.error("Lỗi tải bảng lương:", err);
    } finally {
      setLoadingSalary(false);
    }
  };

  // Tự động load dữ liệu chấm công khi đổi ngày hoặc tab
  React.useEffect(() => {
    if (currentView === 'employees' && employeeTab === 'ATTENDANCE') {
      fetchAttendanceList(attendanceDate);
    }
  }, [currentView, employeeTab, attendanceDate]);

  // Tự động load dữ liệu bảng lương khi đổi tháng hoặc tab
  React.useEffect(() => {
    if (currentView === 'employees' && employeeTab === 'SALARY') {
      fetchSalaryData(salaryMonth);
    }
  }, [currentView, employeeTab, salaryMonth]);

  // Thay đổi trạng thái chấm công
  const handleToggleAttendance = (empId, status, shift = 'FULL') => {
    setAttendanceList((prev) =>
      prev.map((item) =>
        item.employeeId === empId ? { ...item, status, shift } : item
      )
    );
  };

  // Lưu bảng chấm công
  const handleSaveAttendance = async () => {
    if (savingAttendance) return; // Chống spam click
    setSavingAttendance(true);
    try {
      const response = await api.post('/employees/attendance', {
        date: attendanceDate,
        list: attendanceList,
      });
      if (response.data.success) {
        setShowSaveToast(true);
        // Tự động ẩn thông báo sau 5 giây
        setTimeout(() => {
          setShowSaveToast(false);
        }, 5000);
        fetchAttendanceList(attendanceDate);
      }
    } catch (err) {
      popupModalRef.current?.show({
        title: 'Thất bại',
        message: err.response?.data?.message || 'Không thể lưu chấm công.',
        type: 'error',
      });
    } finally {
      setSavingAttendance(false);
    }
  };

  // Gửi yêu cầu chốt trả lương
  const handlePaySalary = async (empId) => {
    if (payingSalaryEmpId) return; // Chống spam click
    setPayingSalaryEmpId(empId);
    try {
      const parseAmt = (val) => {
        const clean = val.replace(/[^0-9]/g, '');
        return clean ? parseInt(clean, 10) : 0;
      };

      const response = await api.post('/employees/salary/pay', {
        employeeId: empId,
        monthKey: salaryMonth,
        bonus: parseAmt(bonusInput),
        deductions: parseAmt(deductionInput),
        note: paymentNote.trim() || null,
      });

      if (response.data.success) {
        Alert.alert('Thành công', 'Đã chốt và chi trả lương tháng thành công.');
        setActiveSalaryEmpId(null);
        setBonusInput('');
        setDeductionInput('');
        setPaymentNote('');
        fetchSalaryData(salaryMonth);
      }
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message || 'Lỗi thanh toán lương.');
    } finally {
      setPayingSalaryEmpId(null);
    }
  };

  // Xử lý xác nhận xóa khách hàng trực tiếp trên trang chủ qua PopupModal
  const confirmDeleteCustomer = (customerId, customerName) => {
    popupModalRef.current?.show({
      title: 'Xác nhận xóa',
      message: `Bạn có chắc chắn muốn xóa khách hàng "${customerName}" không? Mọi lịch sử giao dịch liên quan sẽ không thể truy cập trực tiếp nữa.`,
      type: 'confirm',
      confirmText: 'Xóa ngay',
      cancelText: 'Hủy bỏ',
      onConfirm: () => handleDeleteCustomer(customerId),
    });
  };

  // Gửi yêu cầu xóa khách hàng lên backend và làm mới danh sách
  const handleDeleteCustomer = async (customerId) => {
    try {
      const response = await api.delete(`/customers/${customerId}`);
      if (response.data.success) {
        popupModalRef.current?.show({
          title: 'Thành công',
          message: 'Đã xóa khách hàng thành công.',
          type: 'success',
          onConfirm: () => refetch(),
        });
      } else {
        popupModalRef.current?.show({
          title: 'Thất bại',
          message: response.data.message || 'Không thể xóa khách hàng.',
          type: 'error',
        });
      }
    } catch (err) {
      console.error(err);
      popupModalRef.current?.show({
        title: 'Lỗi kết nối',
        message: err.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ để xóa khách hàng.',
        type: 'error',
      });
    }
  };

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

    if (results.length === 1 && firstResult.transaction_type === 'tra_tien') {
      if (customerId) {
        setSelectedCustomerId(customerId);
        setTimeout(() => {
          paymentModalRef.current?.open(firstResult.amount || '');
        }, 100);
      } else {
        popupModalRef.current?.show({
          title: 'Không nhận diện được khách hàng',
          message: `Yêu cầu trả tiền cho "${customerName}" nhưng không khớp với khách hàng nào trong sạp. Vui lòng chọn khách hàng thủ công để thanh toán.`,
          type: 'warning'
        });
      }
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
        customerId
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

          setScanningMsg('AI đang phân tích câu chữ...');
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

  // Xử lý quét tích kê nhận diện chữ từ ảnh chụp qua Gemini API
  const submitTicketImages = async (images) => {
    if (!images.length) return;

    setScanningMsg(`AI đang phân tích ${images.length} tích kê...`);
    setScanning(true);
    try {
      const responses = [];
      const batchSize = 4;
      for (let index = 0; index < images.length; index += batchSize) {
        const batchResponses = await Promise.all(
          images.slice(index, index + batchSize).map((image) => api.post(
            '/transactions/scan-ticket',
            { image: image.dataUri || image },
            { timeout: 120000 }
          ))
        );
        responses.push(...batchResponses);
      }

      // Giữ riêng biệt từng tích kê, mỗi ảnh tương ứng 1 nhóm hàng hoá độc lập
      const allItems = [];
      const timestamp = Date.now();
      responses.forEach((response, idx) => {
        if (!response.data.success) return;
        const ticketKey = `ticket-${timestamp}-${idx}`;
        const ticketImage = images[idx]?.dataUri || null;
        const ticketLabel = images.length > 1 ? `Tích kê ${idx + 1}` : null;
        (response.data.data || []).forEach((item) => {
          allItems.push({
            ...item,
            quantity: Number(item.quantity) || 0,
            voiceCustomerName: response.data.customerName || '',
            orderKey: ticketKey,
            ticketLabel,
            ticketImage,
          });
        });
      });

      if (!allItems.length) {
        throw new Error('Không đọc được sản phẩm nào từ các tích kê.');
      }
      scanTicketModalRef.current?.open(allItems, '📸 KẾT QUẢ QUÉT TÍCH KÊ');
    } catch (err) {
      console.error(err);
      popupModalRef.current?.show({
        title: 'Lỗi phân tích tích kê',
        message: err.response?.data?.message || err.message || 'Không thể phân tích các tích kê.',
        type: 'error',
      });
    } finally {
      setScanning(false);
    }
  };

  const handleScanTicket = () => {
    popupModalRef.current?.show({
      title: 'Hướng dẫn chụp tích kê',
      message: 'Để AI đọc chính xác hơn:\n\n• **Chữ viết rõ ràng, ghi đúng hàng đúng cột (ví dụ: cột hàng hóa viết đúng tên thịt, cột số lượng viết đúng số kg).**\n• Chụp thẳng từ trên xuống, lấy trọn tờ tích kê.\n• Đủ sáng, không bị bóng hoặc loá.\n• Giữ camera cố định, không rung và không che mất chữ.\n• Không chụp nghiêng hoặc để vật khác nằm trên bảng.',
      type: 'info',
      confirmText: 'Đã hiểu, chọn ảnh',
      onConfirm: () => runScanTicket(),
    });
  };

  const runScanTicket = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = async (e) => {
        const files = Array.from(e.target.files || []);
        const file = files[0];
        if (!file) return;

        if (files.length > 1) {
          const images = await Promise.all(files.map((selectedFile) => new Promise((resolve, reject) => {
            const fileReader = new FileReader();
            fileReader.onload = () => resolve({ dataUri: fileReader.result });
            fileReader.onerror = reject;
            fileReader.readAsDataURL(selectedFile);
          })));
          await submitTicketImages(images);
          return;
        }

        setScanningMsg('AI đang phân tích hình ảnh tích kê...');
        setScanning(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64Data = reader.result;
            // Gửi ảnh chụp tích kê lên server backend với thời gian chờ tối đa 120 giây
            const response = await api.post('/transactions/scan-ticket', { image: base64Data }, { timeout: 120000 });
            if (response.data.success) {
              // Tạo một mã hóa đơn/tích kê riêng để phân tách
              const ticketKey = `ticket-${Date.now()}-0`;
              const scannedItems = (response.data.data || []).map(item => ({
                ...item,
                voiceCustomerName: response.data.customerName || '',
                ticketImage: base64Data, // Lưu ảnh để đối chiếu
                orderKey: ticketKey,
                ticketLabel: null,
              }));
              scanTicketModalRef.current?.open(scannedItems, '📸 KẾT QUẢ QUÉT TÍCH KÊ');
            } else {
              popupModalRef.current?.show({
                title: 'Thất bại',
                message: response.data.message || 'Không thể nhận diện tích kê.',
                type: 'error'
              });
            }
          } catch (err) {
            console.error(err);
            popupModalRef.current?.show({
              title: 'Lỗi kết nối',
              message: err.response?.data?.message || 'Có lỗi xảy ra khi kết nối máy chủ quét tích kê.',
              type: 'error'
            });
          } finally {
            setScanning(false);
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    } else {
      try {
        const images = await selectTicketImages();
        await submitTicketImages(images);
        return;

        const captured = await captureTicketImage();
        if (!captured) return;
        setScanningMsg('AI dang phan tich hinh anh tich ke...');
        setScanning(true);
        const response = await api.post(
          '/transactions/scan-ticket',
          { image: captured.dataUri },
          { timeout: 120000 }
        );
        if (response.data.success) {
          // Tạo một mã hóa đơn/tích kê riêng để phân tách
          const ticketKey = `ticket-${Date.now()}-0`;
          const scannedItems = (response.data.data || []).map(item => ({
            ...item,
            voiceCustomerName: response.data.customerName || '',
            ticketImage: captured.dataUri, // Lưu ảnh để đối chiếu
            orderKey: ticketKey,
            ticketLabel: null,
          }));
          scanTicketModalRef.current?.open(scannedItems, '📸 KẾT QUẢ QUÉT TÍCH KÊ');
        } else {
          popupModalRef.current?.show({
            title: 'That bai',
            message: response.data.message || 'Khong the nhan dien tich ke.',
            type: 'error',
          });
        }
      } catch (err) {
        let errTitle = 'Lỗi chọn ảnh';
        let errMsg = err.response?.data?.message || 'Không thể chọn hoặc phân tích tích kê.';

        if (err.message === 'CAMERA_PERMISSION_DENIED') {
          errTitle = 'Chưa cấp quyền camera';
          errMsg = 'Hãy cấp quyền camera trong Cài đặt để chụp tích kê.';
        } else if (err.message === 'MEDIA_LIBRARY_PERMISSION_DENIED') {
          errTitle = 'Chưa cấp quyền thư viện ảnh';
          errMsg = 'Hãy cấp quyền truy cập thư viện ảnh trong Cài đặt để chọn ảnh tích kê.';
        }

        popupModalRef.current?.show({
          title: errTitle,
          message: errMsg,
          type: 'error',
        });
      } finally {
        setScanning(false);
      }
      return;
      popupModalRef.current?.show({
        title: 'Thông báo',
        message: 'Chức năng quét tích kê hiện hỗ trợ trên giao diện Web.',
        type: 'info'
      });
    }
  };

  // Xử lý thu âm và phân tích ghi nợ giọng nói qua backend/Gemini
  const handleToggleRecording = async () => {
    if (Platform.OS !== 'web') {
      try {
        if (isRecording) {
          const audio = await stopNativeRecording(mediaRecorderRef.current);
          mediaRecorderRef.current = null;
          setIsRecording(false);
          setScanningMsg('AI dang phan tich giong noi...');
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

            setScanningMsg('AI đang phân tích giọng nói...');
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

  const customers = customersResponse?.data || [];
  const customerIdSet = new Set(customers.map((c) => c.id));
  const customerPayments = (paymentsResponse?.data || []).filter((payment) => customerIdSet.has(payment.customerId));

  // 2. Tính toán tổng nợ của toàn bộ khách hàng để hiển thị
  const totalDebt = customers.reduce((sum, c) => sum + (c.debt || 0), 0);
  const selectedMonthPayments = customerPayments.filter((payment) => {
    const paidDate = payment.paidAt ? new Date(payment.paidAt) : null;
    if (!paidDate || isNaN(paidDate.getTime())) return false;
    const monthKey = `${paidDate.getFullYear()}-${(paidDate.getMonth() + 1).toString().padStart(2, '0')}`;
    return monthKey === selectedRevenueMonth;
  });
  const totalCollectedInSelectedMonth = selectedMonthPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const totalCollected = customerPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const totalOriginalDebt = totalDebt + totalCollected;
  const collectedByDay = selectedMonthPayments.reduce((groups, payment) => {
    const paidDate = payment.paidAt ? new Date(payment.paidAt) : null;
    const dateKey = paidDate && !isNaN(paidDate.getTime())
      ? `${paidDate.getFullYear()}-${(paidDate.getMonth() + 1).toString().padStart(2, '0')}-${paidDate.getDate().toString().padStart(2, '0')}`
      : 'unknown';
    groups[dateKey] = (groups[dateKey] || 0) + parseFloat(payment.amount || 0);
    return groups;
  }, {});
  const dailyCollectedRows = Object.entries(collectedByDay)
    .map(([dateKey, amount]) => ({ dateKey, amount }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  // 3. Bộ lọc tìm kiếm nhanh theo tên hoặc SĐT khách hàng (không xét dấu tiếng Việt) và sắp xếp
  const filteredCustomers = customers
    .filter((c) => {
      const nameNorm = removeDiacritics(c.name.toLowerCase());
      const searchNorm = removeDiacritics(search.toLowerCase());
      return nameNorm.includes(searchNorm) || (c.phone && c.phone.includes(search));
    })
    .sort((a, b) => {
      const debtA = a.debt || 0;
      const debtB = b.debt || 0;

      // Ưu tiên những người còn nợ lên đầu
      if (debtA > 0 && debtB <= 0) return -1;
      if (debtB > 0 && debtA <= 0) return 1;

      // Nếu cả hai đều còn nợ, xếp theo số nợ từ lớn đến bé
      if (debtA > 0 && debtB > 0) {
        return debtB - debtA;
      }

      // Nếu cả hai đều không còn nợ, sắp xếp theo tên theo bảng chữ cái tiếng Việt
      return a.name.localeCompare(b.name, 'vi');
    });

  const badCustomers = badCustomersResponse?.data || [];
  const totalBadDebt = badCustomers.reduce((sum, c) => sum + (c.debt || 0), 0);

  const filteredBadCustomers = badCustomers
    .filter((c) => {
      const nameNorm = removeDiacritics(c.name.toLowerCase());
      const searchNorm = removeDiacritics(search.toLowerCase());
      return nameNorm.includes(searchNorm) || (c.phone && c.phone.includes(search));
    })
    .sort((a, b) => {
      const debtA = a.debt || 0;
      const debtB = b.debt || 0;

      // Ưu tiên những người còn nợ lên đầu
      if (debtA > 0 && debtB <= 0) return -1;
      if (debtB > 0 && debtA <= 0) return 1;

      if (debtA > 0 && debtB > 0) {
        return debtB - debtA;
      }

      return a.name.localeCompare(b.name, 'vi');
    });

  const suppliers = suppliersResponse?.data || [];
  const totalSupplierDebt = suppliers.reduce((sum, s) => sum + (s.debt || 0), 0);

  const filteredSuppliers = suppliers
    .filter((s) => {
      const nameNorm = removeDiacritics(s.name.toLowerCase());
      const searchNorm = removeDiacritics(search.toLowerCase());
      return nameNorm.includes(searchNorm) || (s.phone && s.phone.includes(search));
    })
    .sort((a, b) => {
      const debtA = a.debt || 0;
      const debtB = b.debt || 0;

      // Ưu tiên nhà cung cấp mình đang nợ tiền lên đầu
      if (debtA > 0 && debtB <= 0) return -1;
      if (debtB > 0 && debtA <= 0) return 1;

      if (debtA > 0 && debtB > 0) {
        return debtB - debtA;
      }

      return a.name.localeCompare(b.name, 'vi');
    });

  const renderSupplierItem = ({ item }) => {
    const hasDebt = item.debt > 0;
    const firstLetter = (item.name || 'S').trim().charAt(0).toUpperCase();

    // Xác định màu sắc tươi sáng cho nhà cung cấp
    const avatarBg = '#FFE4E6';
    const avatarText = '#9F1239';

    return (
      <View
        style={[
          styles.customerCard,
          hasDebt
            ? styles.supplierCardDebtStripe
            : styles.supplierCardNoDebtStripe
        ]}
      >
        <View style={styles.customerCardClickable}>
          {/* PHẦN TRÊN: Thông tin nhà cung cấp & dư nợ */}
          <View style={styles.cardHeaderSection}>
            <View style={[styles.customerAvatar, { backgroundColor: avatarBg }]}>
              <Text style={[styles.customerAvatarText, { color: avatarText }]}>{firstLetter}</Text>
            </View>

            <View style={styles.cardInfo}>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.customerPhone} numberOfLines={1}>
                {item.phone ? `📞 ${item.phone}` : '📞 Không có số điện thoại'}
              </Text>
            </View>

            <View style={styles.cardDebtStatusSection}>
              {hasDebt ? (
                <View style={styles.debtValueContainer}>
                  <Text style={[styles.debtValueAmount, { color: '#9F1239' }]}>{formatCurrency(item.debt)}</Text>
                  <Text style={styles.debtValueLabel}>cần trả lò ⚠️</Text>
                </View>
              ) : (
                <View style={styles.noDebtBadge}>
                  <Text style={styles.noDebtBadgeText}>Đã trả đủ ✅</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.cardDivider} />

          {/* PHẦN DƯỚI: Các nút hành động */}
          <View style={styles.cardDebtContainer}>
            <View style={styles.actionsRightGroup}>
              {/* Nút xem lịch sử dòng tiền */}
              <AnimatedPressable
                style={styles.viewDebtBtn}
                onPress={() => {
                  setSelectedSupplier(item);
                  supplierHistoryModalRef.current?.open();
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.viewDebtBtnText}>👁️ Lịch sử</Text>
              </AnimatedPressable>

              {/* Nút nhập hàng ghi nợ thêm */}
              <AnimatedPressable
                style={styles.addDebtBtn}
                onPress={() => {
                  setSelectedSupplier(item);
                  supplierDebtModalRef.current?.open();
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.addDebtBtnText}>📥 Nhập hàng</Text>
              </AnimatedPressable>

              {/* Nút trả tiền hàng */}
              <AnimatedPressable
                style={[
                  styles.payBadDebtBtn,
                  !hasDebt && styles.payBadDebtBtnDisabled
                ]}
                onPress={() => {
                  setSelectedSupplier(item);
                  supplierPaymentModalRef.current?.open(item.debt || '');
                }}
                activeOpacity={0.6}
                disabled={!hasDebt}
              >
                <Text style={[
                  styles.payBadDebtBtnText,
                  !hasDebt && styles.payBadDebtBtnTextDisabled
                ]}>
                  💵 Trả tiền
                </Text>
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const confirmDeleteEmployee = (empId, empName) => {
    popupModalRef.current?.show({
      title: 'Xác nhận xóa',
      message: `Bạn có chắc chắn muốn xóa nhân viên "${empName}" khỏi sạp không?`,
      type: 'confirm',
      confirmText: 'Xóa ngay',
      cancelText: 'Hủy bỏ',
      onConfirm: () => handleDeleteEmployee(empId),
    });
  };

  const handleDeleteEmployee = async (empId) => {
    try {
      const response = await api.delete(`/employees/${empId}`);
      if (response.data.success) {
        popupModalRef.current?.show({
          title: 'Thành công',
          message: 'Đã xóa nhân viên thành công.',
          type: 'success',
          onConfirm: () => refetchEmployees(),
        });
      }
    } catch (err) {
      popupModalRef.current?.show({
        title: 'Thất bại',
        message: err.response?.data?.message || 'Có lỗi xảy ra khi xóa nhân viên.',
        type: 'error',
      });
    }
  };

  const renderEmployeeItem = ({ item }) => {
    const firstLetter = (item.name || 'E').trim().charAt(0).toUpperCase();
    const avatarBg = '#E0F2FE'; // Xanh dương nhạt
    const avatarText = '#0369A1'; // Xanh dương đậm

    return (
      <View style={styles.customerCard}>
        <View style={styles.customerCardClickable}>
          <View style={styles.cardHeaderSection}>
            <View style={[styles.customerAvatar, { backgroundColor: avatarBg }]}>
              <Text style={[styles.customerAvatarText, { color: avatarText }]}>{firstLetter}</Text>
            </View>

            <View style={styles.cardInfo}>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.customerPhone} numberOfLines={1}>
                {item.role ? `💼 ${item.role}` : '💼 Nhân viên'} {item.phone ? `• 📞 ${item.phone}` : ''}
              </Text>
            </View>

            <View style={styles.cardDebtStatusSection}>
              <View style={styles.debtValueContainer}>
                <Text style={[styles.debtValueAmount, { color: '#0369A1' }]}>
                  {formatCurrency(item.baseSalary)}
                </Text>
                <Text style={styles.debtValueLabel}>lương tháng</Text>
              </View>
            </View>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.cardDebtContainer}>
            <View style={styles.actionsRightGroup}>
              {/* Nút xem lịch sử chấm công, ứng, lương */}
              <AnimatedPressable
                style={styles.viewDebtBtn}
                onPress={() => {
                  setSelectedEmployee(item);
                  employeeHistoryModalRef.current?.open();
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.viewDebtBtnText}>👁️ Lịch sử</Text>
              </AnimatedPressable>

              {/* Nút ứng lương */}
              <AnimatedPressable
                style={styles.addDebtBtn}
                onPress={() => {
                  setSelectedEmployee(item);
                  salaryAdvanceModalRef.current?.open();
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.addDebtBtnText}>💸 Ứng lương</Text>
              </AnimatedPressable>

              {/* Nút sửa nhân viên */}
              <AnimatedPressable
                style={[styles.viewDebtBtn, { backgroundColor: '#F0FDFA', borderColor: '#CCFBF1' }]}
                onPress={() => {
                  editEmployeeModalRef.current?.open(item);
                }}
                activeOpacity={0.6}
              >
                <Text style={[styles.viewDebtBtnText, { color: '#0D9488' }]}>✏️ Sửa</Text>
              </AnimatedPressable>

              {/* Nút xóa nhân viên */}
              <TouchableOpacity
                style={[styles.exportDebtBtn, { borderColor: '#FCA5A5' }]}
                onPress={() => {
                  confirmDeleteEmployee(item.id, item.name);
                }}
                activeOpacity={0.6}
              >
                <Text style={[styles.exportDebtBtnText, { color: '#EF4444' }]}>🗑️ Xóa</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Định dạng hiển thị tiền VNĐ (Ví dụ: 1.500.000 đ)
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', 'đ');
  };

  const formatPaymentDate = (dateKey) => {
    if (dateKey === 'unknown') return 'Không rõ ngày';
    const date = new Date(`${dateKey}T00:00:00`);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatRevenueMonth = (monthKey) => {
    const [year, month] = monthKey.split('-');
    return `Tháng ${month}/${year}`;
  };

  const adjustRevenueMonth = (months) => {
    const [year, month] = selectedRevenueMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + months, 1);
    setSelectedRevenueMonth(`${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`);
  };

  const renderCustomerItem = ({ item }) => {
    const hasDebt = item.debt > 0;
    const isBadDebtCustomer = item.isBadDebt === true;
    // Lấy chữ cái đầu của tên khách hàng làm avatar
    const firstLetter = (item.name || 'K').trim().charAt(0).toUpperCase();

    // Xác định màu nền avatar ngẫu nhiên dựa trên tên để sinh động
    const avatarBgColors = ['#FFE2E2', '#E3F2FD', '#E8F5E9', '#FFF3E0', '#F3E5F5', '#E0F7FA'];
    const avatarTextColors = ['#D32F2F', '#1976D2', '#388E3C', '#F57C00', '#7B1FA2', '#0097A7'];
    const charCode = item.name ? item.name.charCodeAt(0) : 0;
    const colorIdx = charCode % avatarBgColors.length;
    const avatarBg = avatarBgColors[colorIdx];
    const avatarText = avatarTextColors[colorIdx];

    return (
      <View
        style={[
          styles.customerCard,
          isBadDebtCustomer
            ? styles.customerCardBadDebtStripe
            : hasDebt
              ? styles.customerCardDebtStripe
              : styles.customerCardNoDebtStripe,
          activeMenuId === item.id && { zIndex: 10, elevation: 10 }
        ]}
      >
        <TouchableOpacity
          style={styles.customerCardClickable}
          onPress={() => router.push(`/customer/${item.id}`)}
          activeOpacity={0.7}
        >
          {/* PHẦN TRÊN: Thông tin khách hàng và dư nợ */}
          <View style={styles.cardHeaderSection}>
            {/* Avatar chữ cái đại diện */}
            <View style={[styles.customerAvatar, { backgroundColor: avatarBg }]}>
              <Text style={[styles.customerAvatarText, { color: avatarText }]}>{firstLetter}</Text>
            </View>

            {/* Thông tin tên & số điện thoại */}
            <View style={styles.cardInfo}>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.customerPhone} numberOfLines={1}>
                {item.phone ? `📞 ${item.phone}` : '📞 Không có số điện thoại'}
              </Text>
            </View>

            {/* Trạng thái công nợ bên phải */}
            <View style={styles.cardDebtStatusSection}>
              {isBadDebtCustomer ? (
                <View style={styles.badDebtValueContainer}>
                  <Text style={styles.badDebtValueAmount}>{formatCurrency(item.debt)}</Text>
                  <Text style={styles.badDebtValueLabel}>NỢ XẤU ⚠️</Text>
                </View>
              ) : hasDebt ? (
                <View style={styles.debtValueContainer}>
                  <Text style={styles.debtValueAmount}>{formatCurrency(item.debt)}</Text>
                  <Text style={styles.debtValueLabel}>còn nợ ⚠️</Text>
                </View>
              ) : (
                <View style={styles.noDebtBadge}>
                  <Text style={styles.noDebtBadgeText}>Hết nợ ✅</Text>
                </View>
              )}
            </View>
          </View>

          {/* Đường phân cách nét đứt nhẹ */}
          <View style={styles.cardDivider} />

          {/* PHẦN DƯỚI: Các nút hành động */}
          <View style={styles.cardDebtContainer}>
            <View style={styles.actionsRightGroup}>
              {isBadDebtCustomer ? (
                <TouchableOpacity
                  style={[
                    styles.payBadDebtBtn,
                    item.debt <= 0 && styles.payBadDebtBtnDisabled
                  ]}
                  onPress={(e) => {
                    if (e && e.stopPropagation) {
                      e.stopPropagation();
                    }
                    setSelectedCustomerId(item.id);
                    // Mở PaymentModal với số tiền nợ hiện tại để điền sẵn làm mặc định
                    paymentModalRef.current?.open(item.debt || '');
                  }}
                  activeOpacity={0.6}
                  disabled={item.debt <= 0}
                >
                  <Text style={[
                    styles.payBadDebtBtnText,
                    item.debt <= 0 && styles.payBadDebtBtnTextDisabled
                  ]}>
                    {item.debt <= 0 ? '✅ Đã trả đủ' : '💰 Đã trả'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.viewDebtBtn}
                    onPress={(e) => {
                      if (e && e.stopPropagation) {
                        e.stopPropagation();
                      }
                      setSelectedCustomerId(item.id);
                      customerDebtHistoryModalRef.current?.open(item);
                    }}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.viewDebtBtnText}>👁️ Xem nợ</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.addDebtBtn}
                    onPress={(e) => {
                      if (e && e.stopPropagation) {
                        e.stopPropagation();
                      }
                      setSelectedCustomerId(item.id);
                      debtModalRef.current?.open();
                    }}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.addDebtBtnText}>🔴 Ghi nợ</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.exportDebtBtn}
                    onPress={(e) => {
                      if (e && e.stopPropagation) {
                        e.stopPropagation();
                      }
                      exportDebtModalRef.current?.open(item);
                    }}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.exportDebtBtnText}>📊 Xuất nợ</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={styles.actionMenuContainer}>
                <TouchableOpacity
                  style={styles.threeDotsBtn}
                  onPress={(e) => {
                    if (e && e.stopPropagation) {
                      e.stopPropagation();
                    }
                    setActiveMenuId(activeMenuId === item.id ? null : item.id);
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={styles.threeDotsText}>⋮</Text>
                </TouchableOpacity>

                {activeMenuId === item.id && (
                  <View style={styles.dropdownMenu}>
                    <TouchableOpacity
                      style={styles.dropdownItem}
                      onPress={(e) => {
                        if (e && e.stopPropagation) {
                          e.stopPropagation();
                        }
                        setActiveMenuId(null);
                        editCustomerModalRef.current?.open(item);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>✏️ Sửa</Text>
                    </TouchableOpacity>
                    <View style={styles.menuDivider} />
                    <TouchableOpacity
                      style={styles.dropdownItem}
                      onPress={(e) => {
                        if (e && e.stopPropagation) {
                          e.stopPropagation();
                        }
                        setActiveMenuId(null);
                        confirmDeleteCustomer(item.id, item.name);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, styles.deleteText]}>🗑️ Xóa</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const CustomCellRenderer = (cellProps) => {
    const isMenuOpen = activeMenuId === cellProps.item?.id;
    return (
      <View
        {...cellProps}
        style={[
          cellProps.style,
          { zIndex: isMenuOpen ? 999 : 1, elevation: isMenuOpen ? 999 : 1 }
        ]}
      />
    );
  };

  if (currentView === 'menu') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

        <View style={styles.contentWrapper}>
          {/* HEADER đơn giản: Nút Logout bên trái, Profile chủ tài khoản bên phải (Avatar bên trái Tên) */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.logoutButtonMini}
              onPress={() => auth.logout()}
              activeOpacity={0.7}
            >
              <Text style={styles.logoutTextMini}>Thoát 🚪</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.merchantProfileCardRight}
              onPress={() => profileModalRef.current?.open()}
              activeOpacity={0.7}
            >
              <View style={styles.avatarContainerRight}>
                <Text style={styles.avatarTextRight}>
                  {(auth.user?.name || 'Hoa').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.merchantDetailsRight}>
                <Text style={styles.merchantGreetingRight}>Chủ tài khoản 👋</Text>
                <Text style={styles.merchantNameRight}>{auth.user?.name || 'Cô Hoa'}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Danh sách các chức năng chính */}
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>HỆ THỐNG QUẢN LÝ</Text>
            <Text style={styles.menuSubtitle}>Vui lòng lựa chọn nghiệp vụ để bắt đầu làm việc</Text>

            {/* Chức năng 1: Quản lý khách hàng */}
            {auth.hasPermission('canManageCustomers') && (
              <TouchableOpacity
                style={[styles.menuCard, styles.menuCardActive]}
                onPress={() => {
                  router.replace({ pathname: '/', params: { view: 'customers' } });
                }}
                activeOpacity={0.8}
              >
                <View style={styles.menuCardIconBg}>
                  <Text style={styles.menuCardIcon}>👥</Text>
                </View>
                <View style={styles.menuCardContent}>
                  <Text style={styles.menuCardTitle}>Quản lý khách hàng</Text>
                  <Text style={styles.menuCardDesc}>Xem sổ nợ khách quen, ghi nợ thịt, thanh toán công nợ và báo cáo</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Chức năng 4: Quản lý tiền hàng */}
            {auth.hasPermission('canManageDebt') && (
              <TouchableOpacity
                style={[styles.menuCard, styles.menuCardActiveSupplier]}
                onPress={() => {
                  router.replace({ pathname: '/', params: { view: 'suppliers' } });
                }}
                activeOpacity={0.8}
              >
                <View style={styles.menuCardIconBgSupplier}>
                  <Text style={styles.menuCardIcon}>📦</Text>
                </View>
                <View style={styles.menuCardContent}>
                  <Text style={styles.menuCardTitleSupplier}>Quản lý tiền hàng</Text>
                  <Text style={styles.menuCardDesc}>Quản lý công nợ với chủ bò</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Chức năng 2: Quản lý nhân viên */}
            {auth.hasPermission('canManageEmployees') && (
              <TouchableOpacity
                style={[styles.menuCard, styles.menuCardActiveEmployee]}
                onPress={() => {
                  router.replace({ pathname: '/', params: { view: 'employees' } });
                }}
                activeOpacity={0.8}
              >
                <View style={styles.menuCardIconBgEmployee}>
                  <Text style={styles.menuCardIcon}>👤</Text>
                </View>
                <View style={styles.menuCardContent}>
                  <Text style={styles.menuCardTitleEmployee}>Quản lý nhân viên</Text>
                  <Text style={styles.menuCardDescEmployee}>Chấm công hàng ngày, quản lý tạm ứng lương, tính lương tháng</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Chức năng 3: Quản lý nợ xấu */}
            {auth.hasPermission('canManageBadDebt') && (
              <TouchableOpacity
                style={[styles.menuCard, styles.menuCardActiveBad]}
                onPress={() => {
                  router.replace({ pathname: '/', params: { view: 'bad_debts' } });
                }}
                activeOpacity={0.8}
              >
                <View style={styles.menuCardIconBgBad}>
                  <Text style={styles.menuCardIcon}>⚠️</Text>
                </View>
                <View style={styles.menuCardContent}>
                  <Text style={styles.menuCardTitle}>Quản lý nợ xấu</Text>
                  <Text style={styles.menuCardDesc}>Khoanh vùng khách hàng khó đòi nợ, theo dõi số tiền đọng và phục hồi trạng thái</Text>
                </View>
              </TouchableOpacity>
            )}


          </View>
        </View>

        {/* Modal Hồ sơ */}
        <ProfileModal ref={profileModalRef} />
        {/* Popup Thông báo */}
        <PopupModal ref={popupModalRef} />
      </SafeAreaView>
    );
  }

  if (currentView === 'bad_debts') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFBEB" />

        <View style={styles.contentWrapper}>
          {/* HEADER nợ xấu: tông màu cam/vàng pastel */}
          <View style={[styles.header, styles.headerBadDebt]}>
            <TouchableOpacity
              style={styles.backButtonNew}
              onPress={() => {
                router.replace({ pathname: '/', params: { view: 'menu' } });
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.backTextNew}>← Quay lại</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.merchantProfileCardRight}
              onPress={() => profileModalRef.current?.open()}
              activeOpacity={0.7}
            >
              <View style={styles.avatarContainerRight}>
                <Text style={styles.avatarTextRight}>
                  {(auth.user?.name || 'Hoa').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.merchantDetailsRight}>
                <Text style={styles.merchantGreetingRight}>Chủ tài khoản 👋</Text>
                <Text style={styles.merchantNameRight}>{auth.user?.name || 'Cô Hoa'}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* TỔNG TIỀN NỢ XẤU */}
          <View style={styles.summaryCardBad}>
            <Text style={styles.summaryLabelBad}>⚠️ TỔNG NỢ XẤU KHOANH VÙNG:</Text>
            <Text style={styles.summaryValueBad}>{formatCurrency(totalBadDebt)}</Text>
          </View>

          {/* Ô TÌM KIẾM NHANH KHÁCH NỢ XẤU */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="🔍 Tìm khách nợ xấu..."
              placeholderTextColor={COLORS.textLight}
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <TouchableOpacity style={styles.clearSearch} onPress={() => setSearch('')}>
                <Text style={styles.clearSearchText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.listHeaderContainer}>
            <Text style={styles.listHeaderBad}>📂 KHO LƯU TRỮ NỢ XẤU ({filteredBadCustomers.length})</Text>
          </View>

          {/* DANH SÁCH KHÁCH HÀNG NỢ XẤU */}
          {isLoadingBad ? (
            <ActivityIndicator size="large" color="#D97706" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredBadCustomers}
              renderItem={renderCustomerItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              refreshing={isRefetchingBad}
              onRefresh={refetchBad}
              CellRendererComponent={CustomCellRenderer}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Không có khách hàng nào trong kho nợ xấu.</Text>
                </View>
              }
            />
          )}
        </View>

        {/* THANH ĐIỀU KHIỂN CỐ ĐỊNH Ở ĐẢY MÀN HÌNH NỢ XẤU */}
        <View style={styles.bottomBarBad}>
          <TouchableOpacity
            style={styles.addBadDebtButtonFull}
            onPress={() => addBadDebtModalRef.current?.open()}
            activeOpacity={0.8}
          >
            <Text style={styles.addBadDebtButtonFullText}>➕ THÊM NỢ XẤU</Text>
          </TouchableOpacity>
        </View>

        <ProfileModal ref={profileModalRef} />
        <PopupModal ref={popupModalRef} />
        {/* Modal thêm bản ghi nợ xấu mới */}
        <AddBadDebtModal ref={addBadDebtModalRef} onRefresh={handleRefreshBadAll} />
        {/* Các modal cần thiết để nút Xem nợ và Xuất nợ trên thẻ khách hàng hoạt động */}
        <ExportDebtModal ref={exportDebtModalRef} onRefresh={handleRefreshBadAll} />
        <CustomerDebtHistoryModal
          ref={customerDebtHistoryModalRef}
          paymentModalRef={paymentModalRef}
          detailModalRef={detailModalRef}
          debtModalRef={debtModalRef}
          onRefresh={handleRefreshBadAll}
        />
        <DebtModal ref={debtModalRef} customerId={selectedCustomerId} onRefresh={handleRefreshBadAll} />
        <PaymentModal ref={paymentModalRef} customerId={selectedCustomerId} onRefresh={handleRefreshBadAll} />
        <TransactionDetailModal
          ref={detailModalRef}
          customerId={selectedCustomerId}
          onRefresh={handleRefreshBadAll}
          onEditTransaction={(transaction) => editDebtModalRef.current?.open(transaction)}
          onEditPayment={(payment) => editPaymentModalRef.current?.open(payment)}
        />
        <EditDebtModal ref={editDebtModalRef} onRefresh={handleRefreshBadAll} />
        <EditPaymentModal ref={editPaymentModalRef} onRefresh={handleRefreshBadAll} />
      </SafeAreaView>
    );
  }

  if (currentView === 'employees') {
    // Lọc danh sách nhân viên phục vụ tìm kiếm nhanh
    const employees = employeesResponse?.data || [];
    const filteredEmployees = employees.filter((emp) => {
      const nameNorm = removeDiacritics(emp.name.toLowerCase());
      const searchNorm = removeDiacritics(search.toLowerCase());
      return nameNorm.includes(searchNorm) || (emp.phone && emp.phone.includes(search));
    });

    // Thay đổi ngày chấm công
    const adjustAttendanceDate = (days) => {
      const current = new Date(attendanceDate);
      current.setDate(current.getDate() + days);
      setAttendanceDate(current.toISOString().split('T')[0]);
    };

    // Thay đổi tháng tính lương
    const adjustSalaryMonth = (months) => {
      const parts = salaryMonth.split('/');
      const month = parseInt(parts[0], 10);
      const year = parseInt(parts[1], 10);

      const date = new Date(year, month - 1 + months, 1);
      setSalaryMonth(`${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`);
    };

    const formatDateDisplay = (dateStr) => {
      const d = new Date(dateStr);
      return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    };

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#EEF2F6" />

        <View style={styles.contentWrapper}>
          {/* HEADER nhân viên: Indigo pastel nhạt */}
          <View style={[styles.header, styles.headerEmployee]}>
            <TouchableOpacity
              style={styles.backButtonNew}
              onPress={() => {
                router.replace({ pathname: '/', params: { view: 'menu' } });
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.backTextNew}>← Quay lại</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.merchantProfileCardRight}
              onPress={() => profileModalRef.current?.open()}
              activeOpacity={0.7}
            >
              <View style={styles.avatarContainerRight}>
                <Text style={styles.avatarTextRight}>
                  {(auth.user?.name || 'Hoa').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.merchantDetailsRight}>
                <Text style={styles.merchantGreetingRight}>Chủ tài khoản 👋</Text>
                <Text style={styles.merchantNameRight}>{auth.user?.name || 'Cô Hoa'}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* THANH TABS NGHIỆP VỤ NHÂN VIÊN */}
          <View style={styles.tabHeaderContainer}>
            <TouchableOpacity
              style={[styles.tabHeaderButton, employeeTab === 'STAFF' && styles.tabHeaderButtonActive]}
              onPress={() => setEmployeeTab('STAFF')}
            >
              <Text style={[styles.tabHeaderText, employeeTab === 'STAFF' && styles.tabHeaderTextActive]}>
                👥 Nhân sự
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabHeaderButton, employeeTab === 'ATTENDANCE' && styles.tabHeaderButtonActive]}
              onPress={() => setEmployeeTab('ATTENDANCE')}
            >
              <Text style={[styles.tabHeaderText, employeeTab === 'ATTENDANCE' && styles.tabHeaderTextActive]}>
                📅 Chấm công
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabHeaderButton, employeeTab === 'SALARY' && styles.tabHeaderButtonActive]}
              onPress={() => setEmployeeTab('SALARY')}
            >
              <Text style={[styles.tabHeaderText, employeeTab === 'SALARY' && styles.tabHeaderTextActive]}>
                💰 Bảng lương
              </Text>
            </TouchableOpacity>
          </View>

          {/* TAB 1: DANH SÁCH NHÂN SỰ */}
          {employeeTab === 'STAFF' && (
            <>
              {/* Ô TÌM KIẾM NHÂN VIÊN */}
              <View style={[styles.searchContainer, { marginTop: 12 }]}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="🔍 Tìm nhân viên..."
                  placeholderTextColor={COLORS.textLight}
                  value={search}
                  onChangeText={setSearch}
                />
                {search ? (
                  <TouchableOpacity style={styles.clearSearch} onPress={() => setSearch('')}>
                    <Text style={styles.clearSearchText}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.listHeaderContainer}>
                <Text style={styles.listHeaderEmployee}>📂 DANH SÁCH NHÂN VIÊN ({filteredEmployees.length})</Text>
              </View>

              {isLoadingEmployees ? (
                <ActivityIndicator size="large" color="#0369A1" style={{ marginTop: 40 }} />
              ) : (
                <FlatList
                  data={filteredEmployees}
                  renderItem={renderEmployeeItem}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.listContent}
                  refreshing={isLoadingEmployees}
                  onRefresh={refetchEmployees}
                  CellRendererComponent={CustomCellRenderer}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>Chưa có nhân viên nào. Hãy nhấn nút dưới đáy để thêm!</Text>
                    </View>
                  }
                />
              )}
            </>
          )}

          {/* TAB 2: CHẤM CÔNG HÀNG NGÀY */}
          {employeeTab === 'ATTENDANCE' && (
            <View style={{ flex: 1 }}>
              {/* ĐIỀU KHIỂN CHỌN NGÀY CHẤM CÔNG */}
              <View style={styles.dateSelectorContainer}>
                <TouchableOpacity style={styles.dateSelectorArrow} onPress={() => adjustAttendanceDate(-1)}>
                  <Text style={styles.dateSelectorArrowText}>◀️ Trước</Text>
                </TouchableOpacity>
                <View style={styles.dateDisplayWrapper}>
                  <Text style={styles.dateDisplayTitle}>Ngày chấm công</Text>
                  <Text style={styles.dateDisplayVal}>{formatDateDisplay(attendanceDate)}</Text>
                </View>
                <TouchableOpacity style={styles.dateSelectorArrow} onPress={() => adjustAttendanceDate(1)}>
                  <Text style={styles.dateSelectorArrowText}>Sau ▶️</Text>
                </TouchableOpacity>
              </View>

              {/* DANH SÁCH NHÂN VIÊN ĐỂ CHẤM CÔNG */}
              <FlatList
                data={attendanceList}
                keyExtractor={(item) => item.employeeId}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const isPresent = item.status === 'PRESENT';
                  const isHalf = item.shift === 'HALF';
                  return (
                    <View style={styles.attendanceCard}>
                      <View style={styles.attendanceCardInfo}>
                        <Text style={styles.attendanceEmpName}>{item.name}</Text>
                        <Text style={styles.attendanceEmpRole}>{item.role || 'Nhân viên sạp'}</Text>
                      </View>

                      <View style={styles.attendanceActions}>
                        {/* Nút đi làm cả ngày */}
                        <TouchableOpacity
                          style={[
                            styles.attButton,
                            isPresent && !isHalf && styles.attButtonGreen
                          ]}
                          onPress={() => handleToggleAttendance(item.employeeId, 'PRESENT', 'FULL')}
                        >
                          <Text style={[styles.attButtonText, isPresent && !isHalf && styles.attButtonTextActive]}>
                            🟢 Cả ngày
                          </Text>
                        </TouchableOpacity>

                        {/* Nút đi làm nửa ngày */}
                        <TouchableOpacity
                          style={[
                            styles.attButton,
                            isPresent && isHalf && styles.attButtonYellow
                          ]}
                          onPress={() => handleToggleAttendance(item.employeeId, 'PRESENT', 'HALF')}
                        >
                          <Text style={[styles.attButtonText, isPresent && isHalf && styles.attButtonTextActive]}>
                            🟡 Nửa ngày
                          </Text>
                        </TouchableOpacity>

                        {/* Nút nghỉ */}
                        <TouchableOpacity
                          style={[
                            styles.attButton,
                            item.status === 'ABSENT' && styles.attButtonRed
                          ]}
                          onPress={() => handleToggleAttendance(item.employeeId, 'ABSENT', 'FULL')}
                        >
                          <Text style={[styles.attButtonText, item.status === 'ABSENT' && styles.attButtonTextActive]}>
                            🔴 Nghỉ
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Chưa có nhân viên nào hoạt động để chấm công.</Text>
                  </View>
                }
              />
              {showSaveToast && (
                <View style={styles.toastContainer}>
                  <Text style={styles.toastText}>✅ Đã lưu bảng chấm công ngày thành công.</Text>
                </View>
              )}
            </View>
          )}

          {/* TAB 3: BẢNG LƯƠNG THÁNG */}
          {employeeTab === 'SALARY' && (
            <View style={{ flex: 1 }}>
              {/* ĐIỀU KHIỂN LỌC THÁNG LƯƠNG */}
              <View style={styles.dateSelectorContainer}>
                <TouchableOpacity style={styles.dateSelectorArrow} onPress={() => adjustSalaryMonth(-1)}>
                  <Text style={styles.dateSelectorArrowText}>◀️ Tháng trước</Text>
                </TouchableOpacity>
                <View style={styles.dateDisplayWrapper}>
                  <Text style={styles.dateDisplayTitle}>Tháng lương</Text>
                  <Text style={styles.dateDisplayVal}>Tháng {salaryMonth}</Text>
                </View>
                <TouchableOpacity style={styles.dateSelectorArrow} onPress={() => adjustSalaryMonth(1)}>
                  <Text style={styles.dateSelectorArrowText}>Tháng sau ▶️</Text>
                </TouchableOpacity>
              </View>

              {/* TỔNG TIỀN LƯƠNG PHẢI TRẢ TRONG THÁNG */}
              <View style={styles.summaryCardEmployeeSalary}>
                <Text style={styles.summaryLabelEmployeeSalary}>💵 TỔNG LƯƠNG THỰC LĨNH THÁNG:</Text>
                <Text style={styles.summaryValueEmployeeSalary}>
                  {formatCurrency(salaryData?.reduce((sum, item) => sum + (item.finalAmount || 0), 0) || 0)}
                </Text>
              </View>

              {/* DANH SÁCH BẢNG LƯƠNG */}
              {loadingSalary ? (
                <ActivityIndicator size="large" color="#0369A1" style={{ marginTop: 40 }} />
              ) : (
                <FlatList
                  data={[...salaryData].sort((a, b) => (a.isPaid === b.isPaid ? 0 : a.isPaid ? 1 : -1))}
                  keyExtractor={(item) => item.employeeId}
                  contentContainerStyle={styles.listContent}
                  renderItem={({ item }) => {
                    const isExpanded = activeSalaryEmpId === item.employeeId;
                    return (
                      <View style={[
                        styles.salaryCard,
                        item.isPaid && { opacity: 0.65, backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' }
                      ]}>
                        <View style={styles.salaryCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.attendanceEmpName}>{item.name}</Text>
                            <Text style={styles.attendanceEmpRole}>
                              Đi làm: <Text style={{ fontWeight: 'bold', color: '#0284C7' }}>{item.workingDays}</Text>/{item.totalDaysInMonth} ngày • Nghỉ: <Text style={{ fontWeight: 'bold', color: (item.totalDaysInMonth - item.workingDays) > 0 ? '#EF4444' : '#64748B' }}>{(item.totalDaysInMonth - item.workingDays).toFixed(1).replace('.0', '')}</Text> ngày
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.salaryCalculatedAmount}>{formatCurrency(item.calculatedSalary)}</Text>
                            <Text style={styles.salaryAdvancesText}>Đã ứng: -{formatCurrency(item.totalAdvances)}</Text>
                          </View>
                        </View>

                        <View style={styles.salaryCardDivider} />

                        <View style={styles.salaryCardFooter}>
                          <View>
                            <Text style={styles.salaryFinalLabel}>Thực lĩnh cuối tháng:</Text>
                            <Text style={styles.salaryFinalValue}>{formatCurrency(item.finalAmount)}</Text>
                          </View>

                          {item.isPaid ? (
                            <View style={styles.paidSalaryBadge}>
                              <Text style={styles.paidSalaryBadgeText}>✅ Đã chi trả</Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.paySalaryActionBtn}
                              onPress={() => {
                                popupModalRef.current?.show({
                                  title: 'Xác nhận trả lương',
                                  message: `Bạn có chắc chắn muốn xác nhận đã trả số tiền ${formatCurrency(item.finalAmount)} lương tháng cho nhân viên "${item.name}" không?`,
                                  type: 'confirm',
                                  confirmText: 'Xác nhận trả',
                                  cancelText: 'Hủy bỏ',
                                  onConfirm: () => handlePaySalary(item.employeeId),
                                });
                              }}
                              disabled={payingSalaryEmpId === item.employeeId}
                            >
                              {payingSalaryEmpId === item.employeeId ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                              ) : (
                                <Text style={styles.paySalaryActionBtnText}>💵 Trả lương</Text>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>Chưa có nhân viên nào hoạt động trong tháng này để tính lương.</Text>
                    </View>
                  }
                />
              )}
            </View>
          )}
        </View>

        {/* BottomBar cố định đáy cho Tab Nhân sự và Tab Chấm công */}
        {employeeTab === 'STAFF' && (
          <View style={styles.bottomBarEmployee}>
            <TouchableOpacity
              style={styles.addEmployeeButtonFull}
              onPress={() => addEmployeeModalRef.current?.open()}
              activeOpacity={0.8}
            >
              <Text style={styles.addEmployeeButtonFullText}>➕ THÊM NHÂN VIÊN MỚI</Text>
            </TouchableOpacity>
          </View>
        )}

        {employeeTab === 'ATTENDANCE' && (
          <View style={styles.bottomBarEmployee}>
            <TouchableOpacity
              style={[styles.addEmployeeButtonFull, { backgroundColor: '#10B981', shadowColor: '#10B981' }]}
              onPress={handleSaveAttendance}
              activeOpacity={0.8}
              disabled={savingAttendance}
            >
              {savingAttendance ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.addEmployeeButtonFullText}>💾 LƯU BẢNG CHẤM CÔNG NGÀY</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <ProfileModal ref={profileModalRef} />
        <PopupModal ref={popupModalRef} />

        {/* Modals nhân viên */}
        <AddEmployeeModal ref={addEmployeeModalRef} onRefresh={refetchEmployees} />
        <EditEmployeeModal ref={editEmployeeModalRef} onRefresh={refetchEmployees} />
        <SalaryAdvanceModal ref={salaryAdvanceModalRef} employee={selectedEmployee} onRefresh={() => { refetchEmployees(); if (employeeTab === 'SALARY') fetchSalaryData(salaryMonth); }} />
        <EmployeeHistoryModal ref={employeeHistoryModalRef} employee={selectedEmployee} />
      </SafeAreaView>
    );
  }

  if (currentView === 'suppliers') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF1F1" />

        <View style={styles.contentWrapper}>
          {/* HEADER nhà cung cấp: tông màu đỏ pastel nhạt */}
          <View style={[styles.header, styles.headerSupplier]}>
            <TouchableOpacity
              style={styles.backButtonNew}
              onPress={() => {
                router.replace({ pathname: '/', params: { view: 'menu' } });
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.backTextNew}>← Quay lại</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.merchantProfileCardRight}
              onPress={() => profileModalRef.current?.open()}
              activeOpacity={0.7}
            >
              <View style={styles.avatarContainerRight}>
                <Text style={styles.avatarTextRight}>
                  {(auth.user?.name || 'Hoa').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.merchantDetailsRight}>
                <Text style={styles.merchantGreetingRight}>Chủ tài khoản 👋</Text>
                <Text style={styles.merchantNameRight}>{auth.user?.name || 'Cô Hoa'}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* TỔNG TIỀN NỢ NHÀ CUNG CẤP */}
          <View style={styles.summaryCardSupplier}>
            <Text style={styles.summaryLabelSupplier}>📦 TỔNG NỢ LÒ / NHÀ CUNG CẤP:</Text>
            <Text style={styles.summaryValueSupplier}>{formatCurrency(totalSupplierDebt)}</Text>
          </View>

          {/* Ô TÌM KIẾM NHANH NHÀ CUNG CẤP */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="🔍 Tìm nhà cung cấp thịt..."
              placeholderTextColor={COLORS.textLight}
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <TouchableOpacity style={styles.clearSearch} onPress={() => setSearch('')}>
                <Text style={styles.clearSearchText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.listHeaderContainer}>
            <Text style={styles.listHeaderSupplier}>📂 DANH SÁCH NHÀ CUNG CẤP ({filteredSuppliers.length})</Text>
          </View>

          {/* DANH SÁCH NHÀ CUNG CẤP */}
          {isLoadingSuppliers ? (
            <ActivityIndicator size="large" color="#7F1D1D" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredSuppliers}
              renderItem={renderSupplierItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              refreshing={isRefetchingSuppliers}
              onRefresh={refetchSuppliers}
              CellRendererComponent={CustomCellRenderer}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Chưa có nhà cung cấp nào. Hãy nhấn nút dưới đáy để thêm!</Text>
                </View>
              }
            />
          )}
        </View>

        {/* THANH BottomBar CỦA VIEW NHÀ CUNG CẤP */}
        <View style={styles.bottomBarSupplier}>
          <TouchableOpacity
            style={styles.addSupplierButtonFull}
            onPress={() => addSupplierModalRef.current?.open()}
            activeOpacity={0.8}
          >
            <Text style={styles.addSupplierButtonFullText}>➕ THÊM NHÀ CUNG CẤP</Text>
          </TouchableOpacity>
        </View>

        <ProfileModal ref={profileModalRef} />
        <PopupModal ref={popupModalRef} />
        {/* Modals nhà cung cấp */}
        <AddSupplierModal ref={addSupplierModalRef} onRefresh={refetchSuppliers} />
        <SupplierDebtModal ref={supplierDebtModalRef} supplier={selectedSupplier} onRefresh={refetchSuppliers} />
        <SupplierPaymentModal ref={supplierPaymentModalRef} supplier={selectedSupplier} onRefresh={refetchSuppliers} />
        <SupplierHistoryModal ref={supplierHistoryModalRef} supplier={selectedSupplier} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.contentWrapper}>
        {/* HEADER đơn giản: Nút Quay lại bên trái, Profile chủ tài khoản bên phải (Avatar bên trái Tên) */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButtonNew}
            onPress={() => {
              router.replace({ pathname: '/', params: { view: 'menu' } });
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.backTextNew}>← Quay lại</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.merchantProfileCardRight}
            onPress={() => profileModalRef.current?.open()}
            activeOpacity={0.7}
          >
            <View style={styles.avatarContainerRight}>
              <Text style={styles.avatarTextRight}>
                {(auth.user?.name || 'Hoa').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.merchantDetailsRight}>
              <Text style={styles.merchantGreetingRight}>Chủ tài khoản 👋</Text>
              <Text style={styles.merchantNameRight}>{auth.user?.name || 'Cô Hoa'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* TỔNG TIỀN NỢ: To rõ, thu hút sự chú ý ngay */}
        <View style={styles.summaryCard}>
          <TouchableOpacity
            style={styles.summaryMainRow}
            onPress={() => setShowDebtSummary((prev) => !prev)}
            activeOpacity={0.85}
          >
            <View>
              <Text style={styles.summaryLabel}>💰 TỔNG TIỀN NỢ:</Text>
              <Text style={styles.summaryHint}>{showDebtSummary ? 'Bấm để thu gọn' : 'Bấm để xem chi tiết'}</Text>
            </View>
            <Text style={styles.summaryValue}>{formatCurrency(totalDebt)}</Text>
          </TouchableOpacity>

          {showDebtSummary && (
            <View style={styles.debtSummaryDetail}>
              {isLoadingPayments ? (
                <ActivityIndicator size="small" color={COLORS.dangerDark} style={styles.summaryLoader} />
              ) : (
                <>
                  <View style={styles.debtSummaryGrid}>
                    <View style={styles.debtSummaryBox}>
                      <Text style={styles.debtSummaryBoxLabel}>Tổng tiền</Text>
                      <Text style={styles.debtSummaryBoxValue}>{formatCurrency(totalOriginalDebt)}</Text>
                    </View>
                    <View style={styles.debtSummaryBox}>
                      <Text style={styles.debtSummaryBoxLabel}>Đã thu</Text>
                      <Text style={[styles.debtSummaryBoxValue, styles.collectedValue]}>{formatCurrency(totalCollectedInSelectedMonth)}</Text>
                    </View>
                    <View style={styles.debtSummaryBox}>
                      <Text style={styles.debtSummaryBoxLabel}>Nợ còn lại</Text>
                      <Text style={styles.debtSummaryBoxValue}>{formatCurrency(totalDebt)}</Text>
                    </View>
                  </View>

                  <View style={styles.monthPickerSection}>
                    <Text style={styles.monthPickerLabel}>Chọn tháng xem doanh thu</Text>
                    <View style={styles.monthPickerRow}>
                      <TouchableOpacity
                        style={styles.monthArrowButton}
                        onPress={(e) => {
                          if (e && e.stopPropagation) e.stopPropagation();
                          adjustRevenueMonth(-1);
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.monthArrowText}>{'<'}</Text>
                      </TouchableOpacity>

                      <View style={styles.monthInputWrapper}>
                        <Text style={styles.monthInputText}>{formatRevenueMonth(selectedRevenueMonth)}</Text>
                        {Platform.OS === 'web' && (
                          <input
                            type="month"
                            value={selectedRevenueMonth}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              if (e.target.value) {
                                setSelectedRevenueMonth(e.target.value);
                              }
                            }}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              opacity: 0,
                              cursor: 'pointer',
                            }}
                          />
                        )}
                      </View>

                      <TouchableOpacity
                        style={styles.monthArrowButton}
                        onPress={(e) => {
                          if (e && e.stopPropagation) e.stopPropagation();
                          adjustRevenueMonth(1);
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.monthArrowText}>{'>'}</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.monthRevenueText}>
                      Tổng doanh thu {formatRevenueMonth(selectedRevenueMonth).toLowerCase()}: {formatCurrency(totalCollectedInSelectedMonth)}
                    </Text>
                  </View>

                  <View style={styles.dailyCollectedSection}>
                    <Text style={styles.dailyCollectedTitle}>Tiền đã thu từng ngày</Text>
                    {dailyCollectedRows.length > 0 ? (
                      dailyCollectedRows.map((row) => (
                        <View key={row.dateKey} style={styles.dailyCollectedRow}>
                          <Text style={styles.dailyCollectedDate}>{formatPaymentDate(row.dateKey)}</Text>
                          <Text style={styles.dailyCollectedAmount}>{formatCurrency(row.amount)}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.dailyCollectedEmpty}>Chưa có khoản thu nào.</Text>
                    )}
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {/* NÚT THỐNG KÊ TRONG NGÀY */}
        <TouchableOpacity
          style={styles.dailyReportButton}
          onPress={() => dailyReportModalRef.current?.open()}
          activeOpacity={0.8}
        >
          <Text style={styles.dailyReportButtonText}>📈 THỐNG KÊ CÔNG NỢ TRONG NGÀY</Text>
        </TouchableOpacity>

        {/* HÀNG 4 NÚT TIỆN ÍCH AI & QUẢN LÝ */}
        <View style={styles.actionRowContainer}>
          <TouchableOpacity
            style={[styles.actionRowButton, styles.btnMeat]}
            onPress={() => productModalRef.current?.open()}
            activeOpacity={0.7}
          >
            <Text style={styles.actionRowButtonTextWhite}>Thêm thịt</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRowButton, styles.btnCustomer]}
            onPress={() => modalRef.current?.open()}
            activeOpacity={0.7}
          >
            <Text style={styles.actionRowButtonTextWhite}>Thêm khách</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRowButton, styles.btnScan]}
            onPress={handleScanTicket}
            activeOpacity={0.7}
          >
            <Text style={styles.actionRowButtonTextWhite}>Chụp tích kê</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRowButton, styles.btnVoice, isRecording && styles.btnVoiceRecording, { opacity: 0.5 }]}
            onPress={handleToggleRecording}
            activeOpacity={0.7}
            disabled={true}
          >
            <Text style={styles.actionRowButtonTextWhite}>{isRecording ? 'Đang nói...' : 'Giọng nói'}</Text>
          </TouchableOpacity>
        </View>

        {/* Ô TÌM KIẾM NHANH KHÁCH QUEN */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 Gõ tên hoặc SĐT khách quen..."
            placeholderTextColor={COLORS.textLight}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity style={styles.clearSearch} onPress={() => setSearch('')}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.listHeaderContainer}>
          <Text style={styles.listHeader}>👥 SỔ GHI NỢ KHÁCH QUEN ({filteredCustomers.length})</Text>
        </View>

        {/* DANH SÁCH KHÁCH HÀNG */}
        {isLoading ? (
          <ActivityIndicator size="large" color={COLORS.primaryDark} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={filteredCustomers}
            renderItem={renderCustomerItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshing={isRefetching}
            onRefresh={refetch}
            CellRendererComponent={CustomCellRenderer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Chưa có ai trong danh sách. Hãy nhấn nút phía dưới để thêm!</Text>
              </View>
            }
          />
        )}

        {/* BANNER HƯỚNG DẪN GHI ÂM */}
        {isRecording && (
          <View style={styles.recordingBanner}>
            <Text style={styles.recordingBannerText}>
              🛑 Đang ghi âm... Hãy nói rõ: "Tên khách, ngày, tên thịt, số kg, giá" (ví dụ: Anh Khải ngày 23/6 1 cân bắp bò giá 28...)
            </Text>
          </View>
        )}

        {/* OVERLAY KHI ĐANG PHÂN TÍCH BẰNG AI */}
        {scanning && (
          <View style={styles.scanningOverlay}>
            <ActivityIndicator size="large" color={COLORS.primaryDark} />
            <Text style={styles.scanningText}>{scanningMsg}</Text>
          </View>
        )}

      </View>

      {/* MODAL THÊM KHÁCH MỚI (Ẩn) */}
      <AddCustomerModal ref={modalRef} onRefresh={handleRefreshAll} />

      {/* MODAL SỬA KHÁCH HÀNG (Ẩn) */}
      <EditCustomerModal ref={editCustomerModalRef} onRefresh={handleRefreshAll} />

      {/* MODAL HỒ SƠ CHỦ TÀI KHOẢN (Ẩn) */}
      <ProfileModal ref={profileModalRef} />

      {/* MODAL QUẢN LÝ DANH MỤC THỊT (Ẩn) */}
      <ProductListModal ref={productModalRef} />

      {/* POPUP THÔNG BÁO DÙNG CHUNG (Ẩn) */}
      <PopupModal ref={popupModalRef} />

      {/* MODAL KẾT QUẢ GHI NỢ GIỌNG NÓI (Ẩn) */}
      <ScanTicketModal ref={scanTicketModalRef} onRefresh={handleRefreshAll} />

      {/* MODAL XUẤT CÔNG NỢ DẠNG ẢNH (Ẩn) */}
      <ExportDebtModal ref={exportDebtModalRef} onRefresh={handleRefreshAll} />

      {/* MODAL XEM CHI TIẾT LỊCH SỬ NỢ THEO THÁNG/NGÀY (Ẩn) */}
      <CustomerDebtHistoryModal
        ref={customerDebtHistoryModalRef}
        paymentModalRef={paymentModalRef}
        detailModalRef={detailModalRef}
        debtModalRef={debtModalRef}
        onRefresh={handleRefreshAll}
      />

      {/* CÁC SUB-MODAL PHỤC VỤ LỊCH SỬ NỢ */}
      <DebtModal ref={debtModalRef} customerId={selectedCustomerId} onRefresh={handleRefreshAll} />
      <PaymentModal ref={paymentModalRef} customerId={selectedCustomerId} onRefresh={handleRefreshAll} />
      <TransactionDetailModal
        ref={detailModalRef}
        customerId={selectedCustomerId}
        onRefresh={handleRefreshAll}
        onEditTransaction={(transaction) => editDebtModalRef.current?.open(transaction)}
        onEditPayment={(payment) => editPaymentModalRef.current?.open(payment)}
      />
      <EditDebtModal ref={editDebtModalRef} onRefresh={handleRefreshAll} />
      <EditPaymentModal ref={editPaymentModalRef} onRefresh={handleRefreshAll} />
      <DailyReportModal ref={dailyReportModalRef} onRefresh={handleRefreshAll} />
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
    position: 'relative',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9', // Viền siêu mỏng nhạt màu
    ...SHADOWS.card,
  },
  merchantProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5', // Màu xanh bạc hà nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#047857', // Xanh lá đậm sang trọng
  },
  merchantDetails: {
    flexDirection: 'column',
  },
  merchantGreeting: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  merchantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  logoutButtonNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F1', // Nền đỏ hồng pastel siêu nhạt
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  logoutTextNew: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  summaryCard: {
    backgroundColor: COLORS.dangerLight,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    ...SHADOWS.card,
  },
  summaryMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  summaryHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.danger,
    textAlign: 'right',
    flexShrink: 0,
  },
  debtSummaryDetail: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
  },
  summaryLoader: {
    marginVertical: 8,
  },
  debtSummaryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  debtSummaryBox: {
    flex: 1,
    minHeight: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingVertical: 9,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  debtSummaryBoxLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginBottom: 5,
  },
  debtSummaryBoxValue: {
    fontSize: 13,
    color: COLORS.dangerDark,
    fontWeight: 'bold',
  },
  collectedValue: {
    color: '#047857',
  },
  monthPickerSection: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    padding: 10,
  },
  monthPickerLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  monthPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthArrowButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  monthInputWrapper: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFF7F7',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  monthInputText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  monthRevenueText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#047857',
  },
  dailyCollectedSection: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    padding: 10,
  },
  dailyCollectedTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  dailyCollectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    gap: 10,
  },
  dailyCollectedDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  dailyCollectedAmount: {
    fontSize: 13,
    color: '#047857',
    fontWeight: 'bold',
    textAlign: 'right',
  },
  dailyCollectedEmpty: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  searchContainer: {
    marginHorizontal: 16,
    marginBottom: 10,
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    height: 44, // Giảm chiều cao từ 56 xuống 44
    borderRadius: 10,
    paddingLeft: 14,
    paddingRight: 40,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  clearSearch: {
    position: 'absolute',
    right: 16,
    padding: 6,
  },
  clearSearchText: {
    fontSize: 18,
    color: COLORS.textLight,
    fontWeight: 'bold',
  },
  listHeaderContainer: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  listHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  // Thẻ khách hàng chứa cả thông tin nhấp và nút xóa bên trong
  customerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  // Nền đỏ nhạt pastel sang trọng cho khách nợ
  customerCardDebt: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  // Nền xanh lá nhạt pastel tươi sáng cho khách không nợ
  customerCardNoDebt: {
    backgroundColor: '#F0FDF4', // Nền xanh lá sáng tươi tắn (Green 50)
    borderColor: '#BBF7D0',     // Viền xanh lá sáng nổi bật hơn (Green 200)
  },
  // Vùng thông tin khách hàng có thể click
  customerCardClickable: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  actionMenuContainer: {
    position: 'relative',
    zIndex: 100,
  },
  threeDotsBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9', // Nền xám Slate 100 nhẹ nhàng
    justifyContent: 'center',
    alignItems: 'center',
  },
  threeDotsText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 36,
    right: 0,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 110, // Khôi phục lại độ rộng cũ
    zIndex: 999,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  // Nút xem chi tiết nợ của khách hàng
  viewDebtBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF', // Nền xanh da trời nhẹ
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  viewDebtBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0068FF', // Màu xanh Zalo
  },
  // Nút ghi nợ mới trực tiếp từ trang chủ
  addDebtBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFF1F1', // Nền đỏ pastel nhạt
    borderWidth: 1,
    borderColor: '#FECACA', // Viền đỏ nhạt
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  addDebtBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.danger, // Màu đỏ ghi nợ thương hiệu
  },
  payBadDebtBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#ECFDF5', // Nền xanh lá pastel nhạt
    borderWidth: 1,
    borderColor: '#A7F3D0', // Viền xanh lá nhạt
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  payBadDebtBtnDisabled: {
    backgroundColor: '#F1F5F9', // Nền xám Slate nhạt
    borderColor: '#CBD5E1',     // Viền xám Slate
    opacity: 0.7,
  },
  payBadDebtBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#059669', // Xanh lá đậm thương hiệu thu nợ
  },
  payBadDebtBtnTextDisabled: {
    color: '#64748B', // Chữ màu xám
  },
  // Thẻ khách hàng chứa cả thông tin nhấp và nút xóa bên trong
  customerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.card,
  },
  customerCardDebtStripe: {
    borderLeftWidth: 5,
    borderLeftColor: COLORS.danger,
  },
  customerCardNoDebtStripe: {
    borderLeftWidth: 5,
    borderLeftColor: COLORS.primary,
  },
  // Vùng thông tin khách hàng có thể click
  customerCardClickable: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cardHeaderSection: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  customerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  customerAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardInfo: {
    flex: 1,
    paddingRight: 8,
  },
  // Tên khách hàng (giảm cỡ chữ và margin bottom)
  customerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 2,
  },
  // SĐT khách hàng (giảm cỡ chữ xuống caption)
  customerPhone: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  cardDebtStatusSection: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  debtValueContainer: {
    alignItems: 'flex-end',
  },
  debtValueAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  debtValueLabel: {
    fontSize: 10,
    color: COLORS.textLight,
    marginTop: 1,
    fontWeight: '600',
  },
  noDebtBadge: {
    backgroundColor: '#ECFDF5',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  noDebtBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#047857',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
    width: '100%',
  },
  cardDebtContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
  },
  quickContactContainer: {
    justifyContent: 'center',
  },
  quickContactLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  actionsRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Nút xem chi tiết nợ của khách hàng
  viewDebtBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#EFF6FF', // Nền xanh da trời nhẹ
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  viewDebtBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0068FF', // Màu xanh Zalo
  },
  // Nút Xuất công nợ đặt trực tiếp trên thẻ khách hàng
  exportDebtBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF', // Màu trắng nổi bật trên nền thẻ pastel
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card, // Tạo độ nổi khối nhẹ
  },
  exportDebtBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primaryDark, // Màu xanh lá cây đậm thương hiệu
  },
  actionMenuContainer: {
    position: 'relative',
    zIndex: 100,
  },
  threeDotsBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  threeDotsText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: -4,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  deleteText: {
    color: COLORS.danger,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONTS.body,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 22,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(248, 250, 252, 0.95)', // Bán trong suốt nền xám
    paddingVertical: 10, // Giảm từ 16 xuống 10
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row', // Chuyển sang dạng hàng ngang
    justifyContent: 'space-between',
    gap: 12,
  },
  // Thanh đáy cho màn Nợ xấu — tông cam/vàng cảnh báo
  bottomBarBad: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 251, 235, 0.97)', // Nền vàng kem nhạt bán trong suốt
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: '#FDE68A', // Viền vàng nhạt
    flexDirection: 'row',
    gap: 12,
  },
  // Nút THÊM NỢ XẤU — chiếm toàn bộ chiều rộng, giống addCustomerButton nhưng màu cam
  addBadDebtButtonFull: {
    flex: 1,
    backgroundColor: '#D97706', // Màu cam vàng thương hiệu nợ xấu
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  addBadDebtButtonFullText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  manageProductsButton: {
    flex: 1,
    backgroundColor: '#FAF8F6', // Nền màu kem lanh nhẹ nhàng, cao cấp
    height: 46, // Giảm từ 60 xuống 46
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#7F1D1D', // Viền Bordeaux đồng màu chữ
    shadowColor: '#7F1D1D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  manageProductsButtonText: {
    color: '#7F1D1D', // Màu đỏ đun Bordeaux sang trọng
    fontSize: 14, // Giảm từ 16 xuống 14
    fontWeight: 'bold',
  },
  addCustomerButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    height: 46, // Giảm từ 60 xuống 46
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  addCustomerButtonText: {
    color: '#FFFFFF',
    fontSize: 14, // Giảm từ 16 xuống 14
    fontWeight: 'bold',
  },
  voiceButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  voiceButtonRecording: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  voiceButtonText: {
    fontSize: 20,
  },
  recordingBanner: {
    position: 'absolute',
    bottom: 70,
    left: 16,
    right: 16,
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    zIndex: 999,
  },
  recordingBannerText: {
    fontSize: 13,
    color: '#B45309',
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 18,
  },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  scanningText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  dailyReportButton: {
    backgroundColor: '#EFF6FF', // Nền xanh pastel nhẹ nhàng, sang trọng
    borderColor: '#BFDBFE',
    borderWidth: 1.5,
    marginHorizontal: 16,
    marginBottom: 10,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  dailyReportButtonText: {
    color: '#1E40AF',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  actionRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  actionRowButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...SHADOWS.card,
  },
  actionRowButtonDisabled: {
    opacity: 0.45,
  },
  btnMeat: {
    backgroundColor: '#BE123C', // Màu đỏ hồng Rose 700
    borderColor: '#9F1239',
  },
  btnCustomer: {
    backgroundColor: '#059669', // Xanh lá đậm Emerald 600
    borderColor: '#047857',
  },
  btnScan: {
    backgroundColor: '#4F46E5', // Màu xanh Indigo 600
    borderColor: '#4338CA',
  },
  btnVoice: {
    backgroundColor: '#7C3AED', // Tím đậm Violet 600
    borderColor: '#6D28D9',
  },
  btnVoiceRecording: {
    backgroundColor: '#EF4444', // Màu đỏ khi đang ghi âm
    borderColor: '#DC2626',
  },
  actionRowButtonTextWhite: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  // ── CSS cho Menu chính mới & Header đơn giản ───────────────────────
  menuContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  menuTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 6,
    marginTop: 10,
  },
  menuSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 30,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  menuCardActive: {
    borderColor: '#A7F3D0', // Viền xanh nhạt
    backgroundColor: '#FAFDFB',
  },
  menuCardDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    opacity: 0.85,
  },
  menuCardIconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#D1FAE5', // Màu xanh bạc hà nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuCardIconBgDisabled: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9', // Xám Slate nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuCardIcon: {
    fontSize: 24,
  },
  menuCardContent: {
    flex: 1,
  },
  menuCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#065F46', // Chữ xanh lá cây đậm
    marginBottom: 4,
  },
  menuCardTitleDisabled: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  menuCardDesc: {
    fontSize: 12,
    color: '#047857',
    lineHeight: 18,
  },
  menuCardDescDisabled: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 18,
    marginTop: 4,
  },
  menuTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  comingSoonBadge: {
    backgroundColor: '#E2E8F0',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  // Style mới đơn giản: Nút bên trái, Profile bên phải (Avatar luôn bên trái Tên)
  merchantProfileCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainerLeft: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginRight: 10,
  },
  avatarTextLeft: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#047857',
  },
  merchantDetailsLeft: {
    alignItems: 'flex-start',
  },
  merchantGreetingLeft: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  merchantNameLeft: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  merchantProfileCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainerRight: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginRight: 10,
  },
  avatarTextRight: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#047857',
  },
  merchantDetailsRight: {
    alignItems: 'flex-start',
  },
  merchantGreetingRight: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  merchantNameRight: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  logoutButtonMini: {
    width: 90,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF1F1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  logoutTextMini: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#EF4444',
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
  menuCardActiveBad: {
    borderColor: '#FDE68A', // Viền vàng/cam nhạt
    backgroundColor: '#FFFDF5',
  },
  menuCardIconBgBad: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FEF3C7', // Vàng nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerBadDebt: {
    backgroundColor: '#FFFDF5',
    borderBottomWidth: 1,
    borderColor: '#FEF3C7',
  },
  summaryCardBad: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    ...SHADOWS.card,
  },
  summaryLabelBad: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#D97706',
    marginBottom: 8,
  },
  summaryValueBad: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#B45309',
  },
  listHeaderBad: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#B45309',
  },
  customerCardBadDebtStripe: {
    borderLeftWidth: 5,
    borderLeftColor: '#D97706', // Màu cam đậm nợ xấu
    borderColor: '#FEF3C7',
  },
  badDebtValueContainer: {
    alignItems: 'flex-end',
  },
  badDebtValueAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#B45309',
  },
  badDebtValueLabel: {
    fontSize: 10,
    color: '#D97706',
    fontWeight: 'bold',
    marginTop: 2,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  // ── CSS cho Quản lý tiền hàng (Supplier) ───────────────────────
  menuCardActiveSupplier: {
    borderColor: '#FECACA', // Viền đỏ hồng nhạt
    backgroundColor: '#FFF5F5',
  },
  menuCardIconBgSupplier: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FEE2E2', // Hồng nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuCardTitleSupplier: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#9F1239', // Đỏ Bordeaux
    marginBottom: 4,
  },
  headerSupplier: {
    backgroundColor: '#FFF5F5',
    borderBottomWidth: 1,
    borderColor: '#FECACA',
  },
  summaryCardSupplier: {
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    ...SHADOWS.card,
  },
  summaryLabelSupplier: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#9F1239',
    marginBottom: 8,
  },
  summaryValueSupplier: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#9F1239',
  },
  listHeaderSupplier: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#9F1239',
  },
  supplierCardDebtStripe: {
    borderLeftWidth: 5,
    borderLeftColor: '#9F1239', // Đỏ đậm nợ nhà cung cấp
    borderColor: '#FECACA',
  },
  supplierCardNoDebtStripe: {
    borderLeftWidth: 5,
    borderLeftColor: '#10B981', // Xanh lá khi trả đủ
    borderColor: '#E2E8F0',
  },
  bottomBarSupplier: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(254, 242, 242, 0.97)', // Nền hồng nhạt bán trong suốt
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    gap: 12,
  },
  addSupplierButtonFull: {
    flex: 1,
    backgroundColor: '#9F1239', // Đỏ Bordeaux
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#9F1239',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  addSupplierButtonFullText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // ── CSS cho Quản lý nhân viên (Employee) ───────────────────────
  menuCardActiveEmployee: {
    borderColor: '#BFDBFE', // Viền xanh dương nhạt
    backgroundColor: '#F0F9FF',
  },
  menuCardIconBgEmployee: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#E0F2FE', // Xanh dương nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuCardTitleEmployee: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0369A1', // Xanh dương đậm
    marginBottom: 4,
  },
  menuCardDescEmployee: {
    fontSize: 12,
    color: '#0284C7',
    lineHeight: 18,
  },
  headerEmployee: {
    backgroundColor: '#F0F9FF',
    borderBottomWidth: 1,
    borderColor: '#BFDBFE',
  },
  listHeaderEmployee: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  bottomBarEmployee: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(240, 249, 255, 0.97)', // Nền xanh dương bán trong suốt
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    gap: 12,
  },
  addEmployeeButtonFull: {
    flex: 1,
    backgroundColor: '#0369A1', // Xanh dương đậm
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0369A1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  addEmployeeButtonFullText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Tab Header Styles
  tabHeaderContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 6,
    marginHorizontal: 16,
    marginTop: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabHeaderButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabHeaderButtonActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.card,
  },
  tabHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabHeaderTextActive: {
    color: '#0369A1',
    fontWeight: 'bold',
  },
  // Date Selector Styles
  dateSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 15,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.card,
  },
  dateSelectorArrow: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateSelectorArrowText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  dateDisplayWrapper: {
    alignItems: 'center',
  },
  dateDisplayTitle: {
    fontSize: 11,
    color: COLORS.textLight,
    fontWeight: '600',
    marginBottom: 2,
  },
  dateDisplayVal: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  // Attendance Card Styles
  attendanceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.card,
  },
  attendanceCardInfo: {
    flex: 1,
    paddingRight: 10,
  },
  attendanceEmpName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  attendanceEmpRole: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  attendanceActions: {
    flexDirection: 'row',
    gap: 6,
  },
  attButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  attButtonGreen: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
  },
  attButtonYellow: {
    backgroundColor: '#FFFDE7',
    borderColor: '#FFF59D',
  },
  attButtonRed: {
    backgroundColor: '#FFEBEE',
    borderColor: '#EF9A9A',
  },
  attButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  attButtonTextActive: {
    color: COLORS.text,
  },
  // Salary Card Styles
  salaryCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.card,
  },
  salaryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  salaryCalculatedAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  salaryAdvancesText: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
    marginTop: 2,
  },
  salaryCardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  salaryCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  salaryFinalLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  salaryFinalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0369A1', // Lương thực nhận màu Indigo
    marginTop: 2,
  },
  paidSalaryBadge: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  paidSalaryBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  paySalaryActionBtn: {
    backgroundColor: '#0369A1',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  paySalaryActionBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  salaryExpandForm: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  expandFormLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  expandFormRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputTinyLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  tinyInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    height: 38,
    paddingHorizontal: 10,
    fontSize: 12,
    color: COLORS.text,
  },
  submitPaySalaryBtn: {
    backgroundColor: '#10B981',
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  submitPaySalaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  leafItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  leafDateText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  leafStatusText: {
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  leafStatusAbsent: {
    color: '#EF4444',
  },
  leafStatusHalf: {
    color: '#D97706',
  },
  leafNoteText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  emptyLeafText: {
    fontSize: 13,
    color: '#16A34A',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 10,
  },
  toastContainer: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
    borderWidth: 1.2,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  toastText: {
    color: '#047857',
    fontSize: 13,
    fontWeight: 'bold',
  },
  summaryCardEmployeeSalary: {
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 15,
    marginBottom: 5,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    ...SHADOWS.card,
  },
  summaryLabelEmployeeSalary: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0369A1',
    marginBottom: 8,
  },
  summaryValueEmployeeSalary: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0369A1',
  },
});
