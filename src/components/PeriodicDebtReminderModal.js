// meat-management-fe/src/components/PeriodicDebtReminderModal.js
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import AddPeriodicCustomerModal from './AddPeriodicCustomerModal';
import { COLORS, FONTS, SHADOWS } from '../theme';
import { api } from '../api/client';
import { showGlobalToast } from '../store/toastStore';
import { drawDebtImageCanvas } from '../utils/debtImageDrawer';
import {
  downloadOrShareMultipleImages,
  downloadOrShareImage,
  isMobileDevice,
} from '../utils/imageShareHelper';

// Danh sách định danh 22 nhà hàng mặc định ban đầu nếu chưa có cấu hình trong DB
export const TARGET_RESTAURANTS_CONFIG = [
  // ─── 1. CHUỖI TRƯỜNG HOÀNG (11 NHÀ HÀNG - XUẤT 11 ẢNH RIÊNG) ───
  {
    key: 'truong_hoang_373_kim_ma',
    name: '373 kim mã',
    groupName: 'Chuỗi Trường Hoàng (11 quán)',
    matchTerms: ['373 kim mã', 'kim mã'],
    expectedId: '5e60ad93-e7eb-4fa1-9c6f-c0c116d17101',
  },
  {
    key: 'truong_hoang_126_nkt',
    name: '126 Nguyễn khánh toàn',
    groupName: 'Chuỗi Trường Hoàng (11 quán)',
    matchTerms: ['126 nguyễn khánh toàn', 'nguyễn khánh toàn'],
    expectedId: 'b7c3120d-7e33-4546-a8be-5ef7c29df069',
  },
  {
    key: 'truong_hoang_nguyen_khuyen',
    name: 'Trường hoàng(nguyễn khuyến)',
    groupName: 'Chuỗi Trường Hoàng (11 quán)',
    matchTerms: ['trường hoàng(nguyễn khuyến)', 'trường hoàng', 'nguyễn khuyến 1'],
    expectedId: 'fd1b4658-be2e-463d-af97-ff735e03839b',
  },
  {
    key: 'truong_hoang_an_khanh',
    name: 'Cuốn an khánh',
    groupName: 'Chuỗi Trường Hoàng (11 quán)',
    matchTerms: ['cuốn an khánh', 'an khánh'],
    expectedId: '4877fb04-3cb1-4b2e-9ac7-25e0c7384086',
  },
  {
    key: 'truong_hoang_giang_vo',
    name: 'Giảng võ',
    groupName: 'Chuỗi Trường Hoàng (11 quán)',
    matchTerms: ['giảng võ'],
    expectedId: '1fd93d90-aa1d-49c5-8c4c-c65c17cd7345',
  },
  {
    key: 'truong_hoang_lang_ha',
    name: 'Cuốn láng hạ',
    groupName: 'Chuỗi Trường Hoàng (11 quán)',
    matchTerms: ['cuốn láng hạ'],
    expectedId: '1752a4f4-6803-4520-8416-6a9854ffc395',
  },
  {
    key: 'truong_hoang_52_ttt',
    name: '52  trần thái tông',
    groupName: 'Chuỗi Trường Hoàng (11 quán)',
    matchTerms: ['52 trần thái tông', '52  trần thái tông'],
    expectedId: 'ae16c050-d8a6-4c20-bdae-d046217e53e2',
  },
  {
    key: 'truong_hoang_xa_dan',
    name: '236 Xã đàn',
    groupName: 'Chuỗi Trường Hoàng (11 quán)',
    matchTerms: ['236 xã đàn', 'xã đàn'],
    expectedId: '99a81a9d-9f7e-4cd0-9827-dfb6e1d948de',
  },
  {
    key: 'truong_hoang_khuong_dinh',
    name: '268 Khương đình',
    groupName: 'Chuỗi Trường Hoàng (11 quán)',
    matchTerms: ['268 khương đình', 'khương đình'],
    expectedId: 'caf315e5-2bce-4c2f-8bdf-0ce3f50d17d6',
  },
  {
    key: 'truong_hoang_ham_nghi',
    name: 'Hàm nghi',
    groupName: 'Chuỗi Trường Hoàng (11 quán)',
    matchTerms: ['hàm nghi'],
    expectedId: 'cf682149-6cf2-468b-b86d-460438b1839c',
  },
  {
    key: 'truong_hoang_47_ttt',
    name: '47Trần thái tông',
    groupName: 'Chuỗi Trường Hoàng (11 quán)',
    matchTerms: ['47trần thái tông', '47 trần thái tông'],
    expectedId: '115f69b2-1d28-43b1-8671-fd193176bee0',
  },

  // ─── 2. BẾP HÀNG XÓM (3 NHÀ HÀNG) ───
  {
    key: 'bep_hang_xom_1',
    name: 'Bếp hàng xóm 1(b1)',
    groupName: 'Bếp Hàng Xóm (3 cơ sở)',
    matchTerms: ['bếp hàng xóm 1', 'hàng xóm 1', 'bếp hàng xóm 1(b1)'],
    expectedId: '6db0a7b2-cfff-4865-8972-ac7ce19394e7',
  },
  {
    key: 'bep_hang_xom_2',
    name: 'Bếp hàng xóm 2(b2)',
    groupName: 'Bếp Hàng Xóm (3 cơ sở)',
    matchTerms: ['bếp hàng xóm 2', 'hàng xóm 2', 'bếp hàng xóm 2(b2)'],
    expectedId: '09b01cef-9ed8-4145-87c7-2936b8640248',
  },
  {
    key: 'bep_hang_xom_3',
    name: 'Bếp hàng xóm 3(b3)',
    groupName: 'Bếp Hàng Xóm (3 cơ sở)',
    matchTerms: ['bếp hàng xóm 3', 'hàng xóm 3', 'bếp hàng xóm 3(b3)'],
    expectedId: 'f0f8946f-2830-4e19-beaf-271e531516f5',
  },

  // ─── 3. CÁC NHÀ HÀNG RIÊNG LẺ (8 NHÀ HÀNG) ───
  {
    key: 'bep_3_mien',
    name: 'Bếp 3 miền kim liên',
    groupName: 'Các nhà hàng riêng lẻ',
    matchTerms: ['bếp 3 miền', 'bếp ba miền', '3 miền kim liên'],
    expectedId: '873add09-9a59-4e08-8822-42f253996892',
  },
  {
    key: 'industree_794_lang_ha',
    name: 'the industree(794 đường láng)',
    groupName: 'Các nhà hàng riêng lẻ',
    matchTerms: ['industree', '794 láng hạ', '794 đường láng', 'the industree'],
    expectedId: '841181dd-a432-427d-b9df-1c03502bd00c',
  },
  {
    key: 'trung_kinh',
    name: 'Bếp trung kính (zalo loantt)',
    groupName: 'Các nhà hàng riêng lẻ',
    matchTerms: ['trung kính', 'bếp trung kính'],
    expectedId: 'ce8c6fb5-aa02-4ea8-b26b-adf602e6b4d5',
  },
  {
    key: 'vuon_xanh',
    name: 'Nhà hàng vườn xanh (b4)',
    groupName: 'Các nhà hàng riêng lẻ',
    matchTerms: ['vườn xanh', 'nhà hàng vườn xanh', 'bếp vườn xanh'],
    expectedId: 'b085454e-6a0b-4f70-9e0f-f2d2be66feff',
  },
  {
    key: 'ngoc_lam',
    name: 'Ngọc lâm',
    groupName: 'Các nhà hàng riêng lẻ',
    matchTerms: ['ngọc lâm', 'bún riêu ha ngọc lâm'],
    expectedId: '011b81ca-804a-46ba-9940-e197e83806a5',
  },
  {
    key: 'lk_lau_oc',
    name: 'Lk(lẩu ốc)',
    groupName: 'Các nhà hàng riêng lẻ',
    matchTerms: ['lk', 'lẩu ốc', 'lk(lẩu ốc)'],
    expectedId: '3bfedd41-e3c0-4efe-a056-a3fe40538874',
  },
  {
    key: 'chi_thuy_nga',
    name: 'Chị Thúy Nga',
    groupName: 'Các nhà hàng riêng lẻ',
    matchTerms: ['chị thúy nga', 'thúy nga'],
    expectedId: 'c0e31e76-e33c-491d-984a-80ad46b50672',
  },
  {
    key: 'hong_hanh_hqv',
    name: 'Hồng hạnh hqv',
    groupName: 'Các nhà hàng riêng lẻ',
    matchTerms: ['hồng hạnh', 'hồng hạnh hqv'],
    expectedId: '441f3eba-dbdd-41f6-9a66-c0377967e61b',
  },
];

// Helper tính khoảng ngày theo kỳ
export const getPeriodicRange = (periodType) => {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-indexed (0 = Tháng 1)

  if (periodType === 'first_half') {
    // Kỳ 01 -> 15 của tháng này (áp dụng vào ngày 15)
    return {
      type: 'first_half',
      title: `Kỳ 01 - 15/${pad(m + 1)}/${y}`,
      subtitle: `Công nợ từ ngày 01 đến 15 tháng ${m + 1}`,
      fromDate: `01/${pad(m + 1)}/${y}`,
      toDate: `15/${pad(m + 1)}/${y}`,
    };
  }

  if (periodType === 'all') {
    // Toàn bộ danh sách khách nhắc nợ
    return {
      type: 'all',
      title: `Tất cả khách nhắc nợ`,
      subtitle: `Danh sách toàn bộ các quán được cài đặt nhắc nợ định kỳ`,
      fromDate: `01/${pad(m + 1)}/${y}`,
      toDate: `${pad(today.getDate())}/${pad(m + 1)}/${y}`,
    };
  }

  // Mặc định: Kỳ toàn bộ tháng trước (áp dụng vào ngày 1 hàng tháng)
  const firstDayPrevMonth = new Date(y, m - 1, 1);
  const lastDayPrevMonth = new Date(y, m, 0);

  const prevMonthNum = firstDayPrevMonth.getMonth() + 1;
  const prevYearNum = firstDayPrevMonth.getFullYear();

  return {
    type: 'last_month',
    title: `Tháng ${pad(prevMonthNum)}/${prevYearNum}`,
    subtitle: `Công nợ trọn vẹn cả tháng ${prevMonthNum}/${prevYearNum}`,
    fromDate: `01/${pad(prevMonthNum)}/${prevYearNum}`,
    toDate: `${pad(lastDayPrevMonth.getDate())}/${pad(prevMonthNum)}/${prevYearNum}`,
  };
};

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
};

const PeriodicDebtReminderModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, currentName: '' });

  // Ref mở modal thêm khách hàng mới
  const addCustomerModalRef = useRef(null);

  // Quản lý kỳ gửi công nợ (last_month: Tháng trước / first_half: Ngày 1->15 / all: Tất cả)
  const [periodType, setPeriodType] = useState('last_month');
  const currentRange = useMemo(() => getPeriodicRange(periodType), [periodType]);

  // Danh sách các cấu hình nhắc nợ từ Backend và danh sách khách hàng
  const [rawConfigs, setRawConfigs] = useState([]);
  const [matchedItems, setMatchedItems] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  // Tải danh sách khách hàng được cấu hình nhắc nợ từ Database
  const loadTargetCustomers = async () => {
    try {
      setLoading(true);
      // Gọi API lấy cấu hình đã lưu trong cơ sở dữ liệu
      const res = await api.get('/periodic-reminders');
      const configs = res.data?.data || [];
      setRawConfigs(configs);

      let list = [];

      if (configs.length > 0) {
        list = configs.map((cfg) => {
          const cust = cfg.customer || {};
          return {
            configId: cfg.id,
            key: cfg.customerId || cfg.id,
            id: cfg.customerId,
            name: cust.name || 'Khách chưa đặt tên',
            phone: cust.phone || '',
            groupName: cfg.groupName || 'Các nhà hàng riêng lẻ',
            reminderDays: cfg.reminderDays || '1,15',
            notes: cfg.notes,
            currentDebt: Number(cust.currentDebt) || 0,
            customer: cust,
            monthPurchase: 0,
            monthPaid: 0,
            monthDebt: 0,
            loaded: false,
          };
        });
      } else {
        // Fallback tự động tìm trong danh bạ nếu DB trống
        const custRes = await api.get('/customers');
        const allCusts = custRes.data?.data || [];

        for (const cfg of TARGET_RESTAURANTS_CONFIG) {
          let cust = allCusts.find((c) => c.id === cfg.expectedId);
          if (!cust) {
            const lowerTerms = cfg.matchTerms.map((t) => t.toLowerCase());
            cust = allCusts.find((c) => {
              const cName = (c.name || '').toLowerCase();
              return lowerTerms.some((term) => cName.includes(term));
            });
          }

          if (cust) {
            list.push({
              configId: null,
              key: cfg.key,
              id: cust.id,
              name: cust.name,
              phone: cust.phone,
              groupName: cfg.groupName,
              reminderDays: '1,15',
              currentDebt: Number(cust.currentDebt) || 0,
              customer: cust,
              monthPurchase: 0,
              monthPaid: 0,
              monthDebt: 0,
              loaded: false,
            });
          }
        }
      }

      setMatchedItems(list);
    } catch (err) {
      console.warn('Lỗi tải danh bạ khách hàng cho lịch gửi công nợ:', err);
    } finally {
      setLoading(false);
    }
  };

  // Lọc danh sách hiển thị theo kỳ đối soát (ngày 1, ngày 15 hoặc tất cả)
  const displayedItems = useMemo(() => {
    if (periodType === 'all') return matchedItems;

    if (periodType === 'last_month') {
      // Khách có áp dụng ngày 1
      return matchedItems.filter((item) => {
        const days = (item.reminderDays || '1,15')
          .split(',')
          .map((d) => d.trim().replace(/^0+/, ''));
        return days.includes('1');
      });
    }

    if (periodType === 'first_half') {
      // Khách có áp dụng ngày 15
      return matchedItems.filter((item) => {
        const days = (item.reminderDays || '1,15')
          .split(',')
          .map((d) => d.trim());
        return days.includes('15');
      });
    }

    return matchedItems;
  }, [matchedItems, periodType]);

  // Cập nhật selectedKeys tự động khi danh sách displayedItems thay đổi
  useEffect(() => {
    setSelectedKeys(new Set(displayedItems.map((item) => item.key)));
  }, [displayedItems]);

  useImperativeHandle(ref, () => ({
    open: (opts = {}) => {
      // Xác định kỳ tự động dựa trên ngày hiện tại
      const today = new Date();
      const day = today.getDate();
      let initPeriod = 'last_month';
      if (day >= 15 && day <= 20) {
        initPeriod = 'first_half';
      }
      if (opts.periodType) {
        initPeriod = opts.periodType;
      }
      setPeriodType(initPeriod);
      setVisible(true);
      loadTargetCustomers();
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Đổi kỳ đối soát (Tháng trước <-> Ngày 1-15 <-> Tất cả)
  const handleChangePeriod = (newType) => {
    if (newType === periodType) return;
    setPeriodType(newType);
  };

  // Chọn / bỏ chọn 1 nhà hàng
  const handleToggleItem = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Chọn / bỏ chọn tất cả các quán đang hiển thị
  const handleToggleSelectAll = () => {
    if (selectedKeys.size === displayedItems.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(displayedItems.map((item) => item.key)));
    }
  };

  // Xóa khách hàng khỏi danh sách nhắc nợ định kỳ
  const handleDeleteCustomer = async (item) => {
    if (!item.configId) {
      setMatchedItems((prev) => prev.filter((i) => i.key !== item.key));
      showGlobalToast(`Đã gỡ tạm ${item.name}`, 'info');
      return;
    }

    try {
      const res = await api.delete(`/periodic-reminders/${item.configId}`);
      if (res.data?.success) {
        showGlobalToast(`Đã gỡ ${item.name} khỏi danh sách nhắc nợ!`, 'success');
        loadTargetCustomers();
      } else {
        showGlobalToast(res.data?.message || 'Không thể xóa cấu hình.', 'error');
      }
    } catch (err) {
      console.error('Lỗi khi xóa cấu hình nhắc nợ:', err);
      showGlobalToast('Có lỗi xảy ra khi xóa khách hàng.', 'error');
    }
  };

  // ─── HÀNH ĐỘNG 1: XUẤT VÀ CHUYỂN TIẾP ZALO TOÀN BỘ CÁC QUÁN ĐÃ CHỌN ───
  const handleExportAllToZalo = async () => {
    const targets = displayedItems.filter((item) => selectedKeys.has(item.key));
    if (targets.length === 0) {
      showGlobalToast('Vui lòng chọn ít nhất một nhà hàng để gửi công nợ.', 'warning');
      return;
    }

    setExporting(true);
    setExportProgress({ current: 0, total: targets.length, currentName: targets[0]?.name || '' });

    const imagesToProcess = [];
    const fromDate = currentRange.fromDate;
    const toDate = currentRange.toDate;

    try {
      for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        setExportProgress({ current: i + 1, total: targets.length, currentName: item.name });

        try {
          // Lấy dữ liệu mua và thanh toán của khách hàng
          const [transRes, payRes] = await Promise.all([
            api.get(`/transactions?customerId=${item.id}`).catch(() => ({ data: { data: [] } })),
            api.get(`/payments?customerId=${item.id}`).catch(() => ({ data: { data: [] } })),
          ]);

          const transList = transRes.data?.data || [];
          const payList = payRes.data?.data || [];

          // Vẽ ảnh canvas công nợ chuẩn Retina theo đúng khoảng ngày
          const drawResult = await drawDebtImageCanvas({
            transList,
            payList,
            cust: item.customer,
            fromDate,
            toDate,
          });

          if (drawResult?.imageUri) {
            const cleanCustName = (item.name || 'Khach').replace(/[^a-zA-Z0-9À-ỹ]/g, '_');
            const cleanFrom = fromDate.replace(/\//g, '-');
            const cleanTo = toDate.replace(/\//g, '-');
            const fileName = `Cong_no_${cleanCustName}_${cleanFrom}_${cleanTo}.png`;

            imagesToProcess.push({
              imageUri: drawResult.imageUri,
              fileName,
              customerName: item.name,
              phone: item.phone,
            });
          }
        } catch (itemErr) {
          console.error(`Lỗi tạo ảnh công nợ cho ${item.name}:`, itemErr);
        }
      }

      if (imagesToProcess.length > 0) {
        // Thực hiện quy chuẩn:
        // - Web PC: Tự động tải tất cả các ảnh về máy tính
        // - Web Mobile: Chuyển tiếp tất cả ảnh vào Zalo
        await downloadOrShareMultipleImages({
          items: imagesToProcess,
          title: `Công nợ ${currentRange.title}`,
          text: `Gửi bảng kê công nợ định kỳ (${currentRange.title}) cho ${imagesToProcess.length} nhà hàng`,
        });

        // Ghi nhận đã xử lý kỳ này vào localStorage để không nhắc lại trong ngày
        if (typeof window !== 'undefined') {
          const today = new Date();
          const todayKey = `${today.getFullYear()}_${today.getMonth() + 1}_${today.getDate()}`;
          localStorage.setItem(`periodic_debt_reminder_${periodType}_${todayKey}`, 'completed');
        }

        showGlobalToast(`Đã xuất thành công ${imagesToProcess.length} ảnh công nợ!`, 'success');
      } else {
        showGlobalToast('Không có dữ liệu công nợ nào trong kỳ đối soát này.', 'warning');
      }
    } catch (globalErr) {
      console.error('Lỗi khi xuất ảnh công nợ định kỳ:', globalErr);
      showGlobalToast('Có lỗi xảy ra khi tạo ảnh công nợ định kỳ.', 'error');
    } finally {
      setExporting(false);
    }
  };

  // ─── HÀNH ĐỘNG: XUẤT VÀ TẢI/CHUYỂN TIẾP TOÀN BỘ ẢNH CỦA 1 NHÓM (VÍ DỤ CHUỖI 11 QUÁN TRƯỜNG HOÀNG) ───
  const handleExportGroupImages = async (groupName, targetItems) => {
    if (!targetItems || targetItems.length === 0) {
      showGlobalToast('Không có quán nào để xuất ảnh.', 'warning');
      return;
    }

    setExporting(true);
    setExportProgress({ current: 0, total: targetItems.length, currentName: targetItems[0]?.name || '' });

    const imagesToProcess = [];
    const fromDate = currentRange.fromDate;
    const toDate = currentRange.toDate;

    try {
      for (let i = 0; i < targetItems.length; i++) {
        const item = targetItems[i];
        setExportProgress({ current: i + 1, total: targetItems.length, currentName: item.name });

        try {
          const [transRes, payRes] = await Promise.all([
            api.get(`/transactions?customerId=${item.id}`).catch(() => ({ data: { data: [] } })),
            api.get(`/payments?customerId=${item.id}`).catch(() => ({ data: { data: [] } })),
          ]);

          const transList = transRes.data?.data || [];
          const payList = payRes.data?.data || [];

          const drawResult = await drawDebtImageCanvas({
            transList,
            payList,
            cust: item.customer,
            fromDate,
            toDate,
          });

          if (drawResult?.imageUri) {
            const cleanCustName = (item.name || 'Khach').replace(/[^a-zA-Z0-9À-ỹ]/g, '_');
            const cleanFrom = fromDate.replace(/\//g, '-');
            const cleanTo = toDate.replace(/\//g, '-');
            const fileName = `Cong_no_${cleanCustName}_${cleanFrom}_${cleanTo}.png`;

            imagesToProcess.push({
              imageUri: drawResult.imageUri,
              fileName,
              customerName: item.name,
              phone: item.phone,
            });
          }
        } catch (itemErr) {
          console.error(`Lỗi tạo ảnh công nợ cho ${item.name}:`, itemErr);
        }
      }

      if (imagesToProcess.length > 0) {
        await downloadOrShareMultipleImages({
          items: imagesToProcess,
          title: `Công nợ ${groupName} (${currentRange.title})`,
          text: `Bảng kê công nợ định kỳ (${currentRange.title}) cho ${groupName} (${imagesToProcess.length} quán)`,
        });

        const actionText = isMobileDevice() ? 'chuyển tiếp Zalo' : 'tải về máy tính';
        showGlobalToast(`Đã ${actionText} thành công ${imagesToProcess.length} ảnh của ${groupName}!`, 'success');
      } else {
        showGlobalToast(`Không thể tạo ảnh công nợ cho nhóm ${groupName}.`, 'warning');
      }
    } catch (err) {
      console.error(`Lỗi khi xuất ảnh nhóm ${groupName}:`, err);
      showGlobalToast(`Có lỗi xảy ra khi xuất ảnh nhóm ${groupName}.`, 'error');
    } finally {
      setExporting(false);
    }
  };

  // ─── HÀNH ĐỘNG 2: XUẤT VÀ CHUYỂN TIẾP ZALO RIÊNG CHO 1 NHÀ HÀNG ───
  const handleExportSingleToZalo = async (item) => {
    try {
      showGlobalToast(`Đang tạo bảng kê công nợ ${item.name}...`, 'info');
      const fromDate = currentRange.fromDate;
      const toDate = currentRange.toDate;

      const [transRes, payRes] = await Promise.all([
        api.get(`/transactions?customerId=${item.id}`).catch(() => ({ data: { data: [] } })),
        api.get(`/payments?customerId=${item.id}`).catch(() => ({ data: { data: [] } })),
      ]);

      const transList = transRes.data?.data || [];
      const payList = payRes.data?.data || [];

      const drawResult = await drawDebtImageCanvas({
        transList,
        payList,
        cust: item.customer,
        fromDate,
        toDate,
      });

      if (!drawResult?.imageUri) {
        showGlobalToast(`Không thể tạo ảnh công nợ cho ${item.name}.`, 'warning');
        return;
      }

      const cleanCustName = (item.name || 'Khach').replace(/[^a-zA-Z0-9À-ỹ]/g, '_');
      const cleanFrom = fromDate.replace(/\//g, '-');
      const cleanTo = toDate.replace(/\//g, '-');
      const fileName = `Cong_no_${cleanCustName}_${cleanFrom}_${cleanTo}.png`;

      await downloadOrShareImage({
        imageUri: drawResult.imageUri,
        fileName,
        title: `Công nợ ${item.name} (${currentRange.title})`,
        text: `Bảng kê công nợ ${item.name} (${currentRange.title})`,
        phone: item.phone,
        customerName: item.name,
      });
    } catch (err) {
      console.error(`Lỗi xuất riêng cho ${item.name}:`, err);
      showGlobalToast(`Lỗi xuất công nợ cho ${item.name}`, 'error');
    }
  };

  // Bỏ qua / Đóng thông báo hôm nay
  const handleDismissToday = () => {
    if (typeof window !== 'undefined') {
      const today = new Date();
      const todayKey = `${today.getFullYear()}_${today.getMonth() + 1}_${today.getDate()}`;
      localStorage.setItem(`periodic_debt_reminder_${periodType}_${todayKey}`, 'dismissed');
    }
    setVisible(false);
  };

  // Phân nhóm hiển thị các nhà hàng theo displayedItems
  const groupedItems = useMemo(() => {
    const groups = {};
    for (const item of displayedItems) {
      const gName = item.groupName || 'Các nhà hàng riêng lẻ';
      if (!groups[gName]) {
        groups[gName] = [];
      }
      groups[gName].push(item);
    }
    return groups;
  }, [displayedItems]);

  const isAllSelected = selectedKeys.size === displayedItems.length && displayedItems.length > 0;

  return (
    <>
      <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* HEADER MODAL TINH GỌN */}
        <View style={styles.modalHeaderRow}>
          <View style={styles.modalHeaderLeft}>
            <Text style={styles.headerEmoji}>📅</Text>
            <View style={styles.modalHeaderTitleCol}>
              <Text style={styles.modalTitle}>LỊCH GỬI CÔNG NỢ ĐỊNH KỲ</Text>
              <Text style={styles.modalSubTitle}>
                Tự động gửi công nợ định kỳ theo lịch từng khách qua Zalo
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.closeHeaderBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeHeaderBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* BODY CUỘN */}
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollBody}>
          {/* THANH CHỌN KỲ (SEGMENTED CONTROL HIỆN ĐẠI & GỌN NHẸ) */}
          <View style={styles.periodSegmentWrapper}>
            <View style={styles.periodSegmentBar}>
              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  periodType === 'last_month' && styles.segmentBtnActive,
                ]}
                onPress={() => handleChangePeriod('last_month')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentBtnText,
                    periodType === 'last_month' && styles.segmentBtnTextActive,
                  ]}
                >
                  📅 Ngày 1
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  periodType === 'first_half' && styles.segmentBtnActive,
                ]}
                onPress={() => handleChangePeriod('first_half')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentBtnText,
                    periodType === 'first_half' && styles.segmentBtnTextActive,
                  ]}
                >
                  📅 Ngày 15
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  periodType === 'all' && styles.segmentBtnActive,
                ]}
                onPress={() => handleChangePeriod('all')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentBtnText,
                    periodType === 'all' && styles.segmentBtnTextActive,
                  ]}
                >
                  📋 Tất cả ({matchedItems.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Dòng khoảng ngày thanh thoát 1 dòng */}
            <View style={styles.rangeInfoRow}>
              <Text style={styles.rangeInfoTitle}>{currentRange.title}</Text>
              <Text style={styles.rangeInfoDates}>
                {currentRange.fromDate} ➔ {currentRange.toDate}
              </Text>
            </View>
          </View>

          {/* THANH THAO TÁC NHANH: CHỌN TẤT CẢ & NÚT THÊM KHÁCH MỎNG NHẸ */}
          <View style={styles.selectionBarRow}>
            <TouchableOpacity
              style={styles.selectAllBtn}
              onPress={handleToggleSelectAll}
              activeOpacity={0.7}
            >
              <Text style={styles.checkboxIcon}>{isAllSelected ? '☑️' : '◻️'}</Text>
              <Text style={styles.selectAllBtnText}>
                {isAllSelected ? 'Bỏ chọn' : 'Chọn tất cả'} ({selectedKeys.size}/{displayedItems.length})
              </Text>
            </TouchableOpacity>

            {/* Nút thêm khách dạng pill nhỏ gọn */}
            <TouchableOpacity
              style={styles.addCustomerPillBtn}
              onPress={() => addCustomerModalRef.current?.open()}
              activeOpacity={0.75}
            >
              <Text style={styles.addCustomerPillBtnText}>+ Thêm khách</Text>
            </TouchableOpacity>
          </View>

          {/* TIẾN TRÌNH XUẤT ẢNH NẾU ĐANG CHẠY */}
          {exporting && (
            <View style={styles.exportProgressCard}>
              <ActivityIndicator size="small" color="#D97706" />
              <View style={styles.progressCol}>
                <Text style={styles.progressTitle}>
                  Đang tạo ảnh ({exportProgress.current}/{exportProgress.total})...
                </Text>
                <Text style={styles.progressSub} numberOfLines={1}>
                  {exportProgress.currentName}
                </Text>
              </View>
            </View>
          )}

          {/* DANH SÁCH NHÀ HÀNG THEO CÁC NHÓM */}
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#DC2626" />
              <Text style={styles.loadingText}>Đang tải danh sách...</Text>
            </View>
          ) : displayedItems.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>Chưa có quán nào được cấu hình cho kỳ này</Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => addCustomerModalRef.current?.open()}
                activeOpacity={0.75}
              >
                <Text style={styles.emptyAddBtnText}>+ Thêm khách ngay</Text>
              </TouchableOpacity>
            </View>
          ) : (
            Object.entries(groupedItems).map(([gName, items]) => {
              const selectedInGroup = items.filter((item) => selectedKeys.has(item.key));
              const targetItems = selectedInGroup.length > 0 ? selectedInGroup : items;

              return (
                <View key={gName} style={styles.groupSectionCard}>
                  <View style={styles.groupSectionHeader}>
                    <View style={styles.groupHeaderLeftCol}>
                      <Text style={styles.groupSectionTitle}>
                        {gName.includes('Trường Hoàng') ? '🏢 ' : gName.includes('Hàng Xóm') ? '🏘️ ' : '🍽️ '}
                        {gName}
                        <Text style={styles.groupCountText}> ({items.length})</Text>
                      </Text>
                    </View>

                    {/* Nút Tải nhóm nhỏ gọn thanh lịch */}
                    <TouchableOpacity
                      style={[
                        styles.groupBatchActionBtn,
                        exporting && styles.groupBatchActionBtnDisabled,
                      ]}
                      onPress={() => handleExportGroupImages(gName, targetItems)}
                      activeOpacity={0.75}
                      disabled={exporting}
                    >
                      <Text style={styles.groupBatchActionBtnText}>
                        {isMobileDevice()
                          ? `💬 Zalo nhóm (${targetItems.length})`
                          : `💾 Tải nhóm (${targetItems.length})`}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {items.map((item, idx) => {
                    const isChecked = selectedKeys.has(item.key);
                    return (
                      <View
                        key={item.key}
                        style={[
                          styles.customerRow,
                          idx % 2 === 1 && styles.customerRowAlt,
                          isChecked && styles.customerRowSelected,
                        ]}
                      >
                        <TouchableOpacity
                          style={styles.customerRowLeft}
                          onPress={() => handleToggleItem(item.key)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.customerCheckbox}>{isChecked ? '☑️' : '◻️'}</Text>
                          <View style={styles.customerInfoCol}>
                            <Text style={styles.customerNameText} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.customerReminderSub}>
                              Lịch: Ngày {item.reminderDays || '1, 15'}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        <View style={styles.rowRightActions}>
                          {/* Nút gửi Zalo / Tải ảnh riêng lẻ nhỏ gọn */}
                          <TouchableOpacity
                            style={styles.singleShareBtn}
                            onPress={() => handleExportSingleToZalo(item)}
                            activeOpacity={0.7}
                            disabled={exporting}
                          >
                            <Text style={styles.singleShareBtnText}>
                              {isMobileDevice() ? '💬 Zalo' : '💾 Tải'}
                            </Text>
                          </TouchableOpacity>

                          {/* Nút xóa icon nhỏ thanh mảnh */}
                          <TouchableOpacity
                            style={styles.deleteCustomerBtn}
                            onPress={() => handleDeleteCustomer(item)}
                            activeOpacity={0.6}
                            disabled={exporting}
                            title="Gỡ khỏi danh sách nhắc nợ"
                          >
                            <Text style={styles.deleteCustomerBtnText}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })
          )}

          <View style={{ height: 12 }} />
        </ScrollView>

        {/* FOOTER CHÂN MODAL TINH TẾ */}
        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={[styles.primaryActionBtn, exporting && styles.primaryActionBtnDisabled]}
            onPress={handleExportAllToZalo}
            activeOpacity={0.8}
            disabled={exporting}
          >
            <Text style={styles.primaryActionBtnText}>
              {exporting
                ? `⏳ Đang tạo ảnh (${exportProgress.current}/${exportProgress.total})...`
                : isMobileDevice()
                ? `🚀 Gửi Zalo (${selectedKeys.size} quán)`
                : `🚀 Xuất & tải về (${selectedKeys.size} quán)`}
            </Text>
          </TouchableOpacity>

          <View style={styles.footerSecondaryRow}>
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={handleDismissToday}
              activeOpacity={0.7}
            >
              <Text style={styles.dismissBtnText}>Đã gửi / Bỏ qua hôm nay</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.closeBtnText}>Đóng lại</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SmoothModal>

    {/* Modal thêm khách nhắc nợ ĐỘC LẬP ở tầng cao nhất */}
    <AddPeriodicCustomerModal
      ref={addCustomerModalRef}
      onRefresh={loadTargetCustomers}
      existingConfigs={rawConfigs}
    />
  </>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    maxHeight: '92%',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    flexDirection: 'column',
    ...SHADOWS.large,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  modalHeaderTitleCol: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  modalSubTitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  closeHeaderBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeHeaderBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
  scrollBody: {
    flexGrow: 1,
    marginTop: 8,
  },

  // Thanh chọn kỳ (Segmented Control tinh gọn)
  periodSegmentWrapper: {
    marginBottom: 8,
  },
  periodSegmentBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 5.5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.card,
  },
  segmentBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  rangeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  rangeInfoTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E11D48',
  },
  rangeInfoDates: {
    fontSize: 10.5,
    color: '#64748B',
  },

  // Thanh thao tác nhanh
  selectionBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  checkboxIcon: {
    fontSize: 12,
  },
  selectAllBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  addCustomerPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3.5,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  addCustomerPillBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },

  // Tiến trình xuất
  exportProgressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 8,
    marginBottom: 8,
  },
  progressCol: {
    flex: 1,
  },
  progressTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
  },
  progressSub: {
    fontSize: 10.5,
    color: '#B45309',
    marginTop: 1,
  },

  // Danh sách quán
  loadingBox: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  loadingText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  groupSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    overflow: 'hidden',
  },
  groupSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  groupHeaderLeftCol: {
    flex: 1,
  },
  groupSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  groupCountText: {
    fontSize: 11,
    fontWeight: 'normal',
    color: '#64748B',
  },
  groupBatchActionBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupBatchActionBtnDisabled: {
    opacity: 0.5,
  },
  groupBatchActionBtnText: {
    color: '#1E293B',
    fontSize: 10.5,
    fontWeight: '600',
  },

  // Hàng khách hàng
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  customerRowAlt: {
    backgroundColor: '#FAFAFA',
  },
  customerRowSelected: {
    backgroundColor: '#FFFBEB',
  },
  customerRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    paddingRight: 6,
  },
  customerCheckbox: {
    fontSize: 13,
  },
  customerInfoCol: {
    flex: 1,
  },
  customerNameText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  customerReminderSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },

  // Cụm nút thao tác bên phải của từng hàng
  rowRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  singleShareBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  singleShareBtnText: {
    color: '#1E293B',
    fontSize: 10.5,
    fontWeight: '600',
  },
  deleteCustomerBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  deleteCustomerBtnText: {
    fontSize: 11,
    opacity: 0.6,
  },

  // Trạng thái trống
  emptyBox: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyIcon: {
    fontSize: 26,
  },
  emptyText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  emptyAddBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 4,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: 'bold',
  },

  // Footer
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
    gap: 6,
  },
  primaryActionBtn: {
    backgroundColor: '#E11D48',
    borderRadius: 10,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.button,
  },
  primaryActionBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  footerSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dismissBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
  },
  dismissBtnText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
  },

  textBold: {
    fontWeight: 'bold',
  },
});

export default PeriodicDebtReminderModal;
