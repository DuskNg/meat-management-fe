// meat-management-fe/app/index.js
import React, { useState, useRef, useEffect } from 'react';
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
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../src/api/client';
import { useAuthStore } from '../src/store/authStore';
import { COLORS, FONTS, SHADOWS } from '../src/theme';
import AddCustomerModal from '../src/components/AddCustomerModal';
import ProductListModal from '../src/components/ProductListModal';
import ProfileModal from '../src/components/ProfileModal';
import AdminOwnerDetailModal from '../src/components/AdminOwnerDetailModal';
import EditCustomerModal from '../src/components/EditCustomerModal';
import WorkspaceMemberActionsModal from '../src/components/WorkspaceMemberActionsModal';
import PopupModal from '../src/components/PopupModal';
import ScanTicketModal from '../src/components/ScanTicketModal';
import BatchDebtModal from '../src/components/BatchDebtModal';
import BatchPaymentModal from '../src/components/BatchPaymentModal';
import ExportDebtModal from '../src/components/ExportDebtModal';
import DebtModal from '../src/components/DebtModal';
import PaymentModal from '../src/components/PaymentModal';
import TransactionDetailModal from '../src/components/TransactionDetailModal';
import EditDebtModal from '../src/components/EditDebtModal';
import EditPaymentModal from '../src/components/EditPaymentModal';
import CustomerDebtHistoryModal from '../src/components/CustomerDebtHistoryModal';
import DailyReportModal from '../src/components/DailyReportModal';
import EmployeeDailyDebtModal from '../src/components/EmployeeDailyDebtModal';
import AddBadDebtModal from '../src/components/AddBadDebtModal';
import AddSupplierModal from '../src/components/AddSupplierModal';
import SupplierDebtModal from '../src/components/SupplierDebtModal';
import SupplierPaymentModal from '../src/components/SupplierPaymentModal';
import SupplierHistoryModal from '../src/components/SupplierHistoryModal';
import AddEmployeeModal from '../src/components/AddEmployeeModal';
import SalaryAdvanceModal from '../src/components/SalaryAdvanceModal';
import EmployeeHistoryModal from '../src/components/EmployeeHistoryModal';
import EditEmployeeModal from '../src/components/EditEmployeeModal';
import ReturnGoodsModal from '../src/components/ReturnGoodsModal';
import ProfitFeatureIntroModal from '../src/components/ProfitFeatureIntroModal';
import RecurringDebtModal from '../src/components/RecurringDebtModal';
import RegularCustomersModal from '../src/components/RegularCustomersModal';
import AnimatedPressable from '../src/components/AnimatedPressable';
import { useLockStore } from '../src/store/lockStore';
import ResourceLockOverlay from '../src/components/ResourceLockOverlay';
import { getSocket, joinWorkspaceRoom, leaveWorkspaceRoom } from '../src/utils/socket';
import { matchItemSearch } from '../src/utils/searchHelper';
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

// Trả về chuỗi danh sách các ngày nghỉ hoặc làm nửa ngày dưới dạng (ngày X, Y)
const getLeavesText = (leaves) => {
  if (!leaves || leaves.length === 0) return '';
  const dayStrings = leaves
    .map((leaf) => {
      if (!leaf.date) return '';
      const dateParts = leaf.date.split('-');
      if (dateParts.length < 3) return '';
      const day = parseInt(dateParts[2], 10);
      if (isNaN(day)) return '';
      if (leaf.status === 'PRESENT' && leaf.shift === 'HALF') {
        return `${day} (nghỉ nửa ngày)`;
      }
      return `${day}`;
    })
    .filter(Boolean);
  if (dayStrings.length === 0) return '';
  return ` (ngày ${dayStrings.join(', ')})`;
};

// Tính tổng số ngày trong tháng từ chuỗi "MM/YYYY" hoặc mặc định tháng hiện tại
const getDaysInMonthFromStr = (monthStr) => {
  if (!monthStr) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }
  const parts = monthStr.split('/');
  if (parts.length !== 2) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }
  const month = parseInt(parts[0], 10);
  const year = parseInt(parts[1], 10);
  return new Date(year, month, 0).getDate();
};

export default function DashboardScreen() {
  const router = useRouter();
  const auth = useAuthStore();
  const { setLock, removeLock, getLock, syncLocks } = useLockStore();
  const params = useLocalSearchParams();
  const modalRef = useRef(null);
  const productModalRef = useRef(null);
  const profileModalRef = useRef(null);
  const workspaceModalRef = useRef(null);
  const editCustomerModalRef = useRef(null);
  const popupModalRef = useRef(null);
  const scanTicketModalRef = useRef(null);
  const batchDebtModalRef = useRef(null);
  const batchPaymentModalRef = useRef(null);
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
  const memberActionsModalRef = useRef(null);
  const employeeDailyDebtModalRef = useRef(null); // Modal danh sách ghi nợ trong ngày (chỉ dùng cho tk thành viên)
  const returnGoodsModalRef = useRef(null); // Modal trả hàng (nhanh & thủ công)
  const profitFeatureIntroModalRef = useRef(null); // Modal giới thiệu tính năng tính Lợi Nhuận mới
  const recurringDebtModalRef = useRef(null); // Modal đơn nợ cố định hàng ngày (00:30 mỗi ngày)
  const regularCustomersModalRef = useRef(null); // Modal quản lý khách quen và đối chiếu công nợ tránh sót đơn

  const [showFloatingLogs, setShowFloatingLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [currentView, setCurrentView] = useState(params.view || 'menu'); // 'menu' hoặc 'customers' để điều hướng

  // Tự động mở popup giới thiệu tính năng Tính Lợi Nhuận khi người dùng truy cập Quản lý khách hàng
  useEffect(() => {
    if (currentView === 'customers' && !auth.user?.workspaceMember) {
      const timer = setTimeout(() => {
        profitFeatureIntroModalRef.current?.open();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentView, auth.user?.workspaceMember]);
  const [search, setSearch] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showDebtSummary, setShowDebtSummary] = useState(false);
  const [showDebtToolsMenu, setShowDebtToolsMenu] = useState(false); // State quản lý menu công cụ ghi nợ AI
  const debtToolsMenuRef = useRef(null); // Ref bọc container menu tính năng để tự đóng khi click ngoài

  // Lắng nghe sự kiện click ngoài để đóng dropdown menu tính năng trên Web
  useEffect(() => {
    if (!showDebtToolsMenu || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;

    const handleOutsideClick = (event) => {
      if (debtToolsMenuRef.current && !debtToolsMenuRef.current.contains(event.target)) {
        setShowDebtToolsMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showDebtToolsMenu]);
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

  // Đồng bộ lại quyền hạn mới nhất từ backend khi mở app
  React.useEffect(() => {
    if (auth.accessToken) {
      api.get('/auth/profile')
        .then((response) => {
          if (response.data?.success && response.data?.user) {
            auth.updateUser(response.data.user);
          }
        })
        .catch((err) => {
          console.error('[AUTH] Lỗi khi đồng bộ quyền hạn từ server:', err);
        });
    }
  }, [auth.accessToken]);

  // Các hàm định dạng và màu sắc bổ trợ cho bảng nhật ký nhanh
  const formatTime = (dateStr) => {
    try {
      const d = new Date(dateStr);
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch {
      return '';
    }
  };

  const getBadgeColor = (type) => {
    switch (type) {
      case 'TRANSACTION': return '#D97706';
      case 'PAYMENT': return '#059669';
      case 'CUSTOMER': return '#7C3AED';
      case 'STORE_ORDER': return '#0284C7';
      case 'STORE_PAYMENT': return '#0D9488';
      case 'SHOP_SESSION': return '#DB2777';
      case 'INVENTORY': return '#4F46E5';
      case 'SUPPLIER_TX':
      case 'SUPPLIER_PAYMENT': return '#CA8A04';
      default: return '#64748B';
    }
  };

  const getBorderLeftColor = (item) => {
    if (item.type === 'SHOP_SESSION' && item.rawItem?.isPaid) {
      return '#059669'; // Xanh lá khi đã thanh toán
    }
    return getBadgeColor(item.type);
  };

  const renderActionTitleFloating = (item) => {
    if (item?.type === 'SHOP_SESSION' && item?.rawItem) {
      const { startTime, endTime, isPaid, totalAmount, table } = item.rawItem || {};
      const tableName = table?.name || 'Bàn/Phòng';

      const formatTimeOnly = (dateStr) => {
        if (!dateStr) return '';
        try {
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return '';
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          return `${hours}:${minutes}`;
        } catch {
          return '';
        }
      };

      const startStr = startTime ? formatTimeOnly(startTime) : '';
      const endStr = endTime ? formatTimeOnly(endTime) : 'đang chơi';
      const amountStr = totalAmount ? (parseFloat(totalAmount) || 0).toLocaleString('vi-VN') + 'đ' : '';

      return (
        <Text style={styles.floatingLogText} numberOfLines={2}>
          {tableName}: {startStr ? `${startStr} - ${endStr}` : endStr}
          {isPaid ? (
            <Text style={{ color: '#059669', fontWeight: 'bold' }}> (Đã thanh toán {amountStr})</Text>
          ) : endTime ? (
            <Text style={{ color: '#D97706', fontWeight: 'bold' }}> (Chờ thanh toán {amountStr})</Text>
          ) : (
            <Text style={{ color: '#0284C7', fontWeight: 'bold' }}> (Đang chơi)</Text>
          )}
        </Text>
      );
    }

    return (
      <Text style={styles.floatingLogText} numberOfLines={2}>
        {item?.actionTitle || ''}
      </Text>
    );
  };

  // Tải nhanh 5 thao tác nhân viên mới nhất của ngày hiện tại
  const fetchRecentLogs = async () => {
    setLoadingLogs(true);
    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const res = await api.get('/workspace/member-actions', {
        params: { date: dateStr },
      });
      if (res.data?.success && res.data?.data) {
        setLogs(res.data.data.actions?.slice(0, 5) || []);
      }
    } catch (error) {
      console.error('Lỗi khi tải nhật ký thao tác nhanh:', error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleToggleFloatingLogs = () => {
    const nextState = !showFloatingLogs;
    setShowFloatingLogs(nextState);
    if (nextState) {
      fetchRecentLogs();
    }
  };

  // 1. Dùng React Query tải danh sách khách hàng và cache lại
  const { data: customersResponse, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get('/customers?isBadDebt=false');
      return response.data;
    },
    enabled: auth.hasPermission('canManageCustomers'),
  });

  // 1.5. Dùng React Query tải danh sách khách hàng nợ xấu
  const { data: badCustomersResponse, isLoading: isLoadingBad, refetch: refetchBad, isRefetching: isRefetchingBad } = useQuery({
    queryKey: ['bad_customers'],
    queryFn: async () => {
      const response = await api.get('/customers?isBadDebt=true');
      return response.data;
    },
    enabled: auth.hasPermission('canManageBadDebt'),
  });

  const { data: paymentsResponse, isLoading: isLoadingPayments, refetch: refetchPayments } = useQuery({
    queryKey: ['customer_payments_summary'],
    queryFn: async () => {
      const response = await api.get('/payments');
      return response.data;
    },
    // Luôn tải danh sách thanh toán khi ở tab khách hàng để hiển thị doanh thu trên thẻ tổng hợp
    enabled: currentView === 'customers' && auth.hasPermission('canManageCustomers'),
  });

  const { data: transactionsResponse, isLoading: isLoadingTransactions, refetch: refetchTransactions } = useQuery({
    queryKey: ['customer_transactions_summary'],
    queryFn: async () => {
      const response = await api.get('/transactions');
      return response.data;
    },
    // Luôn tải danh sách giao dịch khi ở tab khách hàng để hiển thị tổng tiền trên thẻ tổng hợp
    enabled: currentView === 'customers' && auth.hasPermission('canManageCustomers'),
  });

  // Helper chuẩn hóa date thành chuỗi YYYY-MM-DD theo giờ địa phương
  const getLocalDateKey = (dateInput) => {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Các hàm làm mới dữ liệu khách hàng kèm theo lịch sử nợ chi tiết nếu đang mở
  const handleRefreshAll = () => {
    refetch();
    refetchPayments(); // Luôn cập nhật lại cả lịch sử thanh toán để đảm bảo doanh thu mới nhất
    refetchTransactions(); // Luôn cập nhật lại giao dịch để đảm bảo tổng tiền mới nhất
    customerDebtHistoryModalRef.current?.refresh();
    // Làm mới danh sách ghi nợ trong ngày của nhân viên nếu đang hiển thị
    employeeDailyDebtModalRef.current?.refresh();
  };

  const handleRefreshBadAll = () => {
    refetchBad();
    customerDebtHistoryModalRef.current?.refresh();
    // Làm mới danh sách ghi nợ trong ngày của nhân viên nếu đang hiển thị
    employeeDailyDebtModalRef.current?.refresh();
  };

  const handleExportDebtFromReport = (customerId, month) => {
    // Tìm khách hàng trong danh sách đã tải
    const customerObj = (customersResponse?.data || []).find((c) => c.id === customerId);
    if (customerObj) {
      exportDebtModalRef.current?.open(customerObj, month);
    } else {
      // Tải chi tiết khách hàng từ API nếu chưa có trong danh sách
      api.get(`/customers/${customerId}`)
        .then((res) => {
          if (res.data?.success && res.data?.data) {
            exportDebtModalRef.current?.open(res.data.data, month);
          }
        })
        .catch((err) => {
          console.error('[REPORT] Không thể tải thông tin khách hàng:', err);
        });
    }
  };

  // Lắng nghe sự kiện realtime CUSTOMER_UPDATED & lock events từ Socket.IO
  React.useEffect(() => {
    const socket = getSocket();
    const currentWorkspaceId = auth.user?.workspaceMember?.workspace?.ownerId || auth.user?.id;

    if (socket && currentWorkspaceId) {
      joinWorkspaceRoom(currentWorkspaceId);

      const handleCustomerUpdate = (data) => {
        console.log('[SOCKET] Nhận thông báo cập nhật khách hàng/ghi nợ:', data);
        refetch();
        refetchBad();
        refetchPayments(); // Cập nhật lại lịch sử thanh toán qua socket
        refetchTransactions(); // Cập nhật lại giao dịch qua socket
        customerDebtHistoryModalRef.current?.refresh();
        // Tự động cập nhật danh sách nợ trong ngày của nhân viên qua socket
        employeeDailyDebtModalRef.current?.refresh();
      };

      // Đồng bộ danh sách locks khi mới kết nối
      const handleLocksSync = ({ locks }) => {
        syncLocks(locks.filter((l) => l.type === 'CUSTOMER'));
      };

      // Cập nhật trạng thái khóa khi có người mở/đóng thao tác với khách hàng
      const handleLockChanged = ({ action, lockInfo }) => {
        if (lockInfo.type !== 'CUSTOMER') return;
        if (action === 'LOCKED') {
          setLock(lockInfo.type, lockInfo.resourceId, lockInfo);
        } else if (action === 'UNLOCKED') {
          removeLock(lockInfo.type, lockInfo.resourceId);
        }
      };

      socket.on('CUSTOMER_UPDATED', handleCustomerUpdate);
      socket.on('RESOURCE_LOCKS_SYNC', handleLocksSync);
      socket.on('RESOURCE_LOCK_CHANGED', handleLockChanged);

      return () => {
        socket.off('CUSTOMER_UPDATED', handleCustomerUpdate);
        socket.off('RESOURCE_LOCKS_SYNC', handleLocksSync);
        socket.off('RESOURCE_LOCK_CHANGED', handleLockChanged);
      };
    }
  }, [auth.user?.id, auth.user?.workspaceMember?.workspace?.ownerId]);

  // 1.8. Dùng React Query tải danh sách nhà cung cấp
  const { data: suppliersResponse, isLoading: isLoadingSuppliers, refetch: refetchSuppliers, isRefetching: isRefetchingSuppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const response = await api.get('/suppliers');
      return response.data;
    },
    enabled: auth.hasPermission('canManageDebt'),
  });

  // 1.9. Dùng React Query tải danh sách nhân viên (tự động tải lại khi đổi tháng xem lương)
  const { data: employeesResponse, isLoading: isLoadingEmployees, refetch: refetchEmployees } = useQuery({
    queryKey: ['employees', salaryMonth],
    queryFn: async () => {
      const response = await api.get(`/employees?monthKey=${salaryMonth}`);
      return response.data;
    },
    enabled: auth.hasPermission('canManageEmployees'),
  });

  // States và logic chấm công & bảng lương nhân viên
  const [salaryData, setSalaryData] = useState([]);
  const [loadingSalary, setLoadingSalary] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);

  // States phụ để nhập thưởng phạt khi mở rộng thẻ nhân viên để chốt lương
  const [activeSalaryEmpId, setActiveSalaryEmpId] = useState(null);
  const [activeOptionsEmpId, setActiveOptionsEmpId] = useState(null);
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

  // Tự động load dữ liệu chấm công khi đổi ngày hoặc tab
  React.useEffect(() => {
    if (currentView === 'employees' && employeeTab === 'ATTENDANCE') {
      fetchAttendanceList(attendanceDate);
    }
  }, [currentView, employeeTab, attendanceDate]);

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
      const response = await api.post('/employees/salary/pay', {
        employeeId: empId,
        monthKey: salaryMonth,
      });

      if (response.data.success) {
        Alert.alert('Thành công', 'Đã chốt và chi trả lương tháng thành công.');
        setActiveSalaryEmpId(null);
        refetchEmployees(); // Làm mới danh sách nhân viên để cập nhật lương hiển thị & trạng thái
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

    if (firstResult.status === 'unrelated' || firstResult.transaction_type === 'unrelated') {
      popupModalRef.current?.show({
        title: 'Không nhận diện được nội dung ghi nợ',
        message: 'Câu thoại không liên quan đến cấu trúc ghi nợ. Vui lòng nói ngày, tên khách hàng và số tiền (hoặc loại thịt và khối lượng).',
        type: 'warning'
      });
      return;
    }

    if (firstResult.status === 'incomplete') {
      popupModalRef.current?.show({
        title: 'Thông tin chưa đầy đủ',
        message: `Câu thoại thiếu thông tin bắt buộc: ${(firstResult.missing_fields || []).join(', ')}. Vui lòng bổ sung đầy đủ.`,
        type: 'warning'
      });
      return;
    }

    if (firstResult.transaction_type === 'tra_tien') {
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
      return;
    }

    // Luồng Ghi nợ: Chuẩn hóa danh sách items
    const items = results.map((result) => {
      if (result.product) {
        return {
          ...result,
          quantity: Number(result.quantity) || 1,
          price: Number(result.price) || 0,
          amount: Number(result.amount) || Math.round((Number(result.quantity) || 1) * (Number(result.price) || 0)),
          voiceDate: result.voiceDate || responseData.date || firstResult.date,
          voiceCustomerName: result.voiceCustomerName || customerName || '',
        };
      }

      const itemAmt = Number(result.amount) || 0;
      const hasWeight = Number(result.weight_kg) > 0;
      const qty = hasWeight ? Number(result.weight_kg) : 1;
      const prc = hasWeight ? itemAmt / qty : itemAmt;
      return {
        product: {
          name: result.meat_type || 'Tiền hàng',
          unit: hasWeight ? 'kg' : 'phần',
          defaultPrice: prc
        },
        quantity: qty,
        price: prc,
        amount: itemAmt,
        voiceDate: result.date || responseData.date,
        voiceCustomerName: result.customer_name || customerName || '',
        voiceTotalAmount: itemAmt,
      };
    });

    const rawNotes = results.map((result) => result.rawTranscript || result.raw_transcript).filter(Boolean).join(' | ');

    scanTicketModalRef.current?.open(
      items,
      sourceTitle,
      rawNotes || responseData.rawTranscript || '',
      responseData.date || firstResult.date,
      customerName,
      customerId
    );
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

  // Mở popup hướng dẫn người dùng cách nói ghi nợ trước khi thu âm
  const handleVoicePress = () => {
    if (isRecording) {
      handleToggleRecording();
      return;
    }

    popupModalRef.current?.show({
      title: 'Hướng dẫn ghi nợ bằng giọng nói',
      icon: '🎙️',
      message: '🎤 HƯỚNG DẪN GHI NỢ GIỌNG NÓI\n\n1. **Ghi nợ thủ công**\nNói: ngày → tên khách → số lượng + loại thịt → giá.\nVí dụ: “Hôm nay, anh Khải, 1,2 cân bắp bò, giá 28.”\n\n2. **Ghi nợ nhanh**\nNói: ngày → tên khách → ghi nợ nhanh → số tiền.\nVí dụ: “Hôm qua, chị Lan, ghi nợ nhanh 500 nghìn.”\n\n💡 Chú thích: Không cần đọc ngày cụ thể, bạn có thể nói "hôm nay", "ngày mai", "hôm qua", "mai"... hoặc bỏ qua ngày (mặc định lấy ngày hôm nay).',
      type: 'confirm',
      confirmText: 'Bắt đầu nói',
      cancelText: 'Để sau',
      onConfirm: handleToggleRecording,
    });
  };

  const customers = customersResponse?.data || [];
  const customerIdSet = new Set(customers.map((c) => c.id));
  const customerPayments = (paymentsResponse?.data || []).filter((payment) => customerIdSet.has(payment.customerId));

  // Helper lấy định dạng tháng/năm dạng ngắn MM/YYYY
  const getShortMonthYear = (monthKey) => {
    const [year, month] = monthKey.split('-');
    return `${month}/${year}`;
  };

  // 2. Tính toán tổng nợ của toàn bộ khách hàng để hiển thị
  const totalDebt = customers.reduce((sum, c) => sum + (c.debt || 0), 0);
  const selectedMonthPayments = customerPayments.filter((payment) => {
    const paidDate = payment.paidAt ? new Date(payment.paidAt) : null;
    if (!paidDate || isNaN(paidDate.getTime())) return false;
    const monthKey = `${paidDate.getFullYear()}-${(paidDate.getMonth() + 1).toString().padStart(2, '0')}`;
    return monthKey === selectedRevenueMonth;
  });
  const totalCollectedInSelectedMonth = selectedMonthPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  // Tính tổng giao dịch (tiền hàng nợ phát sinh) của tháng được chọn
  const customerTransactions = (transactionsResponse?.data || []).filter((t) => customerIdSet.has(t.customerId));
  const selectedMonthTransactions = customerTransactions.filter((transaction) => {
    const tDate = transaction.date ? new Date(transaction.date) : null;
    if (!tDate || isNaN(tDate.getTime())) return false;
    const monthKey = `${tDate.getFullYear()}-${(tDate.getMonth() + 1).toString().padStart(2, '0')}`;
    return monthKey === selectedRevenueMonth;
  });
  const totalTransactionsInSelectedMonth = selectedMonthTransactions.reduce((sum, t) => sum + parseFloat(t.totalAmount || 0), 0);

  // Tính tổng lợi nhuận của tháng được chọn
  const totalProfitInSelectedMonth = selectedMonthTransactions.reduce((sum, t) => {
    if (t.totalProfit !== undefined && t.totalProfit !== null && parseFloat(t.totalProfit) > 0) {
      return sum + parseFloat(t.totalProfit);
    }
    // Fallback tính từ items nếu đơn cũ chưa lưu totalProfit
    if (t.items && Array.isArray(t.items)) {
      const itemsProfit = t.items.reduce((iSum, it) => {
        if (it.profit !== undefined && it.profit !== null && parseFloat(it.profit) > 0) {
          return iSum + parseFloat(it.profit);
        }
        const qty = parseFloat(it.quantity || 0);
        const sellPrice = parseFloat(it.price || 0);
        const itemCostNum = parseFloat(it.costPrice || 0);
        const prodCostNum = parseFloat(it.product?.costPrice || 0);
        const costPrice = itemCostNum > 0 ? itemCostNum : prodCostNum;
        const amt = it.amount !== null && it.amount !== undefined ? parseFloat(it.amount) : Math.round(qty * sellPrice);
        if (costPrice > 0) {
          return iSum + (amt - (qty * costPrice));
        }
        return iSum;
      }, 0);
      return sum + itemsProfit;
    }
    return sum;
  }, 0);

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

  // 3. Bộ lọc tìm kiếm nhanh theo tên hoặc SĐT khách hàng (hỗ trợ không dấu, viết tắt, nhiều từ rời rạc) và sắp xếp
  const filteredCustomers = customers
    .filter((c) => matchItemSearch(c, search, ['name', 'phone', 'address', 'note']))
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
    .filter((c) => matchItemSearch(c, search, ['name', 'phone', 'address', 'note']))
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
    .filter((s) => matchItemSearch(s, search, ['name', 'phone', 'address', 'note']))
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
                  supplierHistoryModalRef.current?.open(item);
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
                  supplierDebtModalRef.current?.open(item);
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
                  supplierPaymentModalRef.current?.open(item.debt || '', item);
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
    const remainingSalary = item.baseSalary - (item.totalAdvances || 0) + (item.carryOver || 0);
    const showOptions = activeOptionsEmpId === item.id;

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
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 4 }}>
                  <Text style={[styles.debtValueLabel, { marginBottom: 0 }]}>Lương thực lĩnh:</Text>
                  <Text style={[
                    styles.debtValueAmount,
                    {
                      color: item.isPaid ? '#10B981' : (remainingSalary < 0 ? '#EF4444' : '#0369A1'),
                      fontSize: remainingSalary < 0 ? 11 : 15
                    }
                  ]}>
                    {formatCurrency(remainingSalary)}{remainingSalary < 0 ? ' (chuyển sang tháng sau)' : ''}
                  </Text>
                </View>
                {item.totalAdvances > 0 && (
                  <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 2, textAlign: 'right' }}>
                    (Gốc: {formatCurrency(item.baseSalary)} - Ứng: {formatCurrency(item.totalAdvances)})
                  </Text>
                )}
                {item.carryOver < 0 && (
                  <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 2, textAlign: 'right' }}>
                    (Nợ tháng trước chuyển sang: {formatCurrency(item.carryOver)})
                  </Text>
                )}
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2, textAlign: 'right' }}>
                  (~{formatCurrency(Math.round(item.baseSalary / getDaysInMonthFromStr(salaryMonth)))}/ngày - chia {getDaysInMonthFromStr(salaryMonth)} công)
                </Text>
                {item.isPaid && (
                  <View style={{ marginTop: 4, backgroundColor: '#10B98120', borderColor: '#10B981', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 10, color: '#10B981', fontWeight: 'bold', textAlign: 'center' }}>✅ Đã trả lương</Text>
                  </View>
                )}
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
                  employeeHistoryModalRef.current?.open(item);
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

              {/* Nút trả lương trực tiếp */}
              {!item.isPaid && (
                <AnimatedPressable
                  style={[styles.addDebtBtn, { backgroundColor: '#10B981', borderColor: '#10B981' }]}
                  onPress={() => {
                    popupModalRef.current?.show({
                      title: 'Xác nhận trả lương',
                      message: `Bạn có chắc chắn muốn trả lương cho nhân viên "${item.name}" với số tiền thực lĩnh là ${formatCurrency(remainingSalary)} không?`,
                      type: 'confirm',
                      confirmText: 'Xác nhận',
                      cancelText: 'Hủy bỏ',
                      onConfirm: () => handlePaySalary(item.id),
                    });
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.addDebtBtnText, { color: '#FFFFFF' }]}>💵 Trả lương</Text>
                </AnimatedPressable>
              )}
              {/* Nút 3 chấm dọc (Chứa tính năng Sửa & Xóa) */}
              <View style={{ position: 'relative', zIndex: 100 }}>
                <AnimatedPressable
                  style={[styles.viewDebtBtn, { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', minWidth: 32, paddingHorizontal: 8 }]}
                  onPress={() => {
                    setActiveOptionsEmpId(activeOptionsEmpId === item.id ? null : item.id);
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.viewDebtBtnText, { color: '#64748B', fontSize: 16 }]}>⋮</Text>
                </AnimatedPressable>

                {showOptions && (
                  <View style={styles.employeeOptionsDropdown}>
                    <TouchableOpacity
                      style={styles.employeeOptionsDropdownItem}
                      onPress={() => {
                        setActiveOptionsEmpId(null);
                        editEmployeeModalRef.current?.open(item);
                      }}
                    >
                      <Text style={styles.employeeOptionsDropdownText}>✏️ Sửa thông tin</Text>
                    </TouchableOpacity>
                    <View style={styles.employeeOptionsDropdownDivider} />
                    <TouchableOpacity
                      style={styles.employeeOptionsDropdownItem}
                      onPress={() => {
                        setActiveOptionsEmpId(null);
                        confirmDeleteEmployee(item.id, item.name);
                      }}
                    >
                      <Text style={[styles.employeeOptionsDropdownText, { color: '#EF4444' }]}>🗑️ Xóa nhân viên</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
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
    // Nhân viên là tài khoản có workspaceMember (thành viên workspace của chủ)
    const isEmployee = !!auth.user?.workspaceMember;
    // Lấy chữ cái đầu của tên khách hàng làm avatar
    const firstLetter = (item.name || 'K').trim().charAt(0).toUpperCase();

    // Xác định màu nền avatar ngẫu nhiên dựa trên tên để sinh động
    const avatarBgColors = ['#FFE2E2', '#E3F2FD', '#E8F5E9', '#FFF3E0', '#F3E5F5', '#E0F7FA'];
    const avatarTextColors = ['#D32F2F', '#1976D2', '#388E3C', '#F57C00', '#7B1FA2', '#0097A7'];
    const charCode = item.name ? item.name.charCodeAt(0) : 0;
    const colorIdx = charCode % avatarBgColors.length;
    const avatarBg = avatarBgColors[colorIdx];
    const avatarText = avatarTextColors[colorIdx];

    const activeLock = getLock('CUSTOMER', item.id);
    const isLockedByOther = activeLock && activeLock.userId !== auth.user?.id;

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
        {/* Lớp phủ Overlay nếu khách hàng này đang có người khác xử lý */}
        {isLockedByOther ? (
          <ResourceLockOverlay lockInfo={activeLock} borderRadius={12} />
        ) : null}
        <View style={styles.customerCardClickable}>
          {/* PHẦN TRÊN: Thông tin khách hàng và dư nợ (Click để xem chi tiết) */}
          <TouchableOpacity
            style={styles.cardHeaderTouchable}
            onPress={() => router.push(`/customer/${item.id}`)}
            activeOpacity={0.7}
          >
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

              {/* Trạng thái công nợ bên phải: Ẩn hoàn toàn với nhân viên */}
              {!isEmployee && (
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
              )}
            </View>
          </TouchableOpacity>

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
              ) : isEmployee ? (
                // Nhân viên: chỉ hiện nút Ghi nợ, ẩn Xem nợ và Xuất nợ
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
                  <Text style={styles.addDebtBtnText}>Ghi nợ</Text>
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
                    <Text style={styles.viewDebtBtnText}>Xem nợ</Text>
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
                    <Text style={styles.addDebtBtnText}>Ghi nợ</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.returnGoodsBtn}
                    onPress={(e) => {
                      if (e && e.stopPropagation) {
                        e.stopPropagation();
                      }
                      setSelectedCustomerId(item.id);
                      returnGoodsModalRef.current?.open(item);
                    }}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.returnGoodsBtnText}>
                      Trả hàng
                    </Text>
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
                    <Text style={styles.exportDebtBtnText}>Xuất nợ</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Nút 3 chấm Sửa & Xóa: chỉ hiện với chủ tài khoản */}
              {!isEmployee && (
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
              )}
            </View>
          </View>
        </View>
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

          {/* Tiêu đề cố định ở đầu */}
          <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
            <Text style={styles.menuTitle}>HỆ THỐNG QUẢN LÝ</Text>
            <Text style={styles.menuSubtitle}>Vui lòng lựa chọn nghiệp vụ để bắt đầu làm việc</Text>
          </View>

          {/* Danh sách các chức năng chính có thể cuộn */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.menuContainer}
            showsVerticalScrollIndicator={true}
          >

            {/* Chức năng: Quản lý Workspace */}
            {auth.user?.isWorkspaceOwner && (
              <TouchableOpacity
                style={[styles.menuCard, { borderColor: '#8B5CF6', backgroundColor: '#8B5CF610' }]}
                onPress={() => {
                  workspaceModalRef.current?.open(auth.user);
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.menuCardIconBg, { backgroundColor: '#8B5CF620' }]}>
                  <Text style={styles.menuCardIcon}>👑</Text>
                </View>
                <View style={styles.menuCardContent}>
                  <Text style={[styles.menuCardTitle, { color: '#C084FC' }]}>Quản lý Workspace</Text>
                  <Text style={styles.menuCardDesc}>Thiết lập mã mời QR, tuyển dụng nhân viên và phân quyền chấm công.</Text>
                </View>
              </TouchableOpacity>
            )}

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

            {auth.hasPermission('canManageStore') && (
              <TouchableOpacity
                style={[styles.menuCard, styles.menuCardActiveStore]}
                onPress={() => {
                  router.push('/store');
                }}
                activeOpacity={0.8}
              >
                <View style={styles.menuCardIconBgStore}>
                  <Text style={styles.menuCardIcon}>🏪</Text>
                </View>
                <View style={styles.menuCardContent}>
                  <Text style={styles.menuCardTitleStore}>Quản lý nhà hàng</Text>
                  <Text style={styles.menuCardDescStore}>Quản lý bàn ăn, thực đơn món ăn, thanh toán bàn, doanh thu nhà hàng</Text>
                </View>
              </TouchableOpacity>
            )}

            {auth.hasPermission('canManageShop') && (
              <TouchableOpacity
                style={[styles.menuCard, styles.menuCardActiveShop]}
                onPress={() => {
                  router.push('/shop');
                }}
                activeOpacity={0.8}
              >
                <View style={styles.menuCardIconBgShop}>
                  <Text style={styles.menuCardIcon}>🏪</Text>
                </View>
                <View style={styles.menuCardContent}>
                  <Text style={styles.menuCardTitleShop}>Quản lý cửa hàng</Text>
                  <Text style={styles.menuCardDescShop}>Tính tiền theo giờ (bida, karaoke, giặt đồ...), phụ thu dịch vụ và báo cáo doanh thu</Text>
                </View>
              </TouchableOpacity>
            )}

            {auth.hasPermission('canManageInventory') && (
              <TouchableOpacity
                style={[styles.menuCard, styles.menuCardActiveInventory]}
                onPress={() => {
                  router.push('/inventory');
                }}
                activeOpacity={0.8}
              >
                <View style={styles.menuCardIconBgInventory}>
                  <Text style={styles.menuCardIcon}>📦</Text>
                </View>
                <View style={styles.menuCardContent}>
                  <Text style={styles.menuCardTitleInventory}>Quản lý kho</Text>
                  <Text style={styles.menuCardDescInventory}>Xem danh sách tồn kho, thêm sản phẩm và tổng giá trị kho hàng</Text>
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



          </ScrollView>
        </View>

        {/* Nút nổi và Bảng nhật ký nhanh của nhân viên (Dành riêng cho Chủ Workspace) */}
        {auth.user?.isWorkspaceOwner && (
          <View style={styles.floatingLogContainer}>
            {showFloatingLogs && (
              <View style={styles.floatingLogPanel}>
                <View style={styles.floatingLogHeader}>
                  <Text style={styles.floatingLogTitle}>📋 Nhật ký hôm nay</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowFloatingLogs(false);
                      memberActionsModalRef.current?.open(auth.user);
                    }}
                    style={styles.floatingLogExpandBtn}
                  >
                    <Text style={styles.floatingLogExpandText}>Chi tiết ➔</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.floatingLogList}>
                  {loadingLogs ? (
                    <ActivityIndicator size="small" color="#7C3AED" style={{ marginVertical: 15 }} />
                  ) : logs.length === 0 ? (
                    <Text style={styles.floatingLogEmpty}>Không có thao tác nào trong ngày.</Text>
                  ) : (
                    logs.map((item) => {
                      const badgeColor = getBadgeColor(item.type);
                      return (
                        <View key={item.id} style={[styles.floatingLogItem, { borderLeftColor: badgeColor }]}>
                          <View style={styles.floatingLogItemHeader}>
                            <Text style={styles.floatingLogActor}>🧑‍💼 {item.actor?.name}</Text>
                            <Text style={styles.floatingLogTime}>{formatTime(item.createdAt)}</Text>
                          </View>
                          <Text style={styles.floatingLogText} numberOfLines={2}>
                            {item.actionTitle}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity
              style={styles.floatingLogButton}
              onPress={handleToggleFloatingLogs}
              activeOpacity={0.8}
            >
              <Text style={styles.floatingLogButtonText}>
                {showFloatingLogs ? '✕ Thu gọn' : '📜 Nhật ký nhân viên'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Modal xem nhật ký chi tiết */}
        <WorkspaceMemberActionsModal ref={memberActionsModalRef} />

        {/* Modal Hồ sơ */}
        <ProfileModal ref={profileModalRef} />
        {/* Modal Quản lý Workspace */}
        <AdminOwnerDetailModal ref={workspaceModalRef} />
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

          {/* NÚT THÊM NỢ XẤU (MỚI DI CHUYỂN LÊN TRÊN) */}
          <TouchableOpacity
            style={[styles.addBadDebtButtonFull, { marginHorizontal: 16, marginTop: 0, marginBottom: 4 }]}
            onPress={() => addBadDebtModalRef.current?.open()}
            activeOpacity={0.8}
          >
            <Text style={styles.addBadDebtButtonFullText}>➕ THÊM NỢ XẤU</Text>
          </TouchableOpacity>

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
        <EditDebtModal ref={editDebtModalRef} customerId={selectedCustomerId} onRefresh={handleRefreshBadAll} />
        <EditPaymentModal ref={editPaymentModalRef} onRefresh={handleRefreshBadAll} />

        {/* Nút nổi và Bảng nhật ký nhanh của nhân viên (Dành riêng cho Chủ Workspace) */}
        {auth.user?.isWorkspaceOwner && (
          <View style={styles.floatingLogContainer}>
            {showFloatingLogs && (
              <View style={styles.floatingLogPanel}>
                <View style={styles.floatingLogHeader}>
                  <Text style={styles.floatingLogTitle}>📋 Nhật ký hôm nay</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowFloatingLogs(false);
                      memberActionsModalRef.current?.open(auth.user);
                    }}
                    style={styles.floatingLogExpandBtn}
                  >
                    <Text style={styles.floatingLogExpandText}>Chi tiết ➔</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.floatingLogList}>
                  {loadingLogs ? (
                    <ActivityIndicator size="small" color="#7C3AED" style={{ marginVertical: 15 }} />
                  ) : logs.length === 0 ? (
                    <Text style={styles.floatingLogEmpty}>Không có thao tác nào trong ngày.</Text>
                  ) : (
                    logs.map((item) => {
                      const badgeColor = getBadgeColor(item.type);
                      return (
                        <View key={item.id} style={[styles.floatingLogItem, { borderLeftColor: badgeColor }]}>
                          <View style={styles.floatingLogItemHeader}>
                            <Text style={styles.floatingLogActor}>🧑‍💼 {item.actor?.name}</Text>
                            <Text style={styles.floatingLogTime}>{formatTime(item.createdAt)}</Text>
                          </View>
                          <Text style={styles.floatingLogText} numberOfLines={2}>
                            {item.actionTitle}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity
              style={styles.floatingLogButton}
              onPress={handleToggleFloatingLogs}
              activeOpacity={0.8}
            >
              <Text style={styles.floatingLogButtonText}>
                {showFloatingLogs ? '✕ Thu gọn' : '📜 Nhật ký nhân viên'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Modal xem nhật ký chi tiết */}
        <WorkspaceMemberActionsModal ref={memberActionsModalRef} />
      </SafeAreaView>
    );
  }

  if (currentView === 'employees') {
    // Lọc danh sách nhân viên phục vụ tìm kiếm nhanh (hỗ trợ không dấu, viết tắt, nhiều từ)
    const employees = employeesResponse?.data || [];
    const filteredEmployees = employees.filter((emp) => {
      return matchItemSearch(emp, search, ['name', 'phone', 'role', 'note']);
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
          </View>

          {/* TAB 1: DANH SÁCH NHÂN SỰ */}
          {employeeTab === 'STAFF' && (
            <>
              {/* ĐIỀU KHIỂN LỌC THÁNG LƯƠNG & ỨNG LƯƠNG */}
              <View style={styles.dateSelectorContainer}>
                <TouchableOpacity style={styles.dateSelectorArrow} onPress={() => adjustSalaryMonth(-1)}>
                  <Text style={styles.dateSelectorArrowText}>◀️ Tháng trước</Text>
                </TouchableOpacity>
                <View style={styles.dateDisplayWrapper}>
                  <Text style={styles.dateDisplayTitle}>Tháng xem lương & ứng</Text>
                  <Text style={styles.dateDisplayVal}>Tháng {salaryMonth}</Text>
                </View>
                <TouchableOpacity style={styles.dateSelectorArrow} onPress={() => adjustSalaryMonth(1)}>
                  <Text style={styles.dateSelectorArrowText}>Tháng sau ▶️</Text>
                </TouchableOpacity>
              </View>

              {/* NÚT THÊM NHÂN VIÊN MỚI (MỚI DI CHUYỂN LÊN TRÊN) */}
              <TouchableOpacity
                style={[styles.addEmployeeButtonFull, { marginHorizontal: 16, marginTop: 8, marginBottom: 4 }]}
                onPress={() => addEmployeeModalRef.current?.open()}
                activeOpacity={0.8}
              >
                <Text style={styles.addEmployeeButtonFullText}>➕ THÊM NHÂN VIÊN MỚI</Text>
              </TouchableOpacity>

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
                    <View style={[styles.attendanceCard, { flexDirection: 'column', alignItems: 'stretch' }]}>
                      {/* Dòng 1: Tên nhân viên */}
                      <View style={{ marginBottom: 8, paddingHorizontal: 4 }}>
                        <Text style={styles.attendanceEmpName}>{item.name}</Text>
                      </View>

                      {/* Dòng 2: Các nút chấm công */}
                      <View style={[styles.attendanceActions, { width: '100%' }]}>
                        {/* Nút đi làm cả ngày */}
                        <TouchableOpacity
                          style={[
                            styles.attButton,
                            { flex: 1, alignItems: 'center', justifyContent: 'center' },
                            isPresent && !isHalf && styles.attButtonGreen
                          ]}
                          onPress={() => handleToggleAttendance(item.employeeId, 'PRESENT', 'FULL')}
                        >
                          <Text style={[styles.attButtonText, isPresent && !isHalf && styles.attButtonTextActive]}>
                            🟢 Làm đủ
                          </Text>
                        </TouchableOpacity>

                        {/* Nút đi làm nửa ngày */}
                        <TouchableOpacity
                          style={[
                            styles.attButton,
                            { flex: 1, alignItems: 'center', justifyContent: 'center' },
                            isPresent && isHalf && styles.attButtonYellow
                          ]}
                          onPress={() => handleToggleAttendance(item.employeeId, 'PRESENT', 'HALF')}
                        >
                          <Text style={[styles.attButtonText, isPresent && isHalf && styles.attButtonTextActive]}>
                            🟡 Nghỉ nửa ngày
                          </Text>
                        </TouchableOpacity>

                        {/* Nút nghỉ */}
                        <TouchableOpacity
                          style={[
                            styles.attButton,
                            { flex: 1, alignItems: 'center', justifyContent: 'center' },
                            item.status === 'ABSENT' && styles.attButtonRed
                          ]}
                          onPress={() => handleToggleAttendance(item.employeeId, 'ABSENT', 'FULL')}
                        >
                          <Text style={[styles.attButtonText, item.status === 'ABSENT' && styles.attButtonTextActive]}>
                            🔴 Nghỉ cả ngày
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


        </View>

        {employeeTab === 'ATTENDANCE' && (
          <View style={styles.bottomBarEmployee}>
            <TouchableOpacity
              style={[styles.addEmployeeButtonFull, { backgroundColor: '#10B981', shadowColor: '#10B981', flex: 1, height: 46 }]}
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
        <SalaryAdvanceModal ref={salaryAdvanceModalRef} employee={selectedEmployee} onRefresh={refetchEmployees} />
        <EmployeeHistoryModal ref={employeeHistoryModalRef} employee={selectedEmployee} />

        {/* Nút nổi và Bảng nhật ký nhanh của nhân viên (Dành riêng cho Chủ Workspace) */}
        {auth.user?.isWorkspaceOwner && (
          <View style={styles.floatingLogContainer}>
            {showFloatingLogs && (
              <View style={styles.floatingLogPanel}>
                <View style={styles.floatingLogHeader}>
                  <Text style={styles.floatingLogTitle}>📋 Nhật ký hôm nay</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowFloatingLogs(false);
                      memberActionsModalRef.current?.open(auth.user);
                    }}
                    style={styles.floatingLogExpandBtn}
                  >
                    <Text style={styles.floatingLogExpandText}>Chi tiết ➔</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.floatingLogList}>
                  {loadingLogs ? (
                    <ActivityIndicator size="small" color="#7C3AED" style={{ marginVertical: 15 }} />
                  ) : logs.length === 0 ? (
                    <Text style={styles.floatingLogEmpty}>Không có thao tác nào trong ngày.</Text>
                  ) : (
                    logs.map((item) => {
                      const badgeColor = getBadgeColor(item.type);
                      return (
                        <View key={item.id} style={[styles.floatingLogItem, { borderLeftColor: badgeColor }]}>
                          <View style={styles.floatingLogItemHeader}>
                            <Text style={styles.floatingLogActor}>🧑‍💼 {item.actor?.name}</Text>
                            <Text style={styles.floatingLogTime}>{formatTime(item.createdAt)}</Text>
                          </View>
                          <Text style={styles.floatingLogText} numberOfLines={2}>
                            {item.actionTitle}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity
              style={styles.floatingLogButton}
              onPress={handleToggleFloatingLogs}
              activeOpacity={0.8}
            >
              <Text style={styles.floatingLogButtonText}>
                {showFloatingLogs ? '✕ Thu gọn' : '📜 Nhật ký nhân viên'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Modal xem nhật ký chi tiết */}
        <WorkspaceMemberActionsModal ref={memberActionsModalRef} />
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

          {/* NÚT THÊM NHÀ CUNG CẤP (MỚI DI CHUYỂN LÊN TRÊN) */}
          <TouchableOpacity
            style={[styles.addSupplierButtonFull, { marginHorizontal: 16, marginTop: 0, marginBottom: 4 }]}
            onPress={() => addSupplierModalRef.current?.open()}
            activeOpacity={0.8}
          >
            <Text style={styles.addSupplierButtonFullText}>➕ THÊM NHÀ CUNG CẤP</Text>
          </TouchableOpacity>

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

        <ProfileModal ref={profileModalRef} />
        <PopupModal ref={popupModalRef} />
        {/* Modals nhà cung cấp */}
        <AddSupplierModal ref={addSupplierModalRef} onRefresh={refetchSuppliers} />
        <SupplierDebtModal ref={supplierDebtModalRef} supplier={selectedSupplier} onRefresh={refetchSuppliers} />
        <SupplierPaymentModal ref={supplierPaymentModalRef} supplier={selectedSupplier} onRefresh={refetchSuppliers} />
        <SupplierHistoryModal ref={supplierHistoryModalRef} supplier={selectedSupplier} />

        {/* Nút nổi và Bảng nhật ký nhanh của nhân viên (Dành riêng cho Chủ Workspace) */}
        {auth.user?.isWorkspaceOwner && (
          <View style={styles.floatingLogContainer}>
            {showFloatingLogs && (
              <View style={styles.floatingLogPanel}>
                <View style={styles.floatingLogHeader}>
                  <Text style={styles.floatingLogTitle}>📋 Nhật ký hôm nay</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowFloatingLogs(false);
                      memberActionsModalRef.current?.open(auth.user);
                    }}
                    style={styles.floatingLogExpandBtn}
                  >
                    <Text style={styles.floatingLogExpandText}>Chi tiết ➔</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.floatingLogList}>
                  {loadingLogs ? (
                    <ActivityIndicator size="small" color="#7C3AED" style={{ marginVertical: 15 }} />
                  ) : logs.length === 0 ? (
                    <Text style={styles.floatingLogEmpty}>Không có thao tác nào trong ngày.</Text>
                  ) : (
                    logs.map((item) => {
                      const badgeColor = getBadgeColor(item.type);
                      return (
                        <View key={item.id} style={[styles.floatingLogItem, { borderLeftColor: badgeColor }]}>
                          <View style={styles.floatingLogItemHeader}>
                            <Text style={styles.floatingLogActor}>🧑‍💼 {item.actor?.name}</Text>
                            <Text style={styles.floatingLogTime}>{formatTime(item.createdAt)}</Text>
                          </View>
                          <Text style={styles.floatingLogText} numberOfLines={2}>
                            {item.actionTitle}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity
              style={styles.floatingLogButton}
              onPress={handleToggleFloatingLogs}
              activeOpacity={0.8}
            >
              <Text style={styles.floatingLogButtonText}>
                {showFloatingLogs ? '✕ Thu gọn' : '📜 Nhật ký nhân viên'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Modal xem nhật ký chi tiết */}
        <WorkspaceMemberActionsModal ref={memberActionsModalRef} />
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

        {/* TỔNG TIỀN NỢ & KINH DOANH: Chỉ hiện với chủ tài khoản, ẩn với tài khoản thành viên */}
        {!auth.user?.workspaceMember && <View style={styles.summaryCard}>
          <TouchableOpacity
            onPress={() => setShowDebtSummary((prev) => !prev)}
            activeOpacity={0.85}
          >
            {/* Thanh tiêu đề nhỏ hiển thị tháng và gợi ý mở rộng */}
            <View style={styles.summaryCardTopHeader}>
              <View style={styles.summaryMonthBadge}>
                <Text style={styles.summaryMonthBadgeText}>
                  📊 Thống kê Tháng {getShortMonthYear(selectedRevenueMonth)}
                </Text>
              </View>
              <Text style={styles.summaryExpandHint}>
                {showDebtSummary ? 'Thu gọn ▲' : 'Xem chi tiết ▼'}
              </Text>
            </View>

            {/* Chia giao diện thành 3 ô thống kê con màu sắc trực quan */}
            <View style={styles.summaryColumnsRow}>
              {/* 1. Tổng tiền nợ */}
              <View style={[styles.summaryMicroBox, styles.summaryMicroBoxDebt]}>
                <Text style={styles.summaryMicroBoxLabelDebt}>🔴 TỔNG NỢ</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit={true} style={styles.summaryMicroBoxValueDebt}>
                  {formatCurrency(totalDebt)}
                </Text>
              </View>

              {/* 2. Doanh thu đã thu trong tháng */}
              <View style={[styles.summaryMicroBox, styles.summaryMicroBoxRevenue]}>
                <Text style={styles.summaryMicroBoxLabelRevenue}>🟢 DOANH THU</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit={true} style={styles.summaryMicroBoxValueRevenue}>
                  {isLoadingPayments ? '...' : formatCurrency(totalCollectedInSelectedMonth)}
                </Text>
              </View>

              {/* 3. Lợi nhuận trong tháng */}
              <View style={[styles.summaryMicroBox, styles.summaryMicroBoxProfit]}>
                <Text style={styles.summaryMicroBoxLabelProfit}>🔵 LỢI NHUẬN</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit={true} style={styles.summaryMicroBoxValueProfit}>
                  {isLoadingTransactions ? '...' : formatCurrency(totalProfitInSelectedMonth)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {showDebtSummary && (
            <View style={styles.debtSummaryDetail}>
              {isLoadingPayments || isLoadingTransactions ? (
                <ActivityIndicator size="small" color={COLORS.dangerDark} style={styles.summaryLoader} />
              ) : (
                <>
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

                    <View style={styles.monthTotalSalesBox}>
                      <Text style={styles.monthTotalSalesLabel}>🥩 Tổng tiền hàng trong tháng:</Text>
                      <Text numberOfLines={1} adjustsFontSizeToFit={true} style={styles.monthTotalSalesValue}>
                        {formatCurrency(totalTransactionsInSelectedMonth)}
                      </Text>
                    </View>

                    <View style={[styles.monthTotalSalesBox, { marginTop: 4, paddingTop: 4 }]}>
                      <Text style={[styles.monthTotalSalesLabel, { color: '#0369A1' }]}>💰 Lợi nhuận trong tháng:</Text>
                      <Text numberOfLines={1} adjustsFontSizeToFit={true} style={[styles.monthTotalSalesValue, { color: '#0369A1' }]}>
                        {formatCurrency(totalProfitInSelectedMonth)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.dailyCollectedSection}>
                    <Text style={styles.dailyCollectedTitle}>Tiền đã thu từng ngày</Text>
                    {dailyCollectedRows.length > 0 ? (
                      // Thanh cuộn cho danh sách tiền đã thu từng ngày
                      <ScrollView style={styles.dailyCollectedScroll} nestedScrollEnabled={true}>
                        {dailyCollectedRows.map((row) => (
                          <View key={row.dateKey} style={styles.dailyCollectedRow}>
                            <Text style={styles.dailyCollectedDate}>{formatPaymentDate(row.dateKey)}</Text>
                            <Text style={styles.dailyCollectedAmount}>{formatCurrency(row.amount)}</Text>
                          </View>
                        ))}
                      </ScrollView>
                    ) : (
                      <Text style={styles.dailyCollectedEmpty}>Chưa có khoản thu nào.</Text>
                    )}
                  </View>
                </>
              )}
            </View>
          )}
        </View>}

        {/* HÀNG THỐNG KÊ & TÍNH NĂNG CHUNG (MỖI NÚT 1 NỬA 50%) */}
        <View style={styles.topControlRowGroup}>
          {/* Nút 1: Thống Kê / Báo Cáo */}


          {/* Nút 2: Tính Năng AI & Thêm Khách/Thịt */}
          <View ref={debtToolsMenuRef} style={{ flex: 1, position: 'relative', zIndex: 1000, elevation: 1000 }}>
            <TouchableOpacity
              style={styles.topControlHalfBtnRight}
              onPress={() => setShowDebtToolsMenu((prev) => !prev)}
              activeOpacity={0.85}
            >
              <Text style={styles.topControlHalfBtnRightText}>
                {isRecording ? '🎙️ Đang ghi...' : '⚡ TÍNH NĂNG ▼'}
              </Text>
            </TouchableOpacity>

            {/* Dropdown Menu chứa tất cả 5 tính năng */}
            {showDebtToolsMenu && (
              <View style={styles.smartDebtDropdownMenu}>
                <TouchableOpacity
                  style={styles.smartDebtMenuItem}
                  onPress={() => {
                    setShowDebtToolsMenu(false);
                    batchDebtModalRef.current?.open();
                  }}
                >
                  <Text style={styles.smartDebtMenuIcon}>⚡</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smartDebtMenuTitle}>Nhập công nợ hàng loạt</Text>
                    <Text style={styles.smartDebtMenuSub}>Nhập công nợ số lượng lớn</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.smartDebtMenuDivider} />

                <TouchableOpacity
                  style={styles.smartDebtMenuItem}
                  onPress={() => {
                    setShowDebtToolsMenu(false);
                    batchPaymentModalRef.current?.open();
                  }}
                >
                  <Text style={styles.smartDebtMenuIcon}>🟢</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smartDebtMenuTitle}>Thu nợ hàng loạt</Text>
                    <Text style={styles.smartDebtMenuSub}>Thu tiền trả nợ từ nhiều khách hàng cùng lúc</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.smartDebtMenuDivider} />

                <TouchableOpacity
                  style={styles.smartDebtMenuItem}
                  onPress={() => {
                    setShowDebtToolsMenu(false);
                    handleScanTicket();
                  }}
                >
                  <Text style={styles.smartDebtMenuIcon}>📷</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smartDebtMenuTitle}>Chụp ảnh tích kê </Text>
                    <Text style={styles.smartDebtMenuSub}>Quét ảnh tích kê để nhập nhanh công nợ</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.smartDebtMenuDivider} />

                <TouchableOpacity
                  style={styles.smartDebtMenuItem}
                  onPress={() => {
                    setShowDebtToolsMenu(false);
                    handleVoicePress();
                  }}
                >
                  <Text style={styles.smartDebtMenuIcon}>🎤</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smartDebtMenuTitle}>
                      {isRecording ? '⏹️ Dừng ghi âm' : 'Nhập công nợ bằng giọng nói'}
                    </Text>
                    <Text style={styles.smartDebtMenuSub}>Phân tích và thêm công nợ bằng giọng nói</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.smartDebtMenuDivider} />

                <TouchableOpacity
                  style={styles.smartDebtMenuItem}
                  onPress={() => {
                    setShowDebtToolsMenu(false);
                    regularCustomersModalRef.current?.open();
                  }}
                >
                  <Text style={styles.smartDebtMenuIcon}>🌟</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smartDebtMenuTitle}>Quản lý khách quen</Text>
                    <Text style={styles.smartDebtMenuSub}>Đối chiếu khách đặt 3 ngày qua để tránh sót đơn</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.smartDebtMenuDivider} />

                <TouchableOpacity
                  style={styles.smartDebtMenuItem}
                  onPress={() => {
                    setShowDebtToolsMenu(false);
                    productModalRef.current?.open();
                  }}
                >
                  <Text style={styles.smartDebtMenuIcon}>🥩</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smartDebtMenuTitle}>Thêm loại thịt mới</Text>
                    <Text style={styles.smartDebtMenuSub}>Cập nhật bảng giá sản phẩm</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.smartDebtMenuDivider} />

                <TouchableOpacity
                  style={styles.smartDebtMenuItem}
                  onPress={() => {
                    setShowDebtToolsMenu(false);
                    recurringDebtModalRef.current?.open();
                  }}
                >
                  <Text style={styles.smartDebtMenuIcon}>🔁</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smartDebtMenuTitle}>Đơn nợ cố định hàng ngày</Text>
                    <Text style={styles.smartDebtMenuSub}>Tự động lên đơn lúc 0:30 mỗi ngày</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.smartDebtMenuDivider} />

                <TouchableOpacity
                  style={styles.smartDebtMenuItem}
                  onPress={() => {
                    setShowDebtToolsMenu(false);
                    profitFeatureIntroModalRef.current?.open(true);
                  }}
                >
                  <Text style={styles.smartDebtMenuIcon}>💡</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smartDebtMenuTitle}>Hướng dẫn tính Lợi Nhuận</Text>
                    <Text style={styles.smartDebtMenuSub}>Xem lại hướng dẫn tính lãi nợ nhanh & thủ công</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.topControlHalfBtnLeft}
            onPress={() => {
              if (auth.user?.workspaceMember) {
                employeeDailyDebtModalRef.current?.open(auth.user?.id);
              } else {
                dailyReportModalRef.current?.open();
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.topControlHalfBtnLeftText}>
              {auth.user?.workspaceMember ? '📋 NỢ TRONG NGÀY' : '📈 THỐNG KÊ NỢ'}
            </Text>
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
          <Text style={styles.listHeader}>👥 DANH SÁCH KHÁCH ({filteredCustomers.length})</Text>
          <TouchableOpacity
            style={styles.addCustomerHeaderBtn}
            onPress={() => modalRef.current?.open()}
            activeOpacity={0.8}
          >
            <Text style={styles.addCustomerHeaderBtnText}>➕ Thêm khách</Text>
          </TouchableOpacity>
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


      {/* MODAL KẾT QUẢ GHI NỢ GIỌNG NÓI (Ẩn) */}
      <ScanTicketModal ref={scanTicketModalRef} onRefresh={handleRefreshAll} />

      {/* MODAL NHẬP NỢ HÀNG LOẠT (Ẩn) */}
      <BatchDebtModal ref={batchDebtModalRef} onRefresh={handleRefreshAll} />

      {/* MODAL THU NỢ HÀNG LOẠT (Ẩn) */}
      <BatchPaymentModal ref={batchPaymentModalRef} onRefresh={handleRefreshAll} />

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
      {/* Modal danh sách ghi nợ trong ngày dành cho nhân viên - render TRƯỚC EditDebtModal để EditDebtModal nằm đè trên khi cùng mở */}
      <EmployeeDailyDebtModal
        ref={employeeDailyDebtModalRef}
        popupModalRef={popupModalRef}
        onRefresh={handleRefreshAll}
        onEditTransaction={(transaction) => {
          setSelectedCustomerId(transaction.customerId);
          editDebtModalRef.current?.open(transaction);
        }}
      />
      <DailyReportModal
        ref={dailyReportModalRef}
        onRefresh={handleRefreshAll}
        onEditTransaction={(transaction) => {
          setSelectedCustomerId(transaction.customerId);
          editDebtModalRef.current?.open(transaction);
        }}
        onEditPayment={(payment) => {
          setSelectedCustomerId(payment.customerId);
          editPaymentModalRef.current?.open(payment);
        }}
      />
      <EditDebtModal
        ref={editDebtModalRef}
        customerId={selectedCustomerId}
        onRefresh={() => {
          handleRefreshAll();
          dailyReportModalRef.current?.refetch();
        }}
      />
      <EditPaymentModal
        ref={editPaymentModalRef}
        onRefresh={() => {
          handleRefreshAll();
          dailyReportModalRef.current?.refetch();
        }}
      />
      <ReturnGoodsModal ref={returnGoodsModalRef} onRefresh={handleRefreshAll} />
      <RecurringDebtModal ref={recurringDebtModalRef} onRefresh={handleRefreshAll} />
      {/* MODAL QUẢN LÝ KHÁCH QUEN (Ẩn) */}
      <RegularCustomersModal
        ref={regularCustomersModalRef}
        onRefresh={handleRefreshAll}
        onOpenDebt={(customer) => {
          setSelectedCustomerId(customer.id);
          debtModalRef.current?.open(customer);
        }}
        onViewHistory={(customer) => {
          setSelectedCustomerId(customer.id);
          customerDebtHistoryModalRef.current?.open(customer);
        }}
      />
      {/* MODAL GIỚI THIỆU TÍNH NĂNG LỢI NHUẬN */}
      <ProfitFeatureIntroModal
        ref={profitFeatureIntroModalRef}
        onOpenProductList={() => productModalRef.current?.open()}
      />
      {/* POPUP THÔNG BÁO DÙNG CHUNG - render CUỐI CÙNG để luôn nằm trên layer cao nhất */}
      <PopupModal ref={popupModalRef} />

      {/* Nút nổi và Bảng nhật ký nhanh của nhân viên (Dành riêng cho Chủ Workspace) */}
      {auth.user?.isWorkspaceOwner && (
        <View style={styles.floatingLogContainer}>
          {showFloatingLogs && (
            <View style={styles.floatingLogPanel}>
              <View style={styles.floatingLogHeader}>
                <Text style={styles.floatingLogTitle}>📋 Nhật ký hôm nay</Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowFloatingLogs(false);
                    memberActionsModalRef.current?.open(auth.user);
                  }}
                  style={styles.floatingLogExpandBtn}
                >
                  <Text style={styles.floatingLogExpandText}>Chi tiết ➔</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.floatingLogList}>
                {loadingLogs ? (
                  <ActivityIndicator size="small" color="#7C3AED" style={{ marginVertical: 15 }} />
                ) : logs.length === 0 ? (
                  <Text style={styles.floatingLogEmpty}>Không có thao tác nào trong ngày.</Text>
                ) : (
                  logs.map((item) => {
                    const badgeColor = getBadgeColor(item.type);
                    return (
                      <View key={item.id} style={[styles.floatingLogItem, { borderLeftColor: getBorderLeftColor(item) }]}>
                        <View style={styles.floatingLogItemHeader}>
                          <Text style={styles.floatingLogActor}>🧑‍💼 {item.actor?.name}</Text>
                          <Text style={styles.floatingLogTime}>{formatTime(item.createdAt)}</Text>
                        </View>
                        {renderActionTitleFloating(item)}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}

          <TouchableOpacity
            style={styles.floatingLogButton}
            onPress={handleToggleFloatingLogs}
            activeOpacity={0.8}
          >
            <Text style={styles.floatingLogButtonText}>
              {showFloatingLogs ? '✕ Thu gọn' : '📜 Nhật ký nhân viên'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal xem nhật ký chi tiết */}
      <WorkspaceMemberActionsModal ref={memberActionsModalRef} />
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
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.card,
  },
  summaryCardTopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  summaryMonthBadge: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryMonthBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  summaryExpandHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  summaryColumnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryMicroBox: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  summaryMicroBoxDebt: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  summaryMicroBoxRevenue: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  summaryMicroBoxProfit: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  summaryMicroBoxLabelDebt: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#991B1B',
    marginBottom: 2,
  },
  summaryMicroBoxValueDebt: {
    fontSize: 13,
    fontWeight: '900',
    color: '#DC2626',
    textAlign: 'center',
  },
  summaryMicroBoxLabelRevenue: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 2,
  },
  summaryMicroBoxValueRevenue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#16A34A',
    textAlign: 'center',
  },
  summaryMicroBoxLabelProfit: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0369A1',
    marginBottom: 2,
  },
  summaryMicroBoxValueProfit: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0284C7',
    textAlign: 'center',
  },
  debtSummaryDetail: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  monthTotalSalesBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthTotalSalesLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  monthTotalSalesValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A', // Màu Slate tối
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
    marginTop: 10,
  },
  monthPickerLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 6,
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
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  dailyCollectedScroll: {
    maxHeight: 150, // Giới hạn chiều cao để xuất hiện thanh cuộn khi có nhiều dòng
  },
  dailyCollectedTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 6,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  listHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  addCustomerHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981', // Màu xanh lá tươi chuẩn thương hiệu
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    ...SHADOWS.card,
  },
  addCustomerHeaderBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
  cardHeaderTouchable: {
    width: '100%',
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
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
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
  // Nút Trả hàng cho khách hàng
  returnGoodsBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFFBEB', // Nền hổ phách nhạt
    borderWidth: 1,
    borderColor: '#FDE68A',     // Viền hổ phách
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  returnGoodsBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#D97706', // Chữ màu hổ phách/cam
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
    backgroundColor: '#D97706', // Màu cam vàng thương hiệu nợ xấu
    height: 40,
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
  // Nút danh sách ghi nợ trong ngày (chỉ dùng cho tài khoản thành viên)
  employeeDailyDebtButton: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1.5,
    marginTop: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  employeeDailyDebtButtonText: {
    color: '#15803D',
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 35,
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
    marginBottom: 10,
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
  workspaceButtonMini: {
    width: 98,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F3FF', // Tông màu tím nhạt
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  workspaceTextMini: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#7C3AED', // Màu chữ tím đậm
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
    backgroundColor: '#9F1239', // Đỏ Bordeaux
    height: 40,
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
  // ── CSS cho Quản lý Cửa hàng (Store) ───────────────────────
  menuCardActiveStore: {
    borderColor: '#DDD6FE', // Viền tím nhạt
    backgroundColor: '#F5F3FF',
  },
  menuCardIconBgStore: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EDE9FE', // Tím nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuCardTitleStore: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#5B21B6', // Tím đậm
    marginBottom: 4,
  },
  menuCardDescStore: {
    fontSize: 12,
    color: '#7C3AED',
    lineHeight: 18,
  },
  // ── CSS cho Quản lý Cửa hàng Tính giờ (Shop) ───────────────
  menuCardActiveShop: {
    borderColor: '#99F6E4', // Viền xanh teal nhạt
    backgroundColor: '#F0FDFA',
  },
  menuCardIconBgShop: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#CCFBF1', // Xanh teal nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuCardTitleShop: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F766E', // Xanh teal đậm
    marginBottom: 4,
  },
  menuCardDescShop: {
    fontSize: 12,
    color: '#0D9488',
    lineHeight: 18,
  },
  // ── CSS cho Quản lý Kho (Inventory) ────────────────────────
  menuCardActiveInventory: {
    borderColor: '#BFDBFE', // Viền xanh nhạt
    backgroundColor: '#EFF6FF',
  },
  menuCardIconBgInventory: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#DBEAFE', // Xanh nhạt
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuCardTitleInventory: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E40AF', // Xanh dương đậm
    marginBottom: 4,
  },
  menuCardDescInventory: {
    fontSize: 12,
    color: '#2563EB',
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
    backgroundColor: '#0369A1', // Xanh dương đậm
    height: 40,
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
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
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
    paddingHorizontal: 6,
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
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    textAlign: 'center',
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
  employeeOptionsDropdown: {
    position: 'absolute',
    bottom: 38,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: 150,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  employeeOptionsDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: '100%',
  },
  employeeOptionsDropdownText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  employeeOptionsDropdownDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  floatingLogContainer: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    zIndex: 9999,
    alignItems: 'flex-end',
  },
  floatingLogButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  floatingLogButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  floatingLogPanel: {
    width: 320,
    maxHeight: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  floatingLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
    marginBottom: 8,
  },
  floatingLogTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  floatingLogExpandBtn: {
    backgroundColor: '#FAF5FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  floatingLogExpandText: {
    fontSize: 11,
    color: '#7C3AED',
    fontWeight: 'bold',
  },
  floatingLogList: {
    flex: 1,
  },
  floatingLogEmpty: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  floatingLogItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  floatingLogItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  floatingLogActor: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#334155',
  },
  floatingLogTime: {
    fontSize: 10,
    color: '#94A3B8',
  },
  floatingLogText: {
    fontSize: 12,
    color: '#0F172A',
    lineHeight: 16,
  },
  /* STYLES HÀNG ĐIỀU KHUYỂN 2 NÚT BAN ĐẦU (50-50) */
  topControlRowGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 10,
    position: 'relative',
    zIndex: 1000,
    elevation: 1000,
  },
  topControlHalfBtnLeft: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  topControlHalfBtnLeftText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 0.2,
  },
  topControlHalfBtnRight: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  topControlHalfBtnRightText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  smartDebtDropdownMenu: {
    position: 'absolute',
    top: '105%',
    left: 0,
    width: 280,
    minWidth: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    ...SHADOWS.large,
    boxShadow: '0px 10px 30px rgba(15, 23, 42, 0.25)',
    zIndex: 99999,
    elevation: 99999,
  },
  smartDebtMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    cursor: 'pointer',
  },
  smartDebtMenuIcon: {
    fontSize: 18,
  },
  smartDebtMenuTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  smartDebtMenuSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  smartDebtMenuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  compactConfigBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  compactConfigBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
});
