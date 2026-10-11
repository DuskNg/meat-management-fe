// meat-management-fe/app/portal/salary/[token].js
import React, { useState, useEffect, useRef } from 'react';
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
  Linking,
  Platform,
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

  // State thông tin ban đầu & xác thực PIN
  const [initLoading, setInitLoading] = useState(true);
  const [portalInfo, setPortalInfo] = useState(null);
  const [initError, setInitError] = useState('');

  // State xác thực PIN
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // State dữ liệu lương & chấm công
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
      const res = await axios.get(`${API_HOST}/api/v1/portal/employee-salary/info/${token}`);
      if (res.data?.success) {
        const info = res.data.data;
        setPortalInfo(info);
        if (!info.hasPin) {
          // Không yêu cầu PIN thì mở khóa luôn
          setIsUnlocked(true);
          fetchSalaryData(monthKey, '');
        }
      }
    } catch (err) {
      console.error('Lỗi tải thông tin portal nhân viên:', err);
      setInitError(err.response?.data?.message || 'Đường dẫn tra cứu không hợp lệ hoặc đã hết hạn.');
    } finally {
      setInitLoading(false);
    }
  };

  // 2. Xác thực PIN
  const handleUnlockWithPin = async () => {
    if (!pinInput.trim()) {
      setPinError('Vui lòng nhập 4 số cuối số điện thoại của bạn.');
      return;
    }
    setVerifying(true);
    setPinError('');
    try {
      await fetchSalaryData(monthKey, pinInput.trim());
      setIsUnlocked(true);
    } catch (err) {
      setPinError(err.response?.data?.message || 'Mã PIN không đúng, vui lòng thử lại.');
    } finally {
      setVerifying(false);
    }
  };

  // 3. Tải chi tiết dữ liệu lương & chấm công theo tháng
  const fetchSalaryData = async (targetMonth, targetPin) => {
    setDataLoading(true);
    setDataError('');
    try {
      const pinToUse = targetPin !== undefined ? targetPin : pinInput.trim();
      const res = await axios.get(
        `${API_HOST}/api/v1/portal/employee-salary/data/${token}?monthKey=${targetMonth}&pin=${encodeURIComponent(pinToUse)}`,
        {
          headers: {
            'x-portal-pin': pinToUse,
          },
        }
      );
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

  // 4. Chuyển đổi tháng trước / tháng sau
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

  // Màn hình loading ban đầu
  if (initLoading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <ActivityIndicator size="large" color="#0284C7" />
        <Text style={styles.loadingText}>Đang tải phiếu lương điện tử...</Text>
      </SafeAreaView>
    );
  }

  // Màn hình lỗi liên kết
  if (initError) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Không Thể Mở Phiếu Lương</Text>
          <Text style={styles.errorDesc}>{initError}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={loadPortalInfo}
            activeOpacity={0.8}
          >
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Màn hình nhập mã PIN bảo mật
  if (!isUnlocked && portalInfo?.hasPin) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F0F9FF" />
        <View style={styles.authCard}>
          <View style={styles.authIconWrap}>
            <Text style={styles.authIcon}>🔐</Text>
          </View>
          <Text style={styles.authTitle}>XÁC THỰC MỞ PHIẾU LƯƠNG</Text>
          <Text style={styles.authSub}>
            Chào <Text style={{ fontWeight: 'bold', color: '#0F172A' }}>{portalInfo.employeeName}</Text>! Để bảo mật thông tin thu nhập cá nhân, vui lòng nhập mã PIN mở khóa:
          </Text>

          <View style={styles.pinHintBox}>
            <Text style={styles.pinHintText}>💡 Mật khẩu: {portalInfo.pinHint}</Text>
          </View>

          <View style={styles.pinInputWrap}>
            <TextInput
              style={styles.pinInput}
              placeholder="Nhập 4 số PIN"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              value={pinInput}
              onChangeText={(text) => {
                setPinInput(text);
                setPinError('');
              }}
              onSubmitEditing={handleUnlockWithPin}
            />
          </View>

          {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}

          <TouchableOpacity
            style={[styles.unlockBtn, verifying && { opacity: 0.7 }]}
            onPress={handleUnlockWithPin}
            disabled={verifying}
            activeOpacity={0.8}
          >
            {verifying ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.unlockBtnText}>XÁC NHẬN MỞ KHÓA 🔓</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.merchantFooterText}>
            Hệ thống quản lý: {portalInfo.merchantName || 'Cửa hàng'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Dữ liệu hiển thị chính
  const salary = salaryData?.salary;
  const stats = salaryData?.stats;
  const leaves = salaryData?.leaves || [];
  const advances = salaryData?.advances || [];
  const employee = salaryData?.employee;
  const merchant = salaryData?.merchant;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* 1. Header trên cùng */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.merchantTitle}>🏪 {merchant?.name || portalInfo?.merchantName || 'Cửa hàng'}</Text>
          <Text style={styles.portalSubTitle}>BẢNG LƯƠNG & CHẤM CÔNG ĐIỆN TỬ</Text>
        </View>
        <View style={styles.secureBadge}>
          <Text style={styles.secureBadgeText}>🛡️ Chính thức</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.mainScrollContent}
      >
        {/* 2. Thẻ thông tin nhân viên & Bộ lọc tháng */}
        <View style={styles.empHeaderCard}>
          <View style={styles.empInfoRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>
                {(employee?.name || portalInfo?.employeeName || 'E').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.empMainName}>{employee?.name || portalInfo?.employeeName}</Text>
              <Text style={styles.empMainRole}>
                💼 {employee?.role || portalInfo?.role || 'Nhân viên'}
              </Text>
            </View>
          </View>

          {/* Bộ điều hướng tháng */}
          <View style={styles.monthNavigator}>
            <TouchableOpacity
              style={styles.monthNavBtn}
              onPress={() => adjustMonth(-1)}
              activeOpacity={0.7}
            >
              <Text style={styles.monthNavBtnText}>◀️ Tháng trước</Text>
            </TouchableOpacity>

            <View style={styles.monthDisplayBox}>
              <Text style={styles.monthDisplayText}>Tháng {monthKey}</Text>
            </View>

            <TouchableOpacity
              style={styles.monthNavBtn}
              onPress={() => adjustMonth(1)}
              activeOpacity={0.7}
            >
              <Text style={styles.monthNavBtnText}>Tháng sau ▶️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {dataLoading ? (
          <View style={styles.dataLoadingBox}>
            <ActivityIndicator size="large" color="#0284C7" />
            <Text style={styles.dataLoadingText}>Đang tính toán số liệu tháng {monthKey}...</Text>
          </View>
        ) : dataError ? (
          <View style={styles.dataErrorCard}>
            <Text style={styles.dataErrorText}>{dataError}</Text>
          </View>
        ) : (
          <>
            {/* 3. HERO CARD: LƯƠNG THỰC LĨNH TO NỔI BẬT */}
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Text style={styles.heroLabel}>LƯƠNG THỰC LĨNH THÁNG {monthKey}</Text>
                {salary?.isPaid ? (
                  <View style={styles.paidBadge}>
                    <Text style={styles.paidBadgeText}>✅ ĐÃ CHI TRẢ</Text>
                  </View>
                ) : (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>⏳ ĐANG TÍNH / CHƯA TRẢ</Text>
                  </View>
                )}
              </View>

              <Text style={styles.heroAmount}>{formatCurrency(salary?.finalAmount)}</Text>

              {salary?.isPaid && salary?.paidAt && (
                <Text style={styles.paidAtText}>
                  Đã thanh toán ngày: {formatDateVN(salary.paidAt)}
                </Text>
              )}

              <View style={styles.heroFormulaDivider} />

              <View style={styles.heroFormulaRow}>
                <Text style={styles.heroFormulaText}>
                  Lương theo công: <Text style={{ fontWeight: 'bold' }}>{formatCurrency(salary?.calculatedSalary)}</Text>
                  {salary?.totalAdvances > 0 ? ` - Ứng: ${formatCurrency(salary.totalAdvances)}` : ''}
                  {salary?.bonus > 0 ? ` + Thưởng: ${formatCurrency(salary.bonus)}` : ''}
                  {salary?.deductions > 0 ? ` - Giảm trừ: ${formatCurrency(salary.deductions)}` : ''}
                </Text>
              </View>
            </View>

            {/* 4. KHỐI CHI TIẾT CẤU THÀNH LƯƠNG & CHẾ ĐỘ */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderIcon}>💼</Text>
                <Text style={styles.sectionHeaderTitle}>CHI TIẾT CẤU THÀNH LƯƠNG</Text>
              </View>

              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Mức lương cơ bản tháng:</Text>
                <Text style={styles.tableValue}>{formatCurrency(salary?.baseSalary)}</Text>
              </View>

              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Tổng số ngày trong tháng:</Text>
                <Text style={styles.tableValue}>
                  {salaryData?.totalDaysInMonth} ngày (~{formatCurrency(salary?.dailySalary)}/ngày)
                </Text>
              </View>

              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Ngày công thực tế:</Text>
                <Text style={[styles.tableValue, { color: '#0369A1', fontWeight: 'bold' }]}>
                  {salaryData?.workingDays} / {salaryData?.totalDaysInMonth} công
                </Text>
              </View>

              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Lương tính theo ngày công:</Text>
                <Text style={[styles.tableValue, { fontWeight: 'bold' }]}>
                  {formatCurrency(salary?.calculatedSalary)}
                </Text>
              </View>

              {salary?.bonus > 0 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableLabel, { color: '#10B981' }]}>+ Thưởng thêm / Phụ cấp:</Text>
                  <Text style={[styles.tableValue, { color: '#10B981', fontWeight: 'bold' }]}>
                    +{formatCurrency(salary.bonus)}
                  </Text>
                </View>
              )}

              {salary?.deductions > 0 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableLabel, { color: '#EF4444' }]}>- Các khoản trừ khác:</Text>
                  <Text style={[styles.tableValue, { color: '#EF4444', fontWeight: 'bold' }]}>
                    -{formatCurrency(salary.deductions)}
                  </Text>
                </View>
              )}

              {salary?.totalAdvances > 0 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableLabel, { color: '#EF4444' }]}>- Tạm ứng trong tháng:</Text>
                  <Text style={[styles.tableValue, { color: '#EF4444', fontWeight: 'bold' }]}>
                    -{formatCurrency(salary.totalAdvances)}
                  </Text>
                </View>
              )}

              <View style={[styles.tableRow, styles.tableRowTotal]}>
                <Text style={styles.tableLabelTotal}>THỰC LĨNH CUỐI CÙNG:</Text>
                <Text style={styles.tableValueTotal}>{formatCurrency(salary?.finalAmount)}</Text>
              </View>
            </View>

            {/* 5. KHỐI THỐNG KÊ CHẤM CÔNG & NGÀY NGHỈ (MOBILE-FIRST) */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderIcon}>📅</Text>
                <Text style={styles.sectionHeaderTitle}>CHẤM CÔNG & NGÀY NGHỈ</Text>
              </View>

              {/* 3 chip tóm tắt trên 1 hàng */}
              <View style={styles.attendanceStatsRow}>
                <View style={[styles.attStatChip, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                  <Text style={styles.attStatIcon}>🟢</Text>
                  <Text style={styles.attStatCount}>{stats?.fullDaysCount || 0}</Text>
                  <Text style={styles.attStatLabel}>Làm đủ</Text>
                </View>

                <View style={[styles.attStatChip, { backgroundColor: '#FEFCE8', borderColor: '#FEF08A' }]}>
                  <Text style={styles.attStatIcon}>🟡</Text>
                  <Text style={styles.attStatCount}>{stats?.halfDaysCount || 0}</Text>
                  <Text style={styles.attStatLabel}>Nửa công</Text>
                </View>

                <View style={[styles.attStatChip, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                  <Text style={styles.attStatIcon}>🔴</Text>
                  <Text style={styles.attStatCount}>{stats?.absentDaysCount || 0}</Text>
                  <Text style={styles.attStatLabel}>Nghỉ cả ngày</Text>
                </View>
              </View>

              {/* Danh sách ngày nghỉ hoặc biến động */}
              <Text style={styles.subListTitle}>Danh sách ngày nghỉ / làm nửa buổi:</Text>
              {leaves.length === 0 ? (
                <View style={styles.perfectAttBox}>
                  <Text style={styles.perfectAttText}>
                    🌟 Bạn đi làm đầy đủ 100% tất cả các ngày trong tháng!
                  </Text>
                </View>
              ) : (
                <View style={styles.leaveList}>
                  {leaves.map((leave, idx) => (
                    <View key={leave.id || idx} style={styles.leaveItem}>
                      <View style={styles.leaveDateCol}>
                        <Text style={styles.leaveDateText}>{formatDateVN(leave.date)}</Text>
                        <Text
                          style={[
                            styles.leaveBadge,
                            leave.status === 'ABSENT' ? styles.leaveBadgeRed : styles.leaveBadgeYellow,
                          ]}
                        >
                          {leave.status === 'ABSENT' ? 'Nghỉ cả ngày' : 'Nửa ngày'}
                        </Text>
                      </View>
                      <View style={styles.leaveNoteCol}>
                        <Text style={styles.leaveNoteText}>
                          {leave.note ? `Lý do: ${leave.note}` : 'Không ghi chú lý do'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* 6. KHỐI CÁC ĐỢT TẠM ỨNG LƯƠNG TRONG THÁNG */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderIcon}>💸</Text>
                <Text style={styles.sectionHeaderTitle}>CÁC ĐỢT TẠM ỨNG TRONG THÁNG</Text>
              </View>

              {advances.length === 0 ? (
                <Text style={styles.emptyNoticeText}>Không có khoản tạm ứng nào trong tháng này.</Text>
              ) : (
                <View style={styles.advanceList}>
                  {advances.map((adv, idx) => (
                    <View key={adv.id || idx} style={styles.advanceItem}>
                      <View style={styles.advanceLeft}>
                        <Text style={styles.advanceDate}>Ngày {formatDateVN(adv.date)}</Text>
                        <Text style={styles.advanceNote}>{adv.note || 'Tạm ứng lương'}</Text>
                      </View>
                      <Text style={styles.advanceAmount}>-{formatCurrency(adv.amount)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* 7. THẺ QUY ĐỊNH & THÔNG TIN HỖ TRỢ */}
            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>ℹ️ CHẾ ĐỘ & QUY ĐỊNH TÍNH LƯƠNG</Text>
              <Text style={styles.infoCardText}>
                • Lương ngày công = Lương cơ bản ÷ Tổng số ngày trong tháng ({salaryData?.totalDaysInMonth} ngày).
              </Text>
              <Text style={styles.infoCardText}>
                • Nghỉ làm cả ngày trừ 1.0 công; làm nửa buổi trừ 0.5 công.
              </Text>
              <Text style={styles.infoCardText}>
                • Nếu phát hiện sai sót về ngày công hoặc số tiền ứng, vui lòng liên hệ ngay với chủ quản.
              </Text>

              {merchant?.phone && (
                <TouchableOpacity
                  style={styles.callMerchantBtn}
                  onPress={() => Linking.openURL(`tel:${merchant.phone}`)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.callMerchantBtnText}>📞 Liên hệ chủ quán: {merchant.phone}</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    color: '#64748B',
  },
  errorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 8,
  },
  errorDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  authCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#0284C7',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  authIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  authIcon: {
    fontSize: 28,
  },
  authTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  authSub: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
  },
  pinHintBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pinHintText: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
    textAlign: 'center',
  },
  pinInputWrap: {
    marginBottom: 10,
  },
  pinInput: {
    height: 48,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: 'center',
    fontWeight: 'bold',
    letterSpacing: 4,
    color: '#0F172A',
  },
  pinErrorText: {
    fontSize: 12,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '500',
  },
  unlockBtn: {
    height: 48,
    backgroundColor: '#0284C7',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 16,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  unlockBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  merchantFooterText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  topBarLeft: {
    flex: 1,
  },
  merchantTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  portalSubTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  secureBadge: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  secureBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  mainScrollContent: {
    padding: 12,
    paddingBottom: 40,
    gap: 12,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  empHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  empInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarLetter: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  empMainName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  empMainRole: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  monthNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthNavBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  monthNavBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  monthDisplayBox: {
    flex: 1,
    alignItems: 'center',
  },
  monthDisplayText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  dataLoadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  dataLoadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  dataErrorCard: {
    backgroundColor: '#FEF2F2',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  dataErrorText: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    shadowColor: '#0284C7',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  paidBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  paidBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#15803D',
  },
  pendingBadge: {
    backgroundColor: '#FEF9C3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE047',
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#A16207',
  },
  heroAmount: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0284C7',
    marginVertical: 4,
  },
  paidAtText: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
    marginTop: 2,
  },
  heroFormulaDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  heroFormulaRow: {
    flexDirection: 'row',
  },
  heroFormulaText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionHeaderIcon: {
    fontSize: 16,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F8FAFC',
  },
  tableLabel: {
    fontSize: 13,
    color: '#475569',
  },
  tableValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  tableRowTotal: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1.5,
    borderTopColor: '#E2E8F0',
    borderBottomWidth: 0,
  },
  tableLabelTotal: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  tableValueTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  attendanceStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  attStatChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attStatIcon: {
    fontSize: 12,
    marginBottom: 2,
  },
  attStatCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  attStatLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  subListTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  perfectAttBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  perfectAttText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
  },
  leaveList: {
    gap: 6,
  },
  leaveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  leaveDateCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 140,
  },
  leaveDateText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  leaveBadge: {
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: 'bold',
  },
  leaveBadgeRed: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
  },
  leaveBadgeYellow: {
    backgroundColor: '#FEF9C3',
    color: '#CA8A04',
  },
  leaveNoteCol: {
    flex: 1,
  },
  leaveNoteText: {
    fontSize: 11,
    color: '#64748B',
  },
  emptyNoticeText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 10,
  },
  advanceList: {
    gap: 6,
  },
  advanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  advanceLeft: {
    flex: 1,
  },
  advanceDate: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  advanceNote: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  advanceAmount: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  infoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoCardTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 8,
  },
  infoCardText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 4,
  },
  callMerchantBtn: {
    marginTop: 10,
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  callMerchantBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
