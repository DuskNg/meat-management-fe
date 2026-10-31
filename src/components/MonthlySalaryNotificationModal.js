// meat-management-fe/src/components/MonthlySalaryNotificationModal.js
import React, { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
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
import { COLORS, FONTS, SHADOWS } from '../theme';
import { api } from '../api/client';
import { showGlobalToast } from '../store/toastStore';
import { downloadOrShareImage, isMobileDevice } from '../utils/imageShareHelper';

/**
 * Modal hiển thị thông báo trả lương nhân viên vào ngày cuối cùng của tháng
 * Kèm tính năng xuất ảnh bảng lương chi tiết và checkbox "Đã xuất ảnh" để tránh thông báo liên tục.
 */
const MonthlySalaryNotificationModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [monthKey, setMonthKey] = useState('');
  const [employees, setEmployees] = useState([]);
  const [isExportedChecked, setIsExportedChecked] = useState(false);

  // Mở modal từ bên ngoài thông qua ref
  useImperativeHandle(ref, () => ({
    open: async (targetMonthKey, initialEmployees) => {
      const now = new Date();
      const currentMonthKey = targetMonthKey || `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
      setMonthKey(currentMonthKey);
      
      // Nếu có sẵn dữ liệu nhân viên từ màn hình cha, hiển thị tức thì không cần đợi
      if (Array.isArray(initialEmployees) && initialEmployees.length > 0) {
        setEmployees(initialEmployees);
      }
      setVisible(true);

      // Kiểm tra trạng thái đã xuất ảnh trong localStorage
      const storageKey = `salary_exported_${currentMonthKey}`;
      const savedState = typeof window !== 'undefined' ? localStorage.getItem(storageKey) === 'true' : false;
      setIsExportedChecked(savedState);

      // Nếu chưa có dữ liệu ban đầu thì hiện loading, nếu đã có thì đồng bộ ngầm
      const shouldShowLoading = !(Array.isArray(initialEmployees) && initialEmployees.length > 0);
      await fetchEmployeesData(currentMonthKey, shouldShowLoading);
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Tải danh sách nhân viên theo tháng
  const fetchEmployeesData = async (targetMonthKey, showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const res = await api.get(`/employees?monthKey=${targetMonthKey}`);
      if (res.data?.success && Array.isArray(res.data.data)) {
        setEmployees(res.data.data);
      } else if (showLoading) {
        setEmployees([]);
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu lương nhân viên:', err);
      showGlobalToast('Không thể tải dữ liệu lương nhân viên.', 'error');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Định dạng số tiền VNĐ
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(amount || 0).replace('₫', 'đ');
  };

  // Helper lấy nhãn ngày bắt đầu vào làm giữa tháng (ví dụ: "(từ 10/10)")
  const getEmployeeStartDayText = (emp, currentMonthKey) => {
    if (emp.startDayText) return emp.startDayText;
    if (!emp.joinedMidMonth && !(emp.startDayInMonth && emp.startDayInMonth > 1)) {
      return '';
    }
    const [mStr] = (currentMonthKey || '').split('/');
    const monthNum = parseInt(mStr, 10) || (new Date().getMonth() + 1);
    let dayNum = emp.startDayInMonth;
    if (!dayNum && emp.startDate) {
      const d = new Date(emp.startDate);
      if (!isNaN(d.getTime())) {
        dayNum = d.getDate();
      }
    }
    if (dayNum && dayNum > 1) {
      return `(từ ${dayNum.toString().padStart(2, '0')}/${monthNum.toString().padStart(2, '0')})`;
    }
    return '';
  };

  // Tính tổng kết lương toàn bộ nhân viên
  const summary = useMemo(() => {
    let totalBase = 0;
    let totalAdvances = 0;
    let totalRemaining = 0;
    let totalWorkingDays = 0;

    employees.forEach((emp) => {
      totalBase += (emp.baseSalary || 0);
      totalAdvances += (emp.totalAdvances || 0);
      totalRemaining += (emp.remainingSalary || 0);
      totalWorkingDays += (emp.workingDays || 0);
    });

    return {
      totalEmployees: employees.length,
      totalBase,
      totalAdvances,
      totalRemaining,
      totalWorkingDays,
    };
  }, [employees]);

  // Xử lý khi bấm chuyển đổi checkbox "Đã xuất ảnh"
  const handleToggleExportedCheckbox = () => {
    const nextState = !isExportedChecked;
    setIsExportedChecked(nextState);
    if (typeof window !== 'undefined' && monthKey) {
      const storageKey = `salary_exported_${monthKey}`;
      if (nextState) {
        localStorage.setItem(storageKey, 'true');
        showGlobalToast('Đã lưu: Sẽ không hiện lại thông báo trả lương tháng này.', 'success');
      } else {
        localStorage.removeItem(storageKey);
      }
    }
  };

  // Hàm ngắt dòng văn bản dài cho Canvas
  const wrapText = (context, text, maxWidth) => {
    if (!text) return [];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = context.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  };

  // Hàm vẽ và xuất ảnh Bảng thanh toán lương chi tiết bằng HTML5 Canvas
  const handleExportSalaryImage = async () => {
    if (Platform.OS !== 'web') {
      showGlobalToast('Tính năng xuất ảnh hiện hỗ trợ tốt nhất trên nền tảng Web.', 'info');
      return;
    }

    if (!employees || employees.length === 0) {
      showGlobalToast('Chưa có dữ liệu nhân viên để xuất ảnh bảng lương.', 'warning');
      return;
    }

    try {
      setExporting(true);

      const [mStr, yStr] = (monthKey || '').split('/');
      const monthNum = parseInt(mStr, 10) || (new Date().getMonth() + 1);
      const yearNum = parseInt(yStr, 10) || new Date().getFullYear();
      const lastDay = new Date(yearNum, monthNum, 0).getDate();

      // Kích thước canvas
      const width = 1000;
      const colWidths = {
        stt: 45,
        name: 195,
        baseSalary: 125,
        workingDays: 95,
        calculatedSalary: 140,
        advances: 155,
        remainingSalary: 205,
      };

      const startTableY = 210;
      const rowMinHeight = 40;
      const paddingX = 20;

      // Đo chiều cao từng hàng
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.font = '13px Arial';

      const rowsLayout = employees.map((emp, idx) => {
        const nameLines = wrapText(tempCtx, emp.name || '---', colWidths.name - 16);

        // Tách chi tiết từng lần tạm ứng (kèm ngày ứng nếu có)
        const advanceLines = [];
        if (emp.advances && emp.advances.length > 0) {
          emp.advances.forEach((adv) => {
            const advDate = adv.date ? new Date(adv.date) : null;
            const dateStr = advDate && !isNaN(advDate.getTime())
              ? `${advDate.getDate().toString().padStart(2, '0')}/${(advDate.getMonth() + 1).toString().padStart(2, '0')}`
              : '';
            const text = dateStr ? `(${dateStr}) -${formatCurrency(adv.amount)}` : `-${formatCurrency(adv.amount)}`;
            advanceLines.push(text);
          });
        } else if (emp.totalAdvances > 0) {
          advanceLines.push(`-${formatCurrency(emp.totalAdvances)}`);
        } else {
          advanceLines.push('-');
        }

        const startText = getEmployeeStartDayText(emp, monthKey);
        const workSubLines = [];
        if (startText) workSubLines.push(startText);
        if (emp.leaveDays > 0) workSubLines.push(`(Nghỉ ${emp.leaveDays}c)`);

        const dailyRate = emp.dailySalary || Math.round((emp.baseSalary || 0) / (emp.totalDaysInMonth || lastDay));
        const dailyRateText = `(~${formatCurrency(dailyRate)}/ngày)`;
        const maxLines = Math.max(nameLines.length, advanceLines.length, 1 + workSubLines.length, emp.isPartiallyPaid ? 3 : 2);
        const rowHeight = Math.max(rowMinHeight, maxLines * 18 + 14);
        return {
          ...emp,
          stt: idx + 1,
          nameLines,
          advanceLines,
          startText,
          workSubLines,
          dailyRateText,
          rowHeight,
        };
      });

      const tableContentHeight = rowsLayout.reduce((sum, r) => sum + r.rowHeight, 0);
      const footerSummaryHeight = 44; // Dòng tổng cộng
      const footerNotesHeight = 220; // Khu vực ghi chú và chữ ký
      const canvasHeight = startTableY + 44 + tableContentHeight + footerSummaryHeight + footerNotesHeight;

      // Tạo canvas vẽ ảnh chính sắc nét với tỉ lệ scale 1.5x
      const canvas = document.createElement('canvas');
      const scale = 1.5;
      canvas.width = width * scale;
      canvas.height = canvasHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // Nền trắng tinh
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, canvasHeight);

      // Viền ngoài sang trọng
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 3;
      ctx.strokeRect(10, 10, width - 20, canvasHeight - 20);

      // Viền phụ mỏng bên trong
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.strokeRect(14, 14, width - 28, canvasHeight - 28);

      // ─── PHẦN TIÊU ĐỀ BẢNG LƯƠNG ───
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('BẢNG THANH TOÁN TIỀN LƯƠNG NHÂN VIÊN', width / 2, 54);

      ctx.fillStyle = '#0284C7';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(`KỲ LƯƠNG THÁNG ${monthKey} (01/${mStr}/${yStr} - ${lastDay}/${mStr}/${yStr})`, width / 2, 82);

      // Đường kẻ phân cách header
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(paddingX, 102);
      ctx.lineTo(width - paddingX, 102);
      ctx.stroke();

      // Thông tin tổng quan kỳ lương
      ctx.textAlign = 'left';
      ctx.fillStyle = '#334155';
      ctx.font = '14px Arial';
      ctx.fillText(`• Tổng số nhân viên: ${employees.length} người`, paddingX + 10, 128);
      ctx.fillText(`• Tiêu chuẩn ngày công: ${lastDay} ngày/tháng`, paddingX + 10, 150);
      ctx.fillText(`• Tổng chi trả thực lĩnh: ${formatCurrency(summary.totalRemaining)}`, paddingX + 10, 172);

      // Thời gian xuất bảng lương
      const now = new Date();
      const exportTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} - ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
      ctx.textAlign = 'right';
      ctx.font = 'italic 13px Arial';
      ctx.fillStyle = '#64748B';
      ctx.fillText(`Ngày chốt xuất bảng: ${exportTime}`, width - paddingX - 10, 128);
      ctx.fillText(`Đơn vị tiền tệ: Việt Nam Đồng (VNĐ)`, width - paddingX - 10, 150);

      // ─── BẢNG DỮ LIỆU (HEADER CỘT) ───
      const tableHeadY = startTableY;
      const tableWidth = width - paddingX * 2;

      ctx.fillStyle = '#0284C7';
      ctx.fillRect(paddingX, tableHeadY, tableWidth, 42);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px Arial';
      ctx.textBaseline = 'middle';

      let curX = paddingX;

      // STT
      ctx.textAlign = 'center';
      ctx.fillText('STT', curX + colWidths.stt / 2, tableHeadY + 21);
      curX += colWidths.stt;

      // Họ và tên
      ctx.textAlign = 'left';
      ctx.fillText('HỌ VÀ TÊN', curX + 10, tableHeadY + 21);
      curX += colWidths.name;

      // Lương cứng
      ctx.textAlign = 'right';
      ctx.fillText('LƯƠNG CỨNG', curX + colWidths.baseSalary - 10, tableHeadY + 21);
      curX += colWidths.baseSalary;

      // Số công
      ctx.textAlign = 'center';
      ctx.fillText('SỐ CÔNG', curX + colWidths.workingDays / 2, tableHeadY + 21);
      curX += colWidths.workingDays;

      // Lương theo công
      ctx.textAlign = 'right';
      ctx.fillText('LƯƠNG CÔNG', curX + colWidths.calculatedSalary - 10, tableHeadY + 21);
      curX += colWidths.calculatedSalary;

      // Tạm ứng
      ctx.fillText('TẠM ỨNG', curX + colWidths.advances - 10, tableHeadY + 21);
      curX += colWidths.advances;

      // Thực lĩnh
      ctx.fillText('THỰC LĨNH', curX + colWidths.remainingSalary - 10, tableHeadY + 21);

      // ─── NỘI DUNG TỪNG DÒNG NHÂN VIÊN ───
      let rowY = tableHeadY + 42;
      ctx.textBaseline = 'alphabetic';

      rowsLayout.forEach((row, idx) => {
        // Màu xen kẽ các hàng
        ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        ctx.fillRect(paddingX, rowY, tableWidth, row.rowHeight);

        // Kẻ viền ngang
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.strokeRect(paddingX, rowY, tableWidth, row.rowHeight);

        let colX = paddingX;

        // Cột STT
        ctx.fillStyle = '#64748B';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(row.stt.toString(), colX + colWidths.stt / 2, rowY + 24);
        colX += colWidths.stt;

        // Cột Họ và tên
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'left';
        row.nameLines.forEach((line, lIdx) => {
          ctx.fillText(line, colX + 10, rowY + 22 + lIdx * 18);
        });
        colX += colWidths.name;

        // Cột Lương cứng
        ctx.fillStyle = '#0F172A';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(formatCurrency(row.baseSalary || 0), colX + colWidths.baseSalary - 10, rowY + 24);
        colX += colWidths.baseSalary;

        // Cột Số công (Kèm ngày vào làm giữa tháng ví dụ: (từ 10/10))
        ctx.fillStyle = '#0284C7';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        const workingDaysText = `${row.workingDays ?? 0}/${row.totalDaysInMonth ?? lastDay}`;
        const hasWorkSubs = row.workSubLines && row.workSubLines.length > 0;
        const workBaseY = rowY + (row.rowHeight - (hasWorkSubs ? row.workSubLines.length * 14 : 0)) / 2 + 2;
        ctx.fillText(workingDaysText, colX + colWidths.workingDays / 2, workBaseY);

        if (hasWorkSubs) {
          row.workSubLines.forEach((subText, sIdx) => {
            const isLeave = subText.includes('Nghỉ');
            ctx.fillStyle = isLeave ? '#EF4444' : '#0284C7';
            ctx.font = isLeave ? '10px Arial' : 'bold 10px Arial';
            ctx.fillText(subText, colX + colWidths.workingDays / 2, workBaseY + 13 + sIdx * 12);
          });
        }
        colX += colWidths.workingDays;

        // Cột Lương theo công
        ctx.fillStyle = '#0F172A';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(formatCurrency(row.calculatedSalary || 0), colX + colWidths.calculatedSalary - 10, rowY + 24);
        colX += colWidths.calculatedSalary;

        // Cột Tạm ứng (Tách từng lần ứng)
        if (row.totalAdvances > 0) {
          ctx.fillStyle = '#EF4444';
          ctx.font = '12px Arial';
          ctx.textAlign = 'right';
          const startAdvY = rowY + (row.rowHeight - (row.advanceLines.length - 1) * 18) / 2 + 4;
          row.advanceLines.forEach((advText, aIdx) => {
            ctx.fillText(advText, colX + colWidths.advances - 10, startAdvY + aIdx * 18);
          });
        } else {
          ctx.fillStyle = '#94A3B8';
          ctx.font = '12px Arial';
          ctx.textAlign = 'right';
          ctx.fillText('-', colX + colWidths.advances - 10, rowY + row.rowHeight / 2 + 4);
        }
        colX += colWidths.advances;

        // Cột Thực lĩnh (kèm mức lương/ngày mở ngoặc bên dưới)
        const displayRem = row.isPaid
          ? `${formatCurrency(row.monthNetSalary || row.calculatedSalary)} (Đủ)`
          : formatCurrency(row.remainingSalary || 0);

        const hasPartial = Boolean(row.isPartiallyPaid);
        const remBaseY = rowY + (row.rowHeight - (hasPartial ? 32 : 18)) / 2 + 3;

        ctx.fillStyle = (row.remainingSalary || 0) < 0 ? '#EF4444' : '#059669';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(displayRem, colX + colWidths.remainingSalary - 10, remBaseY);

        ctx.fillStyle = '#64748B';
        ctx.font = '11px Arial';
        ctx.fillText(row.dailyRateText, colX + colWidths.remainingSalary - 10, remBaseY + 15);

        if (hasPartial) {
          ctx.fillStyle = '#D97706';
          ctx.font = '10px Arial';
          ctx.fillText(`(Đã trả: ${formatCurrency(row.totalPaidSalary)})`, colX + colWidths.remainingSalary - 10, remBaseY + 28);
        }

        rowY += row.rowHeight;
      });

      // ─── DÒNG TỔNG CỘNG ───
      ctx.fillStyle = '#F0F9FF';
      ctx.fillRect(paddingX, rowY, tableWidth, footerSummaryHeight);

      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(paddingX, rowY, tableWidth, footerSummaryHeight);

      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0369A1';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`TỔNG CỘNG (${employees.length} NHÂN VIÊN)`, paddingX + colWidths.stt + 10, rowY + footerSummaryHeight / 2);

      // Tổng lương cứng
      ctx.textAlign = 'right';
      const sumBaseX = paddingX + colWidths.stt + colWidths.name;
      ctx.fillText(formatCurrency(summary.totalBase || 0), sumBaseX + colWidths.baseSalary - 10, rowY + footerSummaryHeight / 2);

      // Tổng số công
      ctx.textAlign = 'center';
      const sumWorkX = sumBaseX + colWidths.baseSalary;
      ctx.fillText(`${summary.totalWorkingDays} công`, sumWorkX + colWidths.workingDays / 2, rowY + footerSummaryHeight / 2);

      // Tổng tạm ứng
      ctx.textAlign = 'right';
      const sumAdvX = sumWorkX + colWidths.workingDays + colWidths.calculatedSalary;
      ctx.fillStyle = summary.totalAdvances > 0 ? '#EF4444' : '#64748B';
      ctx.fillText(summary.totalAdvances > 0 ? `-${formatCurrency(summary.totalAdvances)}` : '0đ', sumAdvX + colWidths.advances - 10, rowY + footerSummaryHeight / 2);

      // Tổng thực lĩnh
      const sumRemX = sumAdvX + colWidths.advances;
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(formatCurrency(summary.totalRemaining), sumRemX + colWidths.remainingSalary - 10, rowY + footerSummaryHeight / 2);

      // ─── PHẦN CHỮ KÝ VÀ GHI CHÚ CUỐI ẢNH ───
      const signY = rowY + footerSummaryHeight + 35;
      ctx.textBaseline = 'alphabetic';

      ctx.fillStyle = '#475569';
      ctx.font = 'italic 12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('* Lưu ý: Kính đề nghị nhân viên kiểm tra, đối soát lại số ngày công và các khoản tạm ứng trong tháng.', paddingX + 10, signY);
      ctx.fillText('* Mọi thắc mắc xin vui lòng liên hệ quản lý để được giải quyết trước ngày thanh toán.', paddingX + 10, signY + 20);

      // 2 cột ký tên
      const signColY = signY + 55;
      const colLeftX = width * 0.25;
      const colRightX = width * 0.75;

      ctx.textAlign = 'center';
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('NGƯỜI LẬP BẢNG', colLeftX, signColY);
      ctx.fillText('CHỦ CƠ SỞ / DUYỆT CHI', colRightX, signColY);

      ctx.fillStyle = '#64748B';
      ctx.font = 'italic 12px Arial';
      ctx.fillText('(Ký, ghi rõ họ tên)', colLeftX, signColY + 20);
      ctx.fillText('(Ký, đóng dấu nếu có)', colRightX, signColY + 20);

      // Chuyển canvas thành DataURL dạng PNG
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const fileName = `Bang_Luong_Nhan_Vien_Thang_${monthKey.replace('/', '_')}.png`;

      // Tự động tải file (PC) hoặc chia sẻ qua Zalo (Mobile)
      await downloadOrShareImage({
        imageUri: dataUrl,
        fileName,
        title: `Bảng thanh toán lương tháng ${monthKey}`,
        text: `Bảng thanh toán tiền lương nhân viên tháng ${monthKey} (Tổng thực lĩnh: ${formatCurrency(summary.totalRemaining)})`,
      });

      // Tự động đánh dấu checkbox "Đã xuất ảnh" để tránh thông báo liên tục
      setIsExportedChecked(true);
      if (typeof window !== 'undefined' && monthKey) {
        localStorage.setItem(`salary_exported_${monthKey}`, 'true');
      }

      showGlobalToast('Đã xuất ảnh bảng lương thành công!', 'success');
    } catch (err) {
      console.error('Lỗi khi vẽ và xuất ảnh bảng lương:', err);
      showGlobalToast('Không thể tạo ảnh bảng lương. Vui lòng thử lại.', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* Header Modal */}
        <View style={styles.modalHeader}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIconContainer}>
              <Text style={styles.headerIcon}>💰</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>THÔNG BÁO TRẢ LƯƠNG NHÂN VIÊN</Text>
              <Text style={styles.modalSubtitle}>
                Kỳ lương tháng {monthKey} • Chốt ngày cuối tháng
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Thông báo nhắc nhở ngày cuối tháng */}
        <View style={styles.reminderBanner}>
          <Text style={styles.reminderBannerText}>
            📅 <Text style={{ fontWeight: 'bold' }}>Hôm nay là ngày cuối cùng của tháng!</Text> Vui lòng đối soát số công, các khoản tạm ứng và xuất bảng lương gửi cho nhân viên.
          </Text>
        </View>

        {/* Body Nội dung */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0284C7" />
            <Text style={styles.loadingText}>Đang tổng hợp dữ liệu lương...</Text>
          </View>
        ) : (
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Khối thống kê nhanh */}
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <Text style={styles.summaryLabel}>👥 Tổng nhân viên</Text>
                <Text style={[styles.summaryValue, { color: '#0369A1' }]}>
                  {summary.totalEmployees} người
                </Text>
              </View>

              <View style={[styles.summaryCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                <Text style={styles.summaryLabel}>💵 Tổng thực lĩnh</Text>
                <Text style={[styles.summaryValue, { color: '#15803D' }]}>
                  {formatCurrency(summary.totalRemaining)}
                </Text>
              </View>

              <View style={[styles.summaryCard, { backgroundColor: '#FEF2F2', borderColor: '#FECDD3' }]}>
                <Text style={styles.summaryLabel}>💸 Tổng tạm ứng</Text>
                <Text style={[styles.summaryValue, { color: '#B91C1C' }]}>
                  {formatCurrency(summary.totalAdvances)}
                </Text>
              </View>

              <View style={[styles.summaryCard, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                <Text style={styles.summaryLabel}>📊 Tổng ngày công</Text>
                <Text style={[styles.summaryValue, { color: '#475569' }]}>
                  {summary.totalWorkingDays} công
                </Text>
              </View>
            </View>

            {/* Danh sách nhân viên dạng Bảng theo chuẩn Mobile-First */}
            <View style={styles.tableCard}>
              <View style={styles.tableCardHeader}>
                <Text style={styles.tableCardTitle}>CHI TIẾT LƯƠNG TỪNG NHÂN VIÊN</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View>
                  {/* Header Cột */}
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.thText, { width: 40, textAlign: 'center' }]}>STT</Text>
                    <Text style={[styles.thText, { width: 160 }]}>HỌ VÀ TÊN</Text>
                    <Text style={[styles.thText, { width: 120, textAlign: 'right' }]}>LƯƠNG CỨNG</Text>
                    <Text style={[styles.thText, { width: 100, textAlign: 'center' }]}>SỐ CÔNG</Text>
                    <Text style={[styles.thText, { width: 145, textAlign: 'right' }]}>TẠM ỨNG</Text>
                    <Text style={[styles.thText, { width: 150, textAlign: 'right' }]}>THỰC LĨNH</Text>
                    <Text style={[styles.thText, { width: 95, textAlign: 'center' }]}>TRẠNG THÁI</Text>
                  </View>

                  {/* Dòng dữ liệu */}
                  {employees.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>Chưa có dữ liệu nhân viên nào trong tháng này.</Text>
                    </View>
                  ) : (
                    employees.map((emp, index) => (
                      <View
                        key={emp.id || index}
                        style={[
                          styles.tableRow,
                          index % 2 === 1 && { backgroundColor: '#F8FAFC' },
                        ]}
                      >
                        <Text style={[styles.tdText, { width: 40, textAlign: 'center', color: '#64748B' }]}>
                          {index + 1}
                        </Text>
                        <View style={{ width: 160 }}>
                          <Text style={[styles.tdText, { fontWeight: 'bold', color: '#0F172A' }]} numberOfLines={1}>
                            {emp.name}
                          </Text>
                        </View>
                        {/* Cột Lương cứng */}
                        <Text style={[styles.tdText, { width: 120, textAlign: 'right', color: '#0F172A', fontWeight: '500' }]}>
                          {formatCurrency(emp.baseSalary || 0)}
                        </Text>
                        <View style={{ width: 100, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={[styles.tdText, { fontWeight: '600', color: '#0284C7' }]}>
                            {emp.workingDays ?? 0}/{emp.totalDaysInMonth ?? 30}
                          </Text>
                          {Boolean(getEmployeeStartDayText(emp, monthKey)) && (
                            <Text style={{ fontSize: 10, color: '#0284C7', fontWeight: 'bold', marginTop: 1 }}>
                              {getEmployeeStartDayText(emp, monthKey)}
                            </Text>
                          )}
                          {emp.leaveDays > 0 && (
                            <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 1 }}>
                              (Nghỉ {emp.leaveDays}c)
                            </Text>
                          )}
                        </View>
                        {/* Cột Tạm ứng tách chi tiết từng lần ứng */}
                        <View style={{ width: 145, alignItems: 'flex-end', justifyContent: 'center' }}>
                          {emp.advances && emp.advances.length > 0 ? (
                            emp.advances.map((adv, aIdx) => {
                              const advDate = adv.date ? new Date(adv.date) : null;
                              const dateStr = advDate && !isNaN(advDate.getTime())
                                ? `${advDate.getDate().toString().padStart(2, '0')}/${(advDate.getMonth() + 1).toString().padStart(2, '0')}`
                                : '';
                              return (
                                <View
                                  key={adv.id || aIdx}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    marginVertical: 1,
                                  }}
                                >
                                  {dateStr ? (
                                    <Text style={{ fontSize: 11, color: '#64748B', marginRight: 4 }}>
                                      ({dateStr})
                                    </Text>
                                  ) : null}
                                  <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '500' }}>
                                    -{formatCurrency(adv.amount)}
                                  </Text>
                                </View>
                              );
                            })
                          ) : emp.totalAdvances > 0 ? (
                            <Text style={[styles.tdText, { color: '#EF4444', textAlign: 'right' }]}>
                              -{formatCurrency(emp.totalAdvances)}
                            </Text>
                          ) : (
                            <Text style={[styles.tdText, { color: '#94A3B8', textAlign: 'right' }]}>-</Text>
                          )}
                        </View>
                        {/* Cột Thực lĩnh kèm mức lương ngày mở ngoặc bên dưới */}
                        <View style={{ width: 150, alignItems: 'flex-end', justifyContent: 'center' }}>
                          <Text style={[
                            styles.tdText,
                            {
                              textAlign: 'right',
                              fontWeight: 'bold',
                              color: (emp.remainingSalary || 0) < 0 ? '#EF4444' : '#059669',
                            }
                          ]}>
                            {formatCurrency(emp.remainingSalary || 0)}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1, textAlign: 'right' }}>
                            (~{formatCurrency(emp.dailySalary || Math.round((emp.baseSalary || 0) / (emp.totalDaysInMonth || 30)))}/ngày)
                          </Text>
                          {emp.isPartiallyPaid && (
                            <Text style={{ fontSize: 10, color: '#D97706', marginTop: 1, textAlign: 'right' }}>
                              (Đã trả: {formatCurrency(emp.totalPaidSalary)})
                            </Text>
                          )}
                        </View>
                        <View style={{ width: 95, alignItems: 'center', justifyContent: 'center' }}>
                          <View style={[
                            styles.statusBadge,
                            {
                              backgroundColor: emp.isPaid
                                ? '#DCFCE7'
                                : (emp.isPartiallyPaid ? '#FEF3C7' : '#F1F5F9')
                            }
                          ]}>
                            <Text style={[
                              styles.statusBadgeText,
                              {
                                color: emp.isPaid
                                  ? '#15803D'
                                  : (emp.isPartiallyPaid ? '#D97706' : '#64748B')
                              }
                            ]}>
                              {emp.isPaid ? 'Đã trả đủ' : (emp.isPartiallyPaid ? 'Trả 1 phần' : 'Chưa trả')}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            </View>

            {/* Checkbox Đã xuất ảnh để tránh thông báo liên tục */}
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={handleToggleExportedCheckbox}
              activeOpacity={0.7}
            >
              <View style={[
                styles.checkboxBox,
                isExportedChecked && styles.checkboxBoxChecked
              ]}>
                {isExportedChecked && <Text style={styles.checkboxCheckmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>
                Đã xuất ảnh bảng lương (không hiển thị lại thông báo nhắc nhở trong tháng {monthKey})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Footer Modal */}
        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={[styles.exportBtn, exporting && { opacity: 0.7 }]}
            onPress={handleExportSalaryImage}
            disabled={exporting || loading}
            activeOpacity={0.8}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.exportBtnIcon}>📸</Text>
                <Text style={styles.exportBtnText}>
                  {isMobileDevice() ? 'XUẤT & GỬI ẢNH BẢNG LƯƠNG QUA ZALO' : 'XUẤT ẢNH BẢNG LƯƠNG CHI TIẾT'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.closeFooterBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeFooterBtnText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default MonthlySalaryNotificationModal;

const styles = StyleSheet.create({
  modalView: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    ...SHADOWS.large,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  headerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerIcon: {
    fontSize: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
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
    fontSize: 16,
    color: '#64748B',
    fontWeight: 'bold',
  },
  reminderBanner: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    marginBottom: 10,
  },
  reminderBannerText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
  modalBody: {
    maxHeight: 520,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  summaryCard: {
    width: '48.5%',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
  },
  tableCardHeader: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableCardTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tdText: {
    fontSize: 12,
    color: '#334155',
    paddingHorizontal: 4,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyContainer: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxBoxChecked: {
    borderColor: '#0284C7',
    backgroundColor: '#0284C7',
  },
  checkboxCheckmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    lineHeight: 14,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
    lineHeight: 17,
  },
  modalFooter: {
    marginTop: 10,
    gap: 8,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    height: 48,
    borderRadius: 12,
    gap: 8,
    ...SHADOWS.small,
  },
  exportBtnIcon: {
    fontSize: 18,
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  closeFooterBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    height: 44,
    borderRadius: 12,
  },
  closeFooterBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
});
