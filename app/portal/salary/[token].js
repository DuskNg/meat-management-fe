// meat-management-fe/app/portal/salary/[token].js
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import { API_HOST } from '../../../src/api/client';

const formatCurrency = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(val))) + ' đ';
};

const formatDateVN = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

const formatShortDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${dd}/${mm}`;
};

export default function EmployeeSalaryPortalScreen() {
  const { token } = useLocalSearchParams();

  // State thông tin ban đầu
  const [initLoading, setInitLoading] = useState(true);
  const [portalInfo, setPortalInfo] = useState(null);
  const [initError, setInitError] = useState('');

  // State xác thực Mã (mã nhân viên hoặc mã chủ cơ sở)
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // State dữ liệu lương
  const [monthKey, setMonthKey] = useState(() => {
    const now = new Date();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${mm}/${now.getFullYear()}`;
  });
  const [dataLoading, setDataLoading] = useState(false);
  const [salaryData, setSalaryData] = useState(null);
  const [dataError, setDataError] = useState('');

  // State khi Chủ cơ sở bấm xem chi tiết 1 nhân viên cụ thể trong bảng tổng hợp
  const [selectedOwnerEmpId, setSelectedOwnerEmpId] = useState(null);

  // Helper đọc và lưu mã xác thực trên máy cá nhân của nhân viên / chủ cơ sở
  const getSavedCode = () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(`salary_portal_code_${token}`);
      } catch (_) {
        return null;
      }
    }
    return null;
  };

  const saveCodeToStorage = (code) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        if (code) {
          window.localStorage.setItem(`salary_portal_code_${token}`, code);
        } else {
          window.localStorage.removeItem(`salary_portal_code_${token}`);
        }
      } catch (_) {}
    }
  };


  // 1. Tải thông tin ban đầu của token khi mở link
  useEffect(() => {
    if (!token) return;
    loadPortalInfo();
  }, [token]);

  const loadPortalInfo = async () => {
    try {
      setInitLoading(true);
      setInitError('');
      const res = await axios.get(`${API_HOST}/api/v1/portal/staff/info/${token}`);
      if (res.data?.success) {
        setPortalInfo(res.data.data);

        // Tự động khôi phục đăng nhập từ cache máy cá nhân
        const savedCode = getSavedCode();
        if (savedCode) {
          try {
            setPinInput(savedCode);
            await fetchSalaryData(monthKey, savedCode);
            setIsUnlocked(true);
          } catch (autoErr) {
            // Nếu mã cũ đã đổi hoặc không còn hợp lệ thì xóa cache
            saveCodeToStorage(null);
            setPinInput('');
            setIsUnlocked(false);
          }
        }
      }
    } catch (err) {
      console.error('Lỗi tải thông tin portal nhân viên:', err);
      try {
        const fallbackRes = await axios.get(`${API_HOST}/api/v1/portal/employee-salary/info/${token}`);
        if (fallbackRes.data?.success) {
          setPortalInfo({ ...fallbackRes.data.data, isGeneral: false });
          return;
        }
      } catch (_) {}
      setInitError(err.response?.data?.message || 'Đường dẫn tra cứu không hợp lệ hoặc đã hết hạn.');
    } finally {
      setInitLoading(false);
    }
  };

  // 2. Xác thực Mã mở khóa bảng lương (hỗ trợ cả Mã nhân viên lẫn Mã người chủ)
  const handleUnlockWithCode = async () => {
    const cleanCode = (pinInput || '').trim();
    if (!cleanCode) {
      setPinError('Vui lòng nhập mã xác thực được cấp.');
      return;
    }

    setVerifying(true);
    setPinError('');
    try {
      await fetchSalaryData(monthKey, cleanCode);
      setIsUnlocked(true);
      // Lưu cache vào máy cá nhân để những lần sau tự động mở ngay không cần nhập lại
      saveCodeToStorage(cleanCode);
    } catch (err) {
      setPinError(
        err.response?.data?.message ||
          'Mã xác thực không chính xác. Vui lòng kiểm tra lại mã được cấp.'
      );
    } finally {
      setVerifying(false);
    }
  };

  // 3. Tải chi tiết dữ liệu lương theo mã xác thực
  const fetchSalaryData = async (targetMonth, targetCode) => {
    setDataLoading(true);
    setDataError('');
    try {
      const codeToUse = targetCode !== undefined ? targetCode : (pinInput || '').trim();
      const empIdParam =
        !portalInfo?.isGeneral && portalInfo?.employeeId
          ? `&employeeId=${encodeURIComponent(portalInfo.employeeId)}`
          : '';

      const url = `${API_HOST}/api/v1/portal/staff/salary/${token}?monthKey=${encodeURIComponent(
        targetMonth
      )}&pin=${encodeURIComponent(codeToUse)}${empIdParam}`;

      const res = await axios.get(url, {
        headers: { 'x-portal-pin': codeToUse },
      });

      if (res.data?.success) {
        setSalaryData(res.data.data);
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu bảng lương:', err);
      setDataError(err.response?.data?.message || 'Không thể tải dữ liệu bảng lương tháng này.');
      throw err;
    } finally {
      setDataLoading(false);
    }
  };

  // 4. Chuyển đổi tháng
  const adjustMonth = (delta) => {
    const parts = monthKey.split('/');
    if (parts.length !== 2) return;
    const m = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    const date = new Date(y, m - 1 + delta, 1);
    const newMonthKey = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    setMonthKey(newMonthKey);
    fetchSalaryData(newMonthKey, (pinInput || '').trim()).catch(() => {});
  };

  // Khóa lại để nhập mã khác (xóa cache trên máy cá nhân)
  const handleLockAgain = () => {
    saveCodeToStorage(null);
    setIsUnlocked(false);
    setPinInput('');
    setPinError('');
    setSalaryData(null);
    setSelectedOwnerEmpId(null);
  };

  // Render chi tiết bảng lương của 1 nhân viên (dùng chung cho chế độ Cá nhân và khi Chủ bấm xem chi tiết 1 nhân viên)
  const renderSingleEmployeeSalaryDetail = (empDetailData, isFromOwnerTable = false) => {
    const salary = empDetailData?.salary;
    const stats = empDetailData?.stats;
    const leaves = empDetailData?.leaves || [];
    const advances = empDetailData?.advances || [];
    const employee = empDetailData?.employee;
    const payment = empDetailData?.payment;
    const totalDays = empDetailData?.totalDaysInMonth || 30;
    const workingDays = empDetailData?.workingDays ?? totalDays;
    const startDayText = empDetailData?.startDayText || '';

    const isPaid = Boolean(payment?.isPaid || salary?.isPaid);
    const isPartiallyPaid = Boolean(payment?.isPartiallyPaid || salary?.isPartiallyPaid);
    const totalPaidSalary = Number(payment?.totalPaidSalary || salary?.totalPaidSalary || 0);

    return (
      <View style={styles.singleDetailContainer}>
        {isFromOwnerTable && (
          <TouchableOpacity
            style={styles.backToTableBtn}
            onPress={() => setSelectedOwnerEmpId(null)}
            activeOpacity={0.7}
          >
            <Text style={styles.backToTableBtnText}>⬅️ Quay lại bảng tổng hợp tất cả nhân viên</Text>
          </TouchableOpacity>
        )}

        {/* Thanh thông tin nhân viên */}
        <View style={styles.employeeBar}>
          <View style={styles.employeeBarLeft}>
            <Text style={styles.employeeBarName}>👤 {employee?.name}</Text>
            <Text style={styles.employeeBarRole}>
              {employee?.role ? `💼 ${employee.role}` : '💼 Nhân viên'}
              {employee?.accessCode ? ` • 🔑 Mã: ${employee.accessCode}` : ''}
            </Text>
          </View>
          {!isFromOwnerTable && (
            <TouchableOpacity style={styles.lockBtn} onPress={handleLockAgain} activeOpacity={0.7}>
              <Text style={styles.lockBtnText}>🔒 Đổi mã</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Card Lương thực lĩnh */}
        <View style={styles.netSalaryCard}>
          <Text style={styles.netSalaryLabel}>
            {isPartiallyPaid
              ? `LƯƠNG THỰC LĨNH CÒN LẠI THÁNG ${monthKey}`
              : `LƯƠNG THỰC LĨNH THÁNG ${monthKey}`}
          </Text>
          <Text style={styles.netSalaryAmount}>
            {formatCurrency(isPaid ? (salary?.monthNetSalary || salary?.finalAmount) : salary?.finalAmount)}
          </Text>
          <View style={styles.netSalaryStatusWrap}>
            {isPaid ? (
              <Text style={[styles.netSalaryStatus, styles.statusPaid]}>
                ✅ ĐÃ THANH TOÁN ĐỦ
              </Text>
            ) : isPartiallyPaid ? (
              <Text style={[styles.netSalaryStatus, styles.statusPartial]}>
                🟡 TRẢ 1 PHẦN (ĐÃ NHẬN: {formatCurrency(totalPaidSalary)})
              </Text>
            ) : (
              <Text style={[styles.netSalaryStatus, styles.statusUnpaid]}>
                ⏳ CHƯA THANH TOÁN
              </Text>
            )}
          </View>
        </View>

        {/* Chi tiết tính lương */}
        <View style={styles.detailCard}>
          <Text style={styles.cardHeaderTitle}>📊 CHI TIẾT TÍNH LƯƠNG THÁNG {monthKey}</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailRowLabel}>Lương cứng tháng:</Text>
            <Text style={styles.detailRowVal}>{formatCurrency(salary?.baseSalary)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailRowLabel}>
              Đơn giá 1 ngày công ({totalDays} ngày):
            </Text>
            <Text style={styles.detailRowVal}>~{formatCurrency(salary?.dailySalary)}/ngày</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailRowLabel}>Số ngày công thực tế:</Text>
            <Text style={[styles.detailRowVal, { color: '#0284C7', fontWeight: 'bold' }]}>
              {workingDays}/{totalDays} công {startDayText ? `${startDayText}` : ''}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailRowLabel}>Lương theo ngày công:</Text>
            <Text style={styles.detailRowVal}>{formatCurrency(salary?.calculatedSalary)}</Text>
          </View>

          {stats?.leaveDays > 0 && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailRowLabel, { color: '#EF4444' }]}>
                Khấu trừ nghỉ làm ({stats.leaveDays} buổi):
              </Text>
              <Text style={[styles.detailRowVal, { color: '#EF4444', fontWeight: 'bold' }]}>
                -{formatCurrency(stats.leaveDeduction)}
              </Text>
            </View>
          )}

          {stats?.totalAdvances > 0 && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailRowLabel, { color: '#D97706' }]}>
                Tổng đã tạm ứng trong tháng:
              </Text>
              <Text style={[styles.detailRowVal, { color: '#D97706', fontWeight: 'bold' }]}>
                -{formatCurrency(stats.totalAdvances)}
              </Text>
            </View>
          )}

          {totalPaidSalary > 0 && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailRowLabel, { color: '#059669' }]}>
                Đã thanh toán trong tháng:
              </Text>
              <Text style={[styles.detailRowVal, { color: '#059669', fontWeight: 'bold' }]}>
                -{formatCurrency(totalPaidSalary)}
              </Text>
            </View>
          )}

          <View style={[styles.detailRow, styles.detailRowTotal]}>
            <Text style={styles.detailRowTotalLabel}>
              {isPartiallyPaid ? 'Thực lĩnh còn lại:' : 'Thực lĩnh cuối tháng:'}
            </Text>
            <Text style={styles.detailRowTotalVal}>
              {formatCurrency(isPaid ? (salary?.monthNetSalary || salary?.finalAmount) : salary?.finalAmount)}
            </Text>
          </View>
        </View>

        {/* Danh sách các lần tạm ứng */}
        {advances.length > 0 && (
          <View style={styles.detailCard}>
            <Text style={styles.cardHeaderTitle}>
              💸 CHI TIẾT TỪNG LẦN TẠM ỨNG ({advances.length} LẦN)
            </Text>
            {advances.map((adv, idx) => (
              <View key={adv.id || idx} style={styles.listItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listItemDate}>📅 Ngày ứng: {formatDateVN(adv.date)}</Text>
                  {adv.note ? <Text style={styles.listItemNote}>Ghi chú: {adv.note}</Text> : null}
                </View>
                <Text style={styles.listItemAmountAdvance}>-{formatCurrency(adv.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Danh sách ngày nghỉ làm */}
        {leaves.length > 0 && (
          <View style={styles.detailCard}>
            <Text style={styles.cardHeaderTitle}>🏖️ LỊCH SỬ NGHỈ LÀM TRONG THÁNG</Text>
            {leaves.map((leaf, idx) => (
              <View key={leaf.id || idx} style={styles.listItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listItemDate}>📅 Ngày nghỉ: {formatDateVN(leaf.date)}</Text>
                  {leaf.note ? <Text style={styles.listItemNote}>Lý do: {leaf.note}</Text> : null}
                </View>
                <View style={styles.leaveBadge}>
                  <Text style={styles.leaveBadgeText}>
                    {leaf.shift === 'HALF' ? 'Nửa ngày (-0.5 buổi)' : 'Cả ngày (-1 buổi)'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Quy định tạm ứng lương */}
        <View style={styles.detailCard}>
          <Text style={styles.cardHeaderTitle}>💵 QUY ĐỊNH TẠM ỨNG LƯƠNG</Text>
          <View style={styles.ruleBody}>
            <Text style={styles.ruleBullet}>
              • <Text style={styles.bold}>Hạn mức ứng:</Text> Tối đa{' '}
              <Text style={styles.highlightText}>50% tiền công thực tế đã làm</Text> trong tháng.
            </Text>
            <View style={styles.formulaBox}>
              <Text style={styles.formulaTitle}>📐 CÔNG THỨC TÍNH SỐ TIỀN ĐƯỢC ỨNG THÊM:</Text>
              <Text style={styles.formulaContent}>
                Số được ứng thêm = (50% tiền công đã làm) − (Lương đã ứng trong tháng)
              </Text>
              <Text style={styles.formulaNote}>* Nếu kết quả bằng hoặc dưới 0 thì không ứng thêm.</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Render giao diện dành cho Người Chủ (Quan sát toàn bộ nhân viên & trạng thái lương)
  const renderOwnerOverview = () => {
    const employeesSalary = salaryData?.employeesSalary || [];
    const summary = salaryData?.summary || {};
    const totalDays = salaryData?.totalDaysInMonth || 30;

    // Nếu chủ đang bấm xem chi tiết 1 nhân viên
    if (selectedOwnerEmpId) {
      const targetEmpData = employeesSalary.find((item) => item.employee?.id === selectedOwnerEmpId);
      if (targetEmpData) {
        return renderSingleEmployeeSalaryDetail(targetEmpData, true);
      }
    }

    return (
      <View style={styles.ownerContainer}>
        {/* Header chế độ Chủ cơ sở */}
        <View style={styles.ownerTopBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerBannerTitle}>👑 CHẾ ĐỘ CHỦ CƠ SỞ (QUAN SÁT TẤT CẢ)</Text>
            <Text style={styles.ownerBannerSub}>
              Mã quản lý: {salaryData?.ownerCode} • Theo dõi toàn bộ lương & trạng thái từng nhân viên
            </Text>
          </View>
          <TouchableOpacity style={styles.lockBtn} onPress={handleLockAgain} activeOpacity={0.7}>
            <Text style={styles.lockBtnText}>🔒 Khóa lại</Text>
          </TouchableOpacity>
        </View>

        {/* Lưới 2 cột tổng quan tháng */}
        <View style={styles.ownerSummaryGrid}>
          <View style={styles.ownerSummaryBox}>
            <Text style={styles.ownerSumLabel}>NHÂN SỰ & TRẠNG THÁI</Text>
            <Text style={styles.ownerSumPrimary}>{summary.totalEmployees || 0} nhân viên</Text>
            <Text style={styles.ownerSumSub}>
              ✅ {summary.paidCount || 0} đã trả • 🟡 {summary.partialCount || 0} trả 1 phần • ⏳{' '}
              {summary.unpaidCount || 0} chưa trả
            </Text>
          </View>

          <View style={styles.ownerSummaryBox}>
            <Text style={styles.ownerSumLabel}>TỔNG LƯƠNG CỨNG & CÔNG</Text>
            <Text style={styles.ownerSumPrimary}>{formatCurrency(summary.totalBaseSalary)}</Text>
            <Text style={styles.ownerSumSub}>
              Tổng công: {summary.totalWorkingDays || 0} công (Lương công:{' '}
              {formatCurrency(summary.totalCalculatedSalary)})
            </Text>
          </View>

          <View style={styles.ownerSummaryBox}>
            <Text style={styles.ownerSumLabel}>TỔNG TẠM ỨNG & ĐÃ TRẢ</Text>
            <Text style={[styles.ownerSumPrimary, { color: '#DC2626' }]}>
              -{formatCurrency(summary.totalAdvances)}
            </Text>
            <Text style={styles.ownerSumSub}>
              Đã thanh toán lương: {formatCurrency(summary.totalPaidSalary)}
            </Text>
          </View>

          <View style={[styles.ownerSummaryBox, styles.ownerSummaryBoxHighlight]}>
            <Text style={[styles.ownerSumLabel, { color: '#047857' }]}>TỔNG THỰC LĨNH CÒN PHẢI TRẢ</Text>
            <Text style={[styles.ownerSumPrimary, { color: '#059669', fontSize: 16 }]}>
              {formatCurrency(summary.totalRemainingSalary)}
            </Text>
            <Text style={styles.ownerSumSub}>
              Tổng thực lĩnh tháng: {formatCurrency(summary.totalNetSalary)}
            </Text>
          </View>
        </View>

        {/* BẢNG CHI TIẾT LƯƠNG & TRẠNG THÁI TỪNG NHÂN VIÊN */}
        <View style={styles.ownerTableCard}>
          <View style={styles.ownerTableCardHeader}>
            <Text style={styles.ownerTableCardTitle}>
              📋 CHI TIẾT LƯƠNG & TRẠNG THÁI TỪNG NHÂN VIÊN ({employeesSalary.length})
            </Text>
            <Text style={styles.ownerTableCardHint}>Bấm vào dòng nhân viên để xem chi tiết</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.ownerTableMinWidth}>
              {/* Header Bảng */}
              <View style={styles.ownerTableHeaderRow}>
                <Text style={[styles.ownerTh, { width: 34, textAlign: 'center' }]}>STT</Text>
                <Text style={[styles.ownerTh, { width: 145 }]}>HỌ VÀ TÊN</Text>
                <Text style={[styles.ownerTh, { width: 100, textAlign: 'right' }]}>LƯƠNG CỨNG</Text>
                <Text style={[styles.ownerTh, { width: 78, textAlign: 'center' }]}>SỐ CÔNG</Text>
                <Text style={[styles.ownerTh, { width: 105, textAlign: 'right' }]}>LƯƠNG CÔNG</Text>
                <Text style={[styles.ownerTh, { width: 135, textAlign: 'right' }]}>TẠM ỨNG</Text>
                <Text style={[styles.ownerTh, { width: 125, textAlign: 'right' }]}>THỰC LĨNH</Text>
                <Text style={[styles.ownerTh, { width: 92, textAlign: 'center' }]}>TRẠNG THÁI</Text>
              </View>

              {/* Danh sách nhân viên */}
              {employeesSalary.map((item, idx) => {
                const emp = item.employee || {};
                const sal = item.salary || {};
                const pay = item.payment || {};
                const advList = item.advances || [];
                const isPaid = Boolean(pay.isPaid || sal.isPaid);
                const isPartiallyPaid = Boolean(pay.isPartiallyPaid || sal.isPartiallyPaid);

                return (
                  <TouchableOpacity
                    key={emp.id || idx}
                    style={[
                      styles.ownerTableRow,
                      idx % 2 === 1 && styles.ownerTableRowAlt,
                    ]}
                    onPress={() => setSelectedOwnerEmpId(emp.id)}
                    activeOpacity={0.7}
                  >
                    {/* STT */}
                    <Text style={[styles.ownerTd, { width: 34, textAlign: 'center', color: '#64748B' }]}>
                      {idx + 1}
                    </Text>

                    {/* HỌ VÀ TÊN + MÃ */}
                    <View style={{ width: 145, paddingRight: 6 }}>
                      <Text style={styles.ownerEmpName}>{emp.name}</Text>
                      <Text style={styles.ownerEmpCode}>
                        🔑 Mã: <Text style={{ fontWeight: 'bold', color: '#0369A1' }}>{emp.accessCode || '----'}</Text>
                      </Text>
                    </View>

                    {/* LƯƠNG CỨNG */}
                    <Text style={[styles.ownerTd, { width: 100, textAlign: 'right', fontWeight: '600' }]}>
                      {formatCurrency(sal.baseSalary)}
                    </Text>

                    {/* SỐ CÔNG */}
                    <View style={{ width: 78, alignItems: 'center' }}>
                      <Text style={styles.ownerWorkDaysText}>
                        {item.workingDays}/{totalDays}
                      </Text>
                      {item.startDayText ? (
                        <Text style={styles.ownerStartDaySub}>{item.startDayText}</Text>
                      ) : null}
                    </View>

                    {/* LƯƠNG CÔNG */}
                    <Text style={[styles.ownerTd, { width: 105, textAlign: 'right', fontWeight: '600' }]}>
                      {formatCurrency(sal.calculatedSalary)}
                    </Text>

                    {/* TẠM ỨNG (Tách từng lần ứng) */}
                    <View style={{ width: 135, alignItems: 'flex-end' }}>
                      {advList.length > 0 ? (
                        advList.map((adv, aIdx) => {
                          const dShort = formatShortDate(adv.date);
                          return (
                            <Text key={adv.id || aIdx} style={styles.ownerAdvanceItemText}>
                              {dShort ? `(${dShort}) ` : ''}-{formatCurrency(adv.amount)}
                            </Text>
                          );
                        })
                      ) : sal.totalAdvances > 0 ? (
                        <Text style={styles.ownerAdvanceItemText}>
                          -{formatCurrency(sal.totalAdvances)}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 12, color: '#94A3B8' }}>-</Text>
                      )}
                    </View>

                    {/* THỰC LĨNH (Kèm đơn giá ngày & đã trả 1 phần) */}
                    <View style={{ width: 125, alignItems: 'flex-end' }}>
                      <Text style={styles.ownerNetSalaryText}>
                        {formatCurrency(isPaid ? sal.monthNetSalary : sal.finalAmount)}
                      </Text>
                      <Text style={styles.ownerDailySubText}>
                        (~{formatCurrency(sal.dailySalary)}/ngày)
                      </Text>
                      {isPartiallyPaid && sal.totalPaidSalary > 0 ? (
                        <Text style={styles.ownerPaidPartSubText}>
                          (Đã trả: {formatCurrency(sal.totalPaidSalary)})
                        </Text>
                      ) : null}
                    </View>

                    {/* TRẠNG THÁI */}
                    <View style={{ width: 92, alignItems: 'center' }}>
                      <View
                        style={[
                          styles.ownerStatusBadge,
                          isPaid
                            ? styles.ownerStatusBadgePaid
                            : isPartiallyPaid
                            ? styles.ownerStatusBadgePartial
                            : styles.ownerStatusBadgeUnpaid,
                        ]}
                      >
                        <Text
                          style={[
                            styles.ownerStatusBadgeText,
                            isPaid
                              ? styles.ownerStatusTextPaid
                              : isPartiallyPaid
                              ? styles.ownerStatusTextPartial
                              : styles.ownerStatusTextUnpaid,
                          ]}
                        >
                          {isPaid ? 'Đã trả' : isPartiallyPaid ? 'Trả 1 phần' : 'Chưa trả'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Dòng TỔNG CỘNG cuối bảng */}
              <View style={styles.ownerTableFooterRow}>
                <Text style={[styles.ownerFooterText, { width: 179 }]}>
                  TỔNG CỘNG ({employeesSalary.length} NV)
                </Text>
                <Text style={[styles.ownerFooterText, { width: 100, textAlign: 'right' }]}>
                  {formatCurrency(summary.totalBaseSalary)}
                </Text>
                <Text style={[styles.ownerFooterText, { width: 78, textAlign: 'center' }]}>
                  {summary.totalWorkingDays} công
                </Text>
                <Text style={[styles.ownerFooterText, { width: 105, textAlign: 'right' }]}>
                  {formatCurrency(summary.totalCalculatedSalary)}
                </Text>
                <Text
                  style={[
                    styles.ownerFooterText,
                    { width: 135, textAlign: 'right', color: '#DC2626' },
                  ]}
                >
                  {summary.totalAdvances > 0 ? `-${formatCurrency(summary.totalAdvances)}` : '-'}
                </Text>
                <Text
                  style={[
                    styles.ownerFooterText,
                    { width: 125, textAlign: 'right', color: '#059669', fontSize: 13.5 },
                  ]}
                >
                  {formatCurrency(summary.totalRemainingSalary)}
                </Text>
                <View style={{ width: 92 }} />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    );
  };

  // Loading ban đầu
  if (initLoading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <ActivityIndicator size="large" color="#0284C7" />
        <Text style={styles.loadingText}>Đang tải cổng kiểm tra lương...</Text>
      </SafeAreaView>
    );
  }

  // Lỗi ban đầu
  if (initError) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Không Thể Mở Cổng Tra Cứu Lương</Text>
          <Text style={styles.errorDesc}>{initError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadPortalInfo} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const merchantName = portalInfo?.merchantName || salaryData?.merchantName || 'Cửa hàng';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* HEADER CỔNG KIỂM TRA BẢNG LƯƠNG (TINH GỌN, KHÔNG DÙNG TAB THỪA) */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.merchantTitle} numberOfLines={1}>🏪 {merchantName}</Text>
          <Text style={styles.portalSubTitle}>BẢNG LƯƠNG & CHẤM CÔNG THÁNG NÀY</Text>
        </View>
        <View style={styles.secureBadge}>
          <Text style={styles.secureBadgeText}>🛡️ Bảo mật</Text>
        </View>
      </View>

      {/* NỘI DUNG TAB BẢNG LƯƠNG */}
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!isUnlocked ? (
          /* KHỐI NHẬP MÃ XÁC THỰC MỞ KHÓA */
          <View style={styles.authCard}>
            <View style={styles.authIconWrap}>
              <Text style={styles.authIcon}>🔐</Text>
            </View>
            <Text style={styles.authTitle}>NHẬP MÃ XÁC THỰC KIỂM TRA LƯƠNG</Text>
            <Text style={styles.authSub}>
              Mỗi nhân viên được cấp 1 mã xác thực riêng biệt. Vui lòng nhập mã của bạn để xem thông tin lương tháng này:
            </Text>

            {/* Ô nhập Mã xác thực */}
            <View style={styles.pinSection}>
              <Text style={styles.fieldLabel}>🔑 Mã xác thực của bạn:</Text>
              <View style={styles.pinInputWrap}>
                <TextInput
                  style={styles.pinInput}
                  placeholder="Nhập mã xác thực..."
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={10}
                  value={pinInput}
                  onChangeText={(text) => {
                    setPinInput(text);
                    setPinError('');
                  }}
                  onSubmitEditing={handleUnlockWithCode}
                />
              </View>
            </View>

            {pinError ? <Text style={styles.pinErrorText}>⚠️ {pinError}</Text> : null}

            <TouchableOpacity
              style={[styles.unlockBtn, verifying && { opacity: 0.7 }]}
              onPress={handleUnlockWithCode}
              disabled={verifying}
              activeOpacity={0.8}
            >
              {verifying ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.unlockBtnText}>XÁC THỰC & XEM BẢNG LƯƠNG 🔓</Text>
              )}
            </TouchableOpacity>

            <View style={styles.roleGuideBox}>
              <Text style={styles.roleGuideItem}>
                👤 <Text style={styles.bold}>Nhân viên:</Text> Nhập mã cá nhân được cấp để xem bảng lương, ngày công và tạm ứng của riêng mình.
              </Text>
              <Text style={styles.roleGuideItem}>
                👑 <Text style={styles.bold}>Chủ cơ sở:</Text> Nhập mã quản lý của chủ để quan sát toàn bộ thông tin & trạng thái lương của tất cả nhân viên.
              </Text>
              <Text style={[styles.roleGuideItem, { color: '#0369A1', marginTop: 4, fontWeight: '500' }]}>
                💾 <Text style={styles.bold}>Ghi nhớ tự động:</Text> Sau khi nhập đúng mã lần đầu, hệ thống sẽ tự động lưu trên máy này. Những lần sau vào link sẽ mở xem ngay mà không cần nhập lại mã.
              </Text>
            </View>
          </View>
        ) : (
          /* KHỐI HIỂN THỊ DỮ LIỆU SAU KHI NHẬP MÃ THÀNH CÔNG */
          <View style={styles.salarySection}>
            {/* Điều khiển chọn tháng */}
            <View style={styles.monthSelector}>
              <TouchableOpacity style={styles.monthArrowBtn} onPress={() => adjustMonth(-1)}>
                <Text style={styles.monthArrowText}>◀️ Tháng trước</Text>
              </TouchableOpacity>
              <View style={styles.monthCenter}>
                <Text style={styles.monthCenterLabel}>Kỳ lương tra cứu</Text>
                <Text style={styles.monthCenterValue}>Tháng {monthKey}</Text>
              </View>
              <TouchableOpacity style={styles.monthArrowBtn} onPress={() => adjustMonth(1)}>
                <Text style={styles.monthArrowText}>Tháng sau ▶️</Text>
              </TouchableOpacity>
            </View>

            {dataLoading ? (
              <ActivityIndicator size="large" color="#0284C7" style={{ marginVertical: 30 }} />
            ) : dataError ? (
              <Text style={styles.dataErrorText}>⚠️ {dataError}</Text>
            ) : salaryData?.isOwnerView ? (
              renderOwnerOverview()
            ) : (
              renderSingleEmployeeSalaryDetail(salaryData, false)
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  topBarLeft: {
    flex: 1,
  },
  merchantTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  portalSubTitle: {
    fontSize: 11.5,
    color: '#0284C7',
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  secureBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  secureBadgeText: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: 'bold',
  },
  scrollContent: {
    flex: 1,
  },
  authCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    maxWidth: 480,
    alignSelf: 'center',
    width: '92%',
  },
  authIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  authIcon: {
    fontSize: 28,
  },
  authTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  authSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 8,
  },
  pinSection: {
    width: '100%',
    marginBottom: 12,
  },
  pinInputWrap: {
    width: '100%',
  },
  pinInput: {
    backgroundColor: '#F8FAFC',
    height: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 16,
    fontSize: 18,
    color: '#0F172A',
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 4,
  },
  pinErrorText: {
    color: '#EF4444',
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  unlockBtn: {
    width: '100%',
    height: 46,
    backgroundColor: '#0284C7',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  unlockBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  roleGuideBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  roleGuideItem: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  salarySection: {
    padding: 12,
  },
  singleDetailContainer: {
    gap: 0,
  },
  backToTableBtn: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#7DD3FC',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
    alignItems: 'center',
  },
  backToTableBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  employeeBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  employeeBarLeft: {
    flex: 1,
  },
  employeeBarName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  employeeBarRole: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  lockBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  lockBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  monthArrowBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  monthArrowText: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: 'bold',
  },
  monthCenter: {
    alignItems: 'center',
  },
  monthCenterLabel: {
    fontSize: 10,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  monthCenterValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  netSalaryCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  netSalaryLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  netSalaryAmount: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#10B981',
    marginVertical: 8,
  },
  netSalaryStatusWrap: {
    marginTop: 4,
  },
  netSalaryStatus: {
    fontSize: 11,
    fontWeight: 'bold',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPaid: {
    backgroundColor: '#064E3B',
    color: '#34D399',
  },
  statusPartial: {
    backgroundColor: '#78350F',
    color: '#FCD34D',
  },
  statusUnpaid: {
    backgroundColor: '#451A03',
    color: '#FBBF24',
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  cardHeaderTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailRowLabel: {
    fontSize: 13,
    color: '#475569',
  },
  detailRowVal: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  detailRowTotal: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailRowTotalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  detailRowTotalVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  listItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#F8FAFC',
  },
  listItemDate: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  listItemNote: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  listItemAmountAdvance: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  leaveBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  leaveBadgeText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  dataErrorText: {
    color: '#EF4444',
    textAlign: 'center',
    marginVertical: 20,
    fontSize: 13,
  },
  ruleBody: {
    gap: 6,
  },
  ruleBullet: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
  },
  ruleTextAlert: {
    fontSize: 12.5,
    color: '#B91C1C',
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECDD3',
    lineHeight: 18,
    marginVertical: 4,
  },
  bold: {
    fontWeight: 'bold',
  },
  highlightText: {
    fontWeight: 'bold',
    color: '#0284C7',
  },
  formulaBox: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginVertical: 6,
  },
  formulaTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0369A1',
    marginBottom: 4,
  },
  formulaContent: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#0C4A6E',
    lineHeight: 18,
  },
  formulaNote: {
    fontSize: 11,
    color: '#0284C7',
    fontStyle: 'italic',
    marginTop: 4,
  },
  // ─── STYLES DÀNH CHO CHẾ ĐỘ CHỦ CƠ SỞ (OWNER VIEW) ───
  ownerContainer: {
    gap: 12,
  },
  ownerTopBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  ownerBannerTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#92400E',
  },
  ownerBannerSub: {
    fontSize: 11.5,
    color: '#B45309',
    marginTop: 2,
  },
  ownerSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ownerSummaryBox: {
    width: '48.5%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ownerSummaryBoxHighlight: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  ownerSumLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 3,
  },
  ownerSumPrimary: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  ownerSumSub: {
    fontSize: 11,
    color: '#475569',
    marginTop: 3,
    lineHeight: 15,
  },
  ownerTableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  ownerTableCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 4,
  },
  ownerTableCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  ownerTableCardHint: {
    fontSize: 11,
    color: '#0284C7',
    fontStyle: 'italic',
  },
  ownerTableMinWidth: {
    minWidth: 814,
  },
  ownerTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  ownerTh: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ownerTableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  ownerTableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  ownerTd: {
    fontSize: 12.5,
    color: '#0F172A',
  },
  ownerEmpName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  ownerEmpCode: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  ownerWorkDaysText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0284C7',
  },
  ownerStartDaySub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0369A1',
    marginTop: 1,
  },
  ownerAdvanceItemText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 2,
  },
  ownerNetSalaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  ownerDailySubText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  ownerPaidPartSubText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#D97706',
    marginTop: 1,
  },
  ownerStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ownerStatusBadgePaid: {
    backgroundColor: '#DCFCE7',
  },
  ownerStatusBadgePartial: {
    backgroundColor: '#FEF3C7',
  },
  ownerStatusBadgeUnpaid: {
    backgroundColor: '#F1F5F9',
  },
  ownerStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  ownerStatusTextPaid: {
    color: '#15803D',
  },
  ownerStatusTextPartial: {
    color: '#B45309',
  },
  ownerStatusTextUnpaid: {
    color: '#475569',
  },
  ownerTableFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopWidth: 1.5,
    borderTopColor: '#0284C7',
  },
  ownerFooterText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0369A1',
  },
  errorCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECDD3',
    maxWidth: 360,
  },
  errorIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#991B1B',
    marginBottom: 8,
  },
  errorDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  retryBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
