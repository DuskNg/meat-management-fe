// meat-management-fe/src/components/AdminReconciliationModal.js
import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../api/client';

// Helper định dạng tiền VNĐ
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(amount || 0).replace('₫', 'đ');
};

const AdminReconciliationModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  useImperativeHandle(ref, () => ({
    open: (targetUser) => {
      setUser(targetUser);
      setData(null);
      setError('');
      setShowDetails(false);
      setVisible(true);
    },
    close: () => setVisible(false),
  }));

  useEffect(() => {
    if (!visible || !user) return;

    const fetchReconciliation = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get(`/admin/users/${user.id}/reconciliation`);
        if (response.data?.success) {
          setData(response.data.data);
        } else {
          setError('Không thể lấy dữ liệu đối soát.');
        }
      } catch (err) {
        console.error('Lỗi lấy dữ liệu đối soát tài khoản:', err);
        setError(err.response?.data?.message || 'Có lỗi khi kết nối máy chủ đối soát.');
      } finally {
        setLoading(false);
      }
    };

    fetchReconciliation();
  }, [visible, user]);

  if (!visible || !user) return null;

  const activeCust = data?.customerModule?.activeCustomers || {};
  const badCust = data?.customerModule?.badDebtCustomers || {};
  const inactiveCust = data?.customerModule?.inactiveCustomers || {};
  const overallCust = data?.customerModule?.overallDbTotal || {};

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header Modal */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>📊 PHÂN TÍCH VÀ ĐỐI SOÁT TÀI CHÍNH</Text>
              <Text style={styles.subtitle}>Tài khoản: {user.name} ({user.phone})</Text>
            </View>
            <TouchableOpacity onPress={() => setVisible(false)}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

          {loading || !data ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={styles.loadingText}>Đang phân tích & kiểm tra số liệu toàn hệ thống...</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {/* Thẻ Trạng thái Cân đối Tổng thể */}
              <View style={[styles.statusBadge, data.isFullyBalanced ? styles.statusSuccess : styles.statusWarning]}>
                <Text style={styles.statusBadgeTitle}>
                  {data.isFullyBalanced ? '✅ SỐ LIỆU ĐỐI SOÁT KHỚP 100% (HỢP LỆ)' : '⚠️ PHÁT HIỆN CHÊNH LỆCH SỐ LIỆU'}
                </Text>
                <Text style={styles.statusBadgeSubtitle}>
                  Công thức: [Tổng nợ phát sinh ban đầu] = [Tổng thu đã thanh toán] + [Tổng nợ còn lại]
                </Text>
              </View>

              {/* HẠNG MỤC 1: KHÁCH HÀNG HIỂN THỊ TRÊN GIAO DIỆN APP (ACTIVE) */}
              <View style={styles.sectionBox}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.sectionTitle}>🛒 1. KHÁCH HÀNG ĐANG HOẠT ĐỘNG (HIỂN THỊ TRÊN GIAO DIỆN APP)</Text>
                  <View style={styles.activeBadgeTag}>
                    <Text style={styles.activeBadgeTagText}>{activeCust.count || 0} khách</Text>
                  </View>
                </View>

                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>• Tổng nợ ban đầu phát sinh:</Text>
                  <Text style={styles.calcValueBold}>{formatCurrency(activeCust.totalObligation)}</Text>
                </View>
                <View style={styles.subCalcRow}>
                  <Text style={styles.subCalcText}>- Đơn bán nợ: {formatCurrency(activeCust.totalTransactions)}</Text>
                  <Text style={styles.subCalcText}>- Nợ thủ công ban đầu: {formatCurrency(activeCust.totalManualDebt)}</Text>
                </View>

                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>• Tổng tiền khách ĐÃ TRẢ (Tổng thu):</Text>
                  <Text style={[styles.calcValueBold, { color: '#4ADE80' }]}>{formatCurrency(activeCust.totalCollected)}</Text>
                </View>

                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>• Tổng NỢ CÒN LẠI (Dư nợ khách trên App):</Text>
                  <Text style={[styles.calcValueBold, { color: '#F87171' }]}>{formatCurrency(activeCust.totalDebtRemaining)}</Text>
                </View>

                <View style={styles.resultBox}>
                  <Text style={styles.resultLabel}>
                    👉 ĐỐI SOÁT UI APP: [Tổng nợ ban đầu] - ([Tổng thu] + [Dư nợ còn lại])
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <Text style={styles.resultValueText}>Chênh lệch đối soát UI:</Text>
                    <Text style={[styles.resultValueNumber, activeCust.isBalanced ? styles.textSuccess : styles.textDanger]}>
                      {formatCurrency(activeCust.discrepancy)} {activeCust.isBalanced ? '(KHỚP 100% ✅)' : '(LỆCH ⚠️)'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* HẠNG MỤC BÓC TÁCH: KHÁCH ĐÃ XÓA TẠM & KHÁCH NỢ XẤU */}
              <View style={[styles.sectionBox, { backgroundColor: '#1E293B' }]}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  onPress={() => setShowDetails(prev => !prev)}
                >
                  <Text style={[styles.sectionTitle, { color: '#FBBF24', marginBottom: 0 }]}>
                    🔍 BÓC TÁCH KHÁCH NỢ XẤU & KHÁCH ĐÃ XÓA TẠM (LÝ DO KHÁC BIỆT DB VS UI)
                  </Text>
                  <Text style={{ color: '#FBBF24', fontWeight: 'bold' }}>{showDetails ? '▲ Ẩn' : '▼ Xem chi tiết'}</Text>
                </TouchableOpacity>

                <View style={{ marginTop: 10, gap: 6 }}>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>🔴 Tổng phát sinh từ Khách Nợ xấu ({badCust.count || 0} khách):</Text>
                    <Text style={[styles.calcValueBold, { color: '#F87171' }]}>{formatCurrency(badCust.totalTransactions)}</Text>
                  </View>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>📁 Tổng phát sinh từ Khách đã bị xóa tạm ({inactiveCust.count || 0} khách):</Text>
                    <Text style={[styles.calcValueBold, { color: '#FBBF24' }]}>{formatCurrency(inactiveCust.totalTransactions)}</Text>
                  </View>
                </View>

                {showDetails && (
                  <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#334155', gap: 10 }}>
                    {/* Chi tiết nợ xấu */}
                    {badCust.list && badCust.list.length > 0 && (
                      <View>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#F87171', marginBottom: 4 }}>
                          📌 Danh sách khách Nợ xấu ({badCust.list.length}):
                        </Text>
                        {badCust.list.map(c => (
                          <Text key={c.id} style={{ fontSize: 11, color: '#FCA5A5', paddingLeft: 8 }}>
                            - Khách [{c.name}]: Đơn mua {formatCurrency(c.purchase)}, Đã thu {formatCurrency(c.paid)}, Còn nợ {formatCurrency(c.debt)}
                          </Text>
                        ))}
                      </View>
                    )}

                    {/* Chi tiết đã xóa tạm */}
                    {inactiveCust.list && inactiveCust.list.length > 0 && (
                      <View>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#FBBF24', marginBottom: 4 }}>
                          📁 Danh sách khách đã xóa tạm/ẩn ({inactiveCust.list.length}):
                        </Text>
                        {inactiveCust.list.map(c => (
                          <Text key={c.id} style={{ fontSize: 11, color: '#FDE68A', paddingLeft: 8 }}>
                            - Khách [{c.name}]: Đơn mua {formatCurrency(c.purchase)}, Đã thu {formatCurrency(c.paid)}, Còn nợ {formatCurrency(c.debt)}
                          </Text>
                        ))}
                      </View>
                    )}

                    {/* Tổng cộng cơ sở dữ liệu */}
                    <View style={{ backgroundColor: '#0F172A', padding: 10, borderRadius: 8, marginTop: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#38BDF8', marginBottom: 4 }}>
                        📈 TỔNG TOÀN BỘ CƠ SỞ DỮ LIỆU DB (ACTIVE + NỢ XẤU + ĐÃ XÓA):
                      </Text>
                      <Text style={{ fontSize: 11, color: '#CBD5E1' }}>
                        • Total DB Transactions: {formatCurrency(overallCust.totalTransactions)}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#CBD5E1' }}>
                        • Total DB Payments Collected: {formatCurrency(overallCust.totalCollected)}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#CBD5E1' }}>
                        • Total DB Debt Remaining: {formatCurrency(overallCust.totalDebtRemaining)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* HẠNG MỤC 2: CÔNG NỢ NHÀ CUNG CẤP */}
              <View style={styles.sectionBox}>
                <Text style={styles.sectionTitle}>📦 2. CÔNG NỢ NHÀ CUNG CẤP (SUPPLIER)</Text>

                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>• Tổng tiền nhập nợ từ NCC:</Text>
                  <Text style={styles.calcValueBold}>{formatCurrency(data.supplierModule.totalTransactions)}</Text>
                </View>

                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>• Tổng tiền ĐÃ TRẢ cho NCC:</Text>
                  <Text style={[styles.calcValueBold, { color: '#38BDF8' }]}>{formatCurrency(data.supplierModule.totalPaid)}</Text>
                </View>

                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>• Tổng nợ NCC CÒN LẠI (Còn thiếu):</Text>
                  <Text style={[styles.calcValueBold, { color: '#F87171' }]}>{formatCurrency(data.supplierModule.totalDebtRemaining)}</Text>
                </View>

                <View style={styles.resultBox}>
                  <Text style={styles.resultLabel}>
                    👉 Logic kiểm tra: [Tổng nhập nợ] - ([Đã trả] + [Nợ còn lại])
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <Text style={styles.resultValueText}>Chênh lệch đối soát NCC:</Text>
                    <Text style={[styles.resultValueNumber, data.supplierModule.isBalanced ? styles.textSuccess : styles.textDanger]}>
                      {formatCurrency(data.supplierModule.discrepancy)} {data.supplierModule.isBalanced ? '(KHỚP 100% ✅)' : '(LỆCH ⚠️)'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* HẠNG MỤC 3: DÒNG TIỀN THỰC TẾ (CASH FLOW) */}
              <View style={styles.sectionBox}>
                <Text style={styles.sectionTitle}>💵 3. DÒNG TIỀN THỰC TẾ (CASH FLOW)</Text>

                {/* THU VÀO */}
                <View style={styles.calcRow}>
                  <Text style={[styles.calcLabel, { fontWeight: 'bold', color: '#4ADE80' }]}>🟢 TỔNG TIỀN THỰC THU VÀO:</Text>
                  <Text style={[styles.calcValueBold, { color: '#4ADE80', fontSize: 14 }]}>{formatCurrency(data.cashFlow.totalCashIn)}</Text>
                </View>
                <View style={styles.subCalcRow}>
                  <Text style={styles.subCalcText}>• Thu nợ Khách hàng thường: {formatCurrency(data.cashFlow.cashInBreakdown?.activeCustomerPayments)}</Text>
                  <Text style={styles.subCalcText}>• Thu nợ Khách nợ xấu: {formatCurrency(data.cashFlow.cashInBreakdown?.badCustomerPayments)}</Text>
                  <Text style={styles.subCalcText}>• Thu nợ Khách đã xóa tạm: {formatCurrency(data.cashFlow.cashInBreakdown?.inactiveCustomerPayments)}</Text>
                  <Text style={styles.subCalcText}>• Doanh thu tính giờ Cửa hàng (nếu có): {formatCurrency(data.cashFlow.cashInBreakdown?.shopRevenue)}</Text>
                </View>

                {/* CHI RA */}
                <View style={[styles.calcRow, { marginTop: 6 }]}>
                  <Text style={[styles.calcLabel, { fontWeight: 'bold', color: '#F87171' }]}>🔴 TỔNG TIỀN THỰC CHI RA:</Text>
                  <Text style={[styles.calcValueBold, { color: '#F87171', fontSize: 14 }]}>{formatCurrency(data.cashFlow.totalCashOut)}</Text>
                </View>
                <View style={styles.subCalcRow}>
                  <Text style={styles.subCalcText}>• Chi trả tiền hàng Nhà cung cấp: {formatCurrency(data.cashFlow.cashOutBreakdown?.supplierPayments)}</Text>
                  <Text style={styles.subCalcText}>• Chi ứng lương Nhân viên: {formatCurrency(data.cashFlow.cashOutBreakdown?.employeeAdvances)}</Text>
                  <Text style={styles.subCalcText}>• Chi trả lương chính thức Nhân viên: {formatCurrency(data.cashFlow.cashOutBreakdown?.employeeSalaryPayments)}</Text>
                </View>

                {/* DÒNG TIỀN RÒNG */}
                <View style={[styles.resultBox, { backgroundColor: '#0F172A', marginTop: 10 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.resultValueText}>Dòng tiền ròng (Tổng Thu - Tổng Chi):</Text>
                    <Text style={[styles.resultValueNumber, data.cashFlow.netCashFlow >= 0 ? styles.textSuccess : { color: '#F87171' }]}>
                      {formatCurrency(data.cashFlow.netCashFlow)}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          )}

          {/* Nút đóng */}
          <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeButtonText}>ĐÓNG LẠI</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

export default AdminReconciliationModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 860,
    maxHeight: '94%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  title: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  closeText: {
    color: '#CBD5E1',
    fontSize: 20,
    padding: 4,
  },
  errorText: {
    color: '#F87171',
    marginTop: 10,
    fontSize: 13,
  },
  center: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 10,
  },
  list: {
    marginTop: 12,
  },
  listContent: {
    gap: 12,
    paddingBottom: 10,
  },
  statusBadge: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
  },
  statusSuccess: {
    backgroundColor: '#065F4625',
    borderColor: '#10B981',
  },
  statusWarning: {
    backgroundColor: '#991B1B25',
    borderColor: '#EF4444',
  },
  statusBadgeTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  statusBadgeSubtitle: {
    fontSize: 11,
    color: '#CBD5E1',
    marginTop: 4,
    lineHeight: 16,
  },
  sectionBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#38BDF8',
    flex: 1,
  },
  activeBadgeTag: {
    backgroundColor: '#10B98120',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  activeBadgeTagText: {
    color: '#4ADE80',
    fontSize: 10,
    fontWeight: 'bold',
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  calcLabel: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  calcValueBold: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  subCalcRow: {
    paddingLeft: 12,
    paddingVertical: 2,
    marginBottom: 4,
  },
  subCalcText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  resultBox: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  resultLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  resultValueText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#E2E8F0',
  },
  resultValueNumber: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  textSuccess: {
    color: '#4ADE80',
  },
  textDanger: {
    color: '#F87171',
  },
  closeButton: {
    backgroundColor: '#334155',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 14,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
