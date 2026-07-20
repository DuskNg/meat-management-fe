import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../api/client';

const FEATURE_LABELS = {
  VOICE_TO_TEXT: '🎤 Voice to text',
  SCAN_TICKET: '📸 Chụp tích kê',
};

const getTodayString = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const USD_TO_VND_RATE = Number(process.env.EXPO_PUBLIC_USD_TO_VND_RATE || 26460);
const formatVnd = (value) => `${Math.round(Number(value || 0) * USD_TO_VND_RATE).toLocaleString('vi-VN')} ₫`;

const AdminAiUsageModal = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [date, setDate] = useState(getTodayString());
  const [usage, setUsage] = useState({ records: [], summary: {}, allTimeSummary: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useImperativeHandle(ref, () => ({
    open: (targetUser) => {
      setUser(targetUser);
      setDate(getTodayString());
      setUsage({ records: [], summary: {}, allTimeSummary: {} });
      setError('');
      setVisible(true);
    },
    close: () => setVisible(false),
  }));

  useEffect(() => {
    if (!visible || !user) return;

    const fetchUsage = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get(`/admin/users/${user.id}/ai-usage`, {
          params: { date: date || undefined },
        });
        if (response.data?.success) {
          setUsage(response.data.data);
        } else {
          setError('Không thể tải chi phí AI.');
        }
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Có lỗi khi tải chi phí AI.');
      } finally {
        setLoading(false);
      }
    };

    fetchUsage();
  }, [visible, user, date]);

  if (!visible || !user) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Chi phí AI</Text>
              <Text style={styles.subtitle}>{user.name} ({user.phone})</Text>
            </View>
            <TouchableOpacity onPress={() => setVisible(false)}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Ngày:</Text>
            {Platform.OS === 'web' ? (
              React.createElement('input', {
                type: 'date',
                value: date,
                onChange: (event) => setDate(event.target.value),
                style: styles.webDateInput,
              })
            ) : (
              <TextInput
                style={styles.dateInput}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#64748B"
              />
            )}
            <TouchableOpacity style={styles.allDateButton} onPress={() => setDate('')}>
              <Text style={styles.allDateText}>Tất cả</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.summaryCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryLabel}>{date ? `Chi phí ngày lọc (${date})` : 'Tổng chi phí tất cả ngày'}</Text>
                <Text style={styles.summaryValue}>{formatVnd(usage.summary.costUsd)}</Text>
                <Text style={styles.summaryMeta}>
                  {usage.summary.requestCount || 0} lượt · {(usage.summary.totalTokens || 0).toLocaleString()} tokens
                </Text>
              </View>
              {date && usage.allTimeSummary ? (
                <View style={{ borderLeftWidth: 1, borderLeftColor: '#0369A1', paddingLeft: 16, minWidth: 120 }}>
                  <Text style={[styles.summaryLabel, { color: '#38BDF8' }]}>Trọn đời (Tất cả ngày)</Text>
                  <Text style={[styles.summaryValue, { fontSize: 18, marginTop: 2, color: '#38BDF8' }]}>
                    {formatVnd(usage.allTimeSummary.costUsd)}
                  </Text>
                  <Text style={[styles.summaryMeta, { fontSize: 10, color: '#BAE6FD' }]}>
                    {usage.allTimeSummary.requestCount || 0} lượt · {(usage.allTimeSummary.totalTokens || 0).toLocaleString()} tokens
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.summaryMeta, { borderTopWidth: 1, borderTopColor: '#0369A1', paddingTop: 6, marginTop: 8, fontSize: 10 }]}>
              Tỷ giá quy đổi mặc định: {USD_TO_VND_RATE.toLocaleString('vi-VN')} ₫/USD
            </Text>
          </View>

          {loading ? (
            <View style={styles.center}><ActivityIndicator color="#38BDF8" /></View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {usage.records.length === 0 ? (
                <Text style={styles.emptyText}>Chưa có lượt sử dụng trong thời gian này.</Text>
              ) : usage.records.map((record) => (
                <View key={record.id} style={styles.recordCard}>
                  <View style={styles.recordHeader}>
                    <Text style={styles.featureText}>{FEATURE_LABELS[record.feature] || record.feature}</Text>
                    <Text style={styles.costText}>{formatVnd(record.costUsd)}</Text>
                  </View>
                  <Text style={styles.recordMeta}>
                    {new Date(record.createdAt).toLocaleString('vi-VN')} · {record.model}
                  </Text>
                  <Text style={styles.recordMeta}>
                    Input: {(record.inputTokens || 0).toLocaleString()} · Output: {(record.outputTokens || 0).toLocaleString()}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)}>
            <Text style={styles.closeButtonText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'center', padding: 16 },
  card: { maxHeight: '90%', backgroundColor: '#0F172A', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#334155' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: '#F8FAFC', fontSize: 20, fontWeight: 'bold' },
  subtitle: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  closeText: { color: '#CBD5E1', fontSize: 20, padding: 4 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  filterLabel: { color: '#CBD5E1', fontSize: 13 },
  webDateInput: { flex: 1, backgroundColor: '#1E293B', color: '#FFFFFF', border: '1px solid #334155', borderRadius: 6, padding: 8 },
  dateInput: { flex: 1, height: 38, color: '#FFFFFF', backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 6, paddingHorizontal: 10 },
  allDateButton: { backgroundColor: '#334155', borderRadius: 6, paddingVertical: 9, paddingHorizontal: 10 },
  allDateText: { color: '#E2E8F0', fontSize: 12, fontWeight: '600' },
  errorText: { color: '#F87171', marginTop: 12, fontSize: 13 },
  summaryCard: { backgroundColor: '#082F49', borderWidth: 1, borderColor: '#0369A1', borderRadius: 12, padding: 14, marginTop: 16 },
  summaryLabel: { color: '#7DD3FC', fontSize: 12 },
  summaryValue: { color: '#F8FAFC', fontSize: 26, fontWeight: 'bold', marginTop: 4 },
  summaryMeta: { color: '#BAE6FD', fontSize: 12, marginTop: 4 },
  center: { padding: 40, alignItems: 'center' },
  list: { marginTop: 12 },
  listContent: { gap: 8 },
  emptyText: { color: '#64748B', textAlign: 'center', padding: 24 },
  recordCard: { backgroundColor: '#1E293B', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#334155' },
  recordHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  featureText: { color: '#E2E8F0', fontWeight: '700', flex: 1 },
  costText: { color: '#86EFAC', fontWeight: 'bold' },
  recordMeta: { color: '#94A3B8', fontSize: 11, marginTop: 5 },
  closeButton: { backgroundColor: '#334155', borderRadius: 8, alignItems: 'center', paddingVertical: 10, marginTop: 14 },
  closeButtonText: { color: '#FFFFFF', fontWeight: '600' },
});

export default AdminAiUsageModal;
