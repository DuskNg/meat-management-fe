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
  return new Intl.NumberFormat('vi-VN').format(Math.round(val)) + ' đ';
};

const formatDateVN = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

export default function EmployeeSalaryPortalScreen() {
  const { token } = useLocalSearchParams();

  // Tab chính của cổng: 'SALARY' (Bảng lương) hoặc 'RULES' (Nội quy quy định)
  const [activeTab, setActiveTab] = useState('SALARY');

  // State thông tin ban đầu
  const [initLoading, setInitLoading] = useState(true);
  const [portalInfo, setPortalInfo] = useState(null);
  const [initError, setInitError] = useState('');

  // State chọn nhân viên (đối với link chung)
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [selectedEmp, setSelectedEmp] = useState(null);

  // State xác thực PIN
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

  // 1. Tải thông tin ban đầu của token khi mở link
  useEffect(() => {
    if (!token) return;
    loadPortalInfo();
  }, [token]);

  const loadPortalInfo = async () => {
    try {
      setInitLoading(true);
      setInitError('');
      // Ưu tiên gọi API staff portal chung
      const res = await axios.get(`${API_HOST}/api/v1/portal/staff/info/${token}`);
      if (res.data?.success) {
        const info = res.data.data;
        setPortalInfo(info);

        if (info.isGeneral) {
          // Link chung: Nếu có danh sách nhân viên, chọn người đầu tiên làm mặc định
          if (info.employees && info.employees.length > 0) {
            setSelectedEmpId(info.employees[0].id);
            setSelectedEmp(info.employees[0]);
          }
        } else {
          // Link riêng 1 nhân viên
          if (!info.hasPin) {
            setIsUnlocked(true);
            fetchSalaryData(monthKey, '', info.employeeId);
          }
        }
      }
    } catch (err) {
      console.error('Lỗi tải thông tin portal nhân viên:', err);
      // Fallback thử link cũ nếu lỗi
      try {
        const fallbackRes = await axios.get(`${API_HOST}/api/v1/portal/employee-salary/info/${token}`);
        if (fallbackRes.data?.success) {
          const info = fallbackRes.data.data;
          setPortalInfo({ ...info, isGeneral: false });
          if (!info.hasPin) {
            setIsUnlocked(true);
            fetchSalaryData(monthKey, '', info.employeeId);
          }
          return;
        }
      } catch (_) {}
      setInitError(err.response?.data?.message || 'Đường dẫn tra cứu không hợp lệ hoặc đã hết hạn.');
    } finally {
      setInitLoading(false);
    }
  };

  // 2. Xác thực PIN mở khóa bảng lương
  const handleUnlockWithPin = async () => {
    const empId = portalInfo?.isGeneral ? selectedEmpId : portalInfo?.employeeId;
    if (!empId) {
      setPinError('Vui lòng chọn nhân viên cần tra cứu.');
      return;
    }

    const currentTarget = portalInfo?.isGeneral
      ? portalInfo?.employees?.find((e) => e.id === empId)
      : portalInfo;

    if (currentTarget?.hasPin && !pinInput.trim()) {
      setPinError('Vui lòng nhập 4 số cuối số điện thoại của bạn.');
      return;
    }

    setVerifying(true);
    setPinError('');
    try {
      await fetchSalaryData(monthKey, pinInput.trim(), empId);
      setIsUnlocked(true);
    } catch (err) {
      setPinError(err.response?.data?.message || 'Mã PIN không đúng, vui lòng kiểm tra lại 4 số cuối SĐT.');
    } finally {
      setVerifying(false);
    }
  };

  // 3. Tải chi tiết dữ liệu lương
  const fetchSalaryData = async (targetMonth, targetPin, empId) => {
    setDataLoading(true);
    setDataError('');
    try {
      const pinToUse = targetPin !== undefined ? targetPin : pinInput.trim();
      const targetId = empId || (portalInfo?.isGeneral ? selectedEmpId : portalInfo?.employeeId);

      const url = portalInfo?.isGeneral
        ? `${API_HOST}/api/v1/portal/staff/salary/${token}?employeeId=${targetId}&monthKey=${targetMonth}&pin=${encodeURIComponent(pinToUse)}`
        : `${API_HOST}/api/v1/portal/employee-salary/data/${token}?monthKey=${targetMonth}&pin=${encodeURIComponent(pinToUse)}`;

      const res = await axios.get(url, {
        headers: { 'x-portal-pin': pinToUse },
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
    fetchSalaryData(newMonthKey, pinInput.trim()).catch(() => {});
  };

  // Đổi sang nhân viên khác
  const handleLockAgain = () => {
    setIsUnlocked(false);
    setPinInput('');
    setPinError('');
    setSalaryData(null);
  };

  // Loading ban đầu
  if (initLoading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <ActivityIndicator size="large" color="#0284C7" />
        <Text style={styles.loadingText}>Đang tải cổng thông tin nhân sự...</Text>
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
          <Text style={styles.errorTitle}>Không Thể Mở Cổng Nhân Sự</Text>
          <Text style={styles.errorDesc}>{initError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadPortalInfo} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const salary = salaryData?.salary;
  const stats = salaryData?.stats;
  const leaves = salaryData?.leaves || [];
  const advances = salaryData?.advances || [];
  const employee = salaryData?.employee;
  const merchantName = portalInfo?.merchantName || salaryData?.merchantName || 'Cửa hàng';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* HEADER CỔNG NHÂN SỰ CHUNG */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.merchantTitle}>🏪 {merchantName}</Text>
          <Text style={styles.portalSubTitle}>CỔNG THÔNG TIN NHÂN SỰ & QUY ĐỊNH</Text>
        </View>
        <View style={styles.secureBadge}>
          <Text style={styles.secureBadgeText}>🛡️ Nội bộ</Text>
        </View>
      </View>

      {/* THANH CHUYỂN TAB CHÍNH */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'SALARY' && styles.tabItemActive]}
          onPress={() => setActiveTab('SALARY')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabItemText, activeTab === 'SALARY' && styles.tabItemTextActive]}>
            💰 BẢNG LƯƠNG
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'RULES' && styles.tabItemActive]}
          onPress={() => setActiveTab('RULES')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabItemText, activeTab === 'RULES' && styles.tabItemTextActive]}>
            📜 NỘI QUY & QUY ĐỊNH
          </Text>
        </TouchableOpacity>
      </View>

      {/* NỘI DUNG THEO TAB */}
      {activeTab === 'SALARY' ? (
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {!isUnlocked ? (
            /* KHỐI XÁC THỰC MỞ KHÓA BẢNG LƯƠNG */
            <View style={styles.authCard}>
              <View style={styles.authIconWrap}>
                <Text style={styles.authIcon}>🔐</Text>
              </View>
              <Text style={styles.authTitle}>TRA CỨU BẢNG LƯƠNG CÁ NHÂN</Text>
              <Text style={styles.authSub}>
                Để bảo mật thu nhập riêng tư, vui lòng chọn tên của bạn và nhập 4 số cuối số điện thoại cá nhân:
              </Text>

              {/* Danh sách chọn nhân viên (nếu là link chung) */}
              {portalInfo?.isGeneral && (
                <View style={styles.empSelectSection}>
                  <Text style={styles.fieldLabel}>👤 Bạn là ai? (Chọn tên của bạn):</Text>
                  <View style={styles.empChipsList}>
                    {(portalInfo.employees || []).map((emp) => {
                      const isSelected = selectedEmpId === emp.id;
                      return (
                        <TouchableOpacity
                          key={emp.id}
                          style={[styles.empChip, isSelected && styles.empChipSelected]}
                          onPress={() => {
                            setSelectedEmpId(emp.id);
                            setSelectedEmp(emp);
                            setPinError('');
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.empChipText, isSelected && styles.empChipTextSelected]}>
                            {emp.name} {emp.role ? `(${emp.role})` : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Ô nhập PIN */}
              <View style={styles.pinSection}>
                <Text style={styles.fieldLabel}>🔒 Nhập 4 số cuối số điện thoại của bạn:</Text>
                <View style={styles.pinInputWrap}>
                  <TextInput
                    style={styles.pinInput}
                    placeholder="Ví dụ: 6655"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                    value={pinInput}
                    onChangeText={(text) => {
                      setPinInput(text);
                      setPinError('');
                    }}
                    onSubmitEditing={handleUnlockWithPin}
                  />
                </View>
              </View>

              {pinError ? <Text style={styles.pinErrorText}>⚠️ {pinError}</Text> : null}

              <TouchableOpacity
                style={[styles.unlockBtn, verifying && { opacity: 0.7 }]}
                onPress={handleUnlockWithPin}
                disabled={verifying}
                activeOpacity={0.8}
              >
                {verifying ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.unlockBtnText}>MỞ KHÓA BẢNG LƯƠNG 🔓</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.securityNotice}>
                🛡️ Mật khẩu là 4 số cuối số điện thoại của bạn đã đăng ký với cửa hàng. Không ai có thể xem trộm lương của người khác.
              </Text>
            </View>
          ) : (
            /* KHỐI HIỂN THỊ CHI TIẾT BẢNG LƯƠNG ĐÃ MỞ KHÓA */
            <View style={styles.salarySection}>
              {/* Thanh thông tin người xem & nút khóa lại */}
              <View style={styles.employeeBar}>
                <View style={styles.employeeBarLeft}>
                  <Text style={styles.employeeBarName}>👤 {employee?.name || selectedEmp?.name}</Text>
                  <Text style={styles.employeeBarRole}>{employee?.role ? `💼 ${employee.role}` : '💼 Nhân viên'}</Text>
                </View>
                {portalInfo?.isGeneral && (
                  <TouchableOpacity style={styles.lockBtn} onPress={handleLockAgain} activeOpacity={0.7}>
                    <Text style={styles.lockBtnText}>🔒 Khóa lại</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Điều khiển chọn tháng */}
              <View style={styles.monthSelector}>
                <TouchableOpacity style={styles.monthArrowBtn} onPress={() => adjustMonth(-1)}>
                  <Text style={styles.monthArrowText}>◀️ Tháng trước</Text>
                </TouchableOpacity>
                <View style={styles.monthCenter}>
                  <Text style={styles.monthCenterLabel}>Kỳ lương</Text>
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
              ) : (
                <>
                  {/* Card Lương thực lĩnh */}
                  <View style={styles.netSalaryCard}>
                    <Text style={styles.netSalaryLabel}>LƯƠNG THỰC LĨNH THÁNG {monthKey}</Text>
                    <Text style={styles.netSalaryAmount}>{formatCurrency(salary?.finalAmount)}</Text>
                    <View style={styles.netSalaryStatusWrap}>
                      <Text style={[styles.netSalaryStatus, salaryData?.payment?.isPaid ? styles.statusPaid : styles.statusUnpaid]}>
                        {salaryData?.payment?.isPaid ? '✅ ĐÃ THANH TOÁN' : '⏳ ĐANG TÍNH TOÁN / CHỜ THANH TOÁN'}
                      </Text>
                    </View>
                  </View>

                  {/* Chi tiết tính lương */}
                  <View style={styles.detailCard}>
                    <Text style={styles.cardHeaderTitle}>📊 CHI TIẾT TÍNH LƯƠNG</Text>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailRowLabel}>Lương cơ bản tháng:</Text>
                      <Text style={styles.detailRowVal}>{formatCurrency(salary?.baseSalary)}</Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailRowLabel}>
                        Đơn giá 1 ngày công ({salaryData?.totalDaysInMonth} ngày):
                      </Text>
                      <Text style={styles.detailRowVal}>~{formatCurrency(salary?.dailySalary)}/buổi</Text>
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
                          Đã tạm ứng trong tháng:
                        </Text>
                        <Text style={[styles.detailRowVal, { color: '#D97706', fontWeight: 'bold' }]}>
                          -{formatCurrency(stats.totalAdvances)}
                        </Text>
                      </View>
                    )}

                    <View style={[styles.detailRow, styles.detailRowTotal]}>
                      <Text style={styles.detailRowTotalLabel}>Thực lĩnh cuối tháng:</Text>
                      <Text style={styles.detailRowTotalVal}>{formatCurrency(salary?.finalAmount)}</Text>
                    </View>
                  </View>

                  {/* Danh sách các lần tạm ứng */}
                  {advances.length > 0 && (
                    <View style={styles.detailCard}>
                      <Text style={styles.cardHeaderTitle}>💸 LỊCH SỬ TẠM ỨNG TRONG THÁNG</Text>
                      {advances.map((adv, idx) => (
                        <View key={adv.id || idx} style={styles.listItemRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.listItemDate}>📅 Ngày: {formatDateVN(adv.date)}</Text>
                            {adv.note ? <Text style={styles.listItemNote}>Lý do: {adv.note}</Text> : null}
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

                  {/* QUY ĐỊNH TẠM ỨNG LƯƠNG (CHUYỂN SANG TAB BẢNG LƯƠNG) */}
                  <View style={styles.detailCard}>
                    <Text style={styles.cardHeaderTitle}>💵 QUY ĐỊNH TẠM ỨNG LƯƠNG</Text>
                    <View style={styles.ruleBody}>
                      <Text style={styles.ruleBullet}>
                        • <Text style={styles.bold}>Hạn mức ứng:</Text> Tối đa <Text style={styles.highlightText}>50% tiền công thực tế đã làm</Text> trong tháng (không tính lãi, cửa hàng đồng ý).
                      </Text>
                      <View style={styles.formulaBox}>
                        <Text style={styles.formulaTitle}>📐 CÔNG THỨC TÍNH SỐ TIỀN ĐƯỢC ỨNG THÊM:</Text>
                        <Text style={styles.formulaContent}>
                          Số được ứng thêm = (50% tiền công đã làm) − (Lương đã ứng trong tháng)
                        </Text>
                        <Text style={styles.formulaNote}>* Nếu kết quả bằng hoặc dưới 0 thì không ứng thêm.</Text>
                      </View>
                      <Text style={styles.ruleBullet}>
                        • <Text style={styles.bold}>Đối chiếu & khấu trừ:</Text> Mỗi lần ứng ghi rõ ngày và số tiền để trừ khi chốt lương cuối tháng hoặc khi nghỉ việc.
                      </Text>
                      <Text style={styles.ruleTextAlert}>
                        ⛔ Tuyệt đối không tự ý lấy tiền bán hàng hoặc tiền thu hộ để tạm ứng.
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        /* TAB 2: NỘI QUY QUY ĐỊNH CỦA CỬA HÀNG */
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.rulesContainer}>
            {/* MỤC 1: GIỜ GIẤC & TRÁCH NHIỆM LÀM VIỆC (ĐƯA LÊN ĐẦU) */}
            <View style={styles.ruleCard}>
              <View style={styles.ruleCardHeader}>
                <Text style={styles.ruleCardTitle}>⏰ 1. GIỜ GIẤC & TRÁCH NHIỆM LÀM VIỆC</Text>
              </View>
              <View style={styles.ruleBody}>
                <Text style={styles.ruleBullet}>
                  • <Text style={styles.bold}>Vào ca lúc 03h sáng:</Text> Đi làm đúng giờ, không tự ý bỏ ca (việc đột xuất phải báo trước cho quản lý).
                </Text>
                <Text style={styles.ruleBullet}>
                  • <Text style={styles.bold}>Soạn & giao hàng:</Text> Đúng loại thịt, đúng cân, đủ túi; lấy đủ chữ ký/xác nhận của khách.
                </Text>
                <Text style={styles.ruleBullet}>
                  • <Text style={styles.bold}>Vệ sinh & an toàn:</Text> Rửa sạch dao/thớt/máy và dọn khu vực sau ca; tuân thủ an toàn dao, máy, xe.
                </Text>
                <Text style={styles.ruleBullet}>
                  • <Text style={styles.bold}>Cam kết hai bên:</Text> Cửa hàng cấp đồ bảo hộ, bảo đảm an toàn, trả lương đúng hạn và lắng nghe nhân viên giải thích khi có sai sót (không phạt tiền, không cắt lương trái luật).
                </Text>
              </View>
            </View>

            {/* MỤC 2: CHẾ ĐỘ THƯỞNG & ĐÃI NGỘ (CHO XUỐNG DƯỚI) */}
            <View style={styles.ruleCard}>
              <View style={styles.ruleCardHeader}>
                <Text style={styles.ruleCardTitle}>🎁 2. CHẾ ĐỘ THƯỞNG & TĂNG LƯƠNG</Text>
              </View>
              <View style={styles.ruleBody}>
                <Text style={styles.ruleBullet}>
                  • <Text style={styles.bold}>Thưởng trách nhiệm (200.000đ/tháng):</Text> Đi làm đúng giờ, đủ công, không vi phạm quy định.
                </Text>
                <Text style={styles.ruleBullet}>
                  • <Text style={styles.bold}>Thưởng thâm niên (xét mỗi kỳ 06 tháng):</Text>
                </Text>
                <View style={styles.subBulletList}>
                  <Text style={styles.subBulletText}>- Mất thưởng trách nhiệm ≤ 1 tháng: thưởng <Text style={styles.bold}>1.500.000đ</Text></Text>
                  <Text style={styles.subBulletText}>- Mất thưởng trách nhiệm 2 tháng: thưởng <Text style={styles.bold}>1.000.000đ</Text></Text>
                  <Text style={styles.subBulletText}>- Từ 3 tháng không đạt: không thưởng kỳ đó</Text>
                </View>
                <Text style={styles.ruleBullet}>
                  • <Text style={styles.bold}>Thưởng lễ tết (200.000đ/dịp):</Text> Tết Dương lịch 1/1, Giỗ Tổ 10/3 ÂL, 30/4 - 1/5, Quốc khánh 2/9.
                </Text>
                <Text style={styles.ruleBullet}>
                  • <Text style={styles.bold}>Xét tăng lương:</Text> Định kỳ 12 tháng/lần theo tay nghề và chất lượng công việc (hai bên thống nhất).
                </Text>
              </View>
            </View>

            {/* MỤC 3: NGHỈ VIỆC & BÀN GIAO */}
            <View style={styles.ruleCard}>
              <View style={styles.ruleCardHeader}>
                <Text style={styles.ruleCardTitle}>🚪 3. NGHỈ VIỆC & BÀN GIAO</Text>
              </View>
              <View style={styles.ruleBody}>
                <Text style={styles.ruleBullet}>
                  • <Text style={styles.bold}>Thông báo trước 15 ngày:</Text> Nhân viên có nguyện vọng nghỉ việc cần báo trước 15 ngày để cửa hàng thu xếp nhân sự.
                </Text>
                <Text style={styles.ruleBullet}>
                  • <Text style={styles.bold}>Bàn giao đầy đủ:</Text> Bàn giao công việc, thịt hàng, tiền bạc và dụng cụ làm việc trước khi nghỉ.
                </Text>
                <Text style={styles.ruleBullet}>
                  • <Text style={styles.bold}>Quyết toán quyền lợi:</Text> Cửa hàng đối chiếu và thanh toán đầy đủ lương cùng toàn bộ quyền lợi theo quy định.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
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
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#0284C7',
  },
  tabItemText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
  tabItemTextActive: {
    color: '#0284C7',
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
  },
  authIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  authIcon: {
    fontSize: 28,
  },
  authTitle: {
    fontSize: 17,
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
  empSelectSection: {
    width: '100%',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 8,
  },
  empChipsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  empChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  empChipSelected: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
  },
  empChipText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  empChipTextSelected: {
    color: '#0369A1',
    fontWeight: 'bold',
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
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F172A',
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 4,
  },
  pinErrorText: {
    color: '#EF4444',
    fontSize: 12,
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
    marginTop: 6,
  },
  unlockBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  securityNotice: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
  },
  salarySection: {
    padding: 14,
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
    color: '#D97706',
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
  rulesContainer: {
    padding: 14,
  },
  ruleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  ruleCardHeader: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  ruleCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  ruleBody: {
    gap: 6,
  },
  ruleBullet: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
  },
  subBulletList: {
    paddingLeft: 12,
    gap: 3,
    marginVertical: 2,
  },
  subBulletText: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 18,
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
  exampleBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginVertical: 6,
  },
  exampleTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 4,
  },
  exampleText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  highlightSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  highlightSectionTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 4,
  },
  highlightSectionText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 17,
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
