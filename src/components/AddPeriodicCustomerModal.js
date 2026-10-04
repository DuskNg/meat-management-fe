// meat-management-fe/src/components/AddPeriodicCustomerModal.js
import React, { useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import SmoothModal from './SmoothModal';
import CustomSelect from './CustomSelect';
import { COLORS, FONTS, SHADOWS } from '../theme';
import { api } from '../api/client';
import { showGlobalToast } from '../store/toastStore';

const DEFAULT_GROUPS_SUGGESTIONS = [
  'Chuỗi Trường Hoàng (11 quán)',
  'Bếp Hàng Xóm (3 cơ sở)',
  'Các nhà hàng riêng lẻ',
];

const AddPeriodicCustomerModal = forwardRef(({ onRefresh, existingConfigs = [] }, ref) => {
  const [visible, setVisible] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [saving, setSaving] = useState(false);

  // Danh sách toàn bộ khách hàng để chọn
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Tùy chọn ngày áp dụng: '1', '15', '1,15', hoặc 'custom'
  const [dayOption, setDayOption] = useState('1,15');
  const [customDays, setCustomDays] = useState('');

  // Tên nhóm nhà hàng
  const [groupName, setGroupName] = useState('');
  const [customGroupName, setCustomGroupName] = useState('');

  // Tải danh sách khách hàng từ hệ thống
  const loadCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const res = await api.get('/customers?isBadDebt=false');
      const allCusts = res.data?.data || [];
      setCustomers(allCusts);
    } catch (err) {
      console.error('Lỗi tải danh sách khách hàng:', err);
    } finally {
      setLoadingCustomers(false);
    }
  };

  useImperativeHandle(ref, () => ({
    open: (defaultGroup = '') => {
      setSelectedCustomer(null);
      setDayOption('1,15');
      setCustomDays('');
      setGroupName(defaultGroup || DEFAULT_GROUPS_SUGGESTIONS[0]);
      setCustomGroupName('');
      setVisible(true);
      loadCustomers();
    },
    close: () => {
      setVisible(false);
    },
  }));

  // Danh sách các nhóm gợi ý kết hợp các nhóm hiện có
  const groupSuggestions = useMemo(() => {
    const set = new Set(DEFAULT_GROUPS_SUGGESTIONS);
    existingConfigs.forEach((cfg) => {
      if (cfg.groupName) set.add(cfg.groupName);
    });
    return Array.from(set);
  }, [existingConfigs]);

  // Khách hàng chưa được cấu hình
  const availableCustomers = useMemo(() => {
    const configuredSet = new Set(existingConfigs.map((c) => c.customerId || c.id));
    return customers.filter((c) => !configuredSet.has(c.id));
  }, [customers, existingConfigs]);

  // Xử lý lưu khách hàng vào lịch nhắc nợ định kỳ
  const handleSave = async () => {
    if (!selectedCustomer) {
      showGlobalToast('Vui lòng chọn khách hàng cần nhắc nợ.', 'warning');
      return;
    }

    let finalDays = dayOption;
    if (dayOption === 'custom') {
      const trimmed = customDays.replace(/\s+/g, '');
      if (!trimmed) {
        showGlobalToast('Vui lòng nhập ngày nhắc nợ (ví dụ: 1, 10, 15).', 'warning');
        return;
      }
      finalDays = trimmed;
    }

    const finalGroup = customGroupName.trim() || groupName || 'Các nhà hàng riêng lẻ';

    try {
      setSaving(true);
      const res = await api.post('/periodic-reminders', {
        customerId: selectedCustomer.id,
        reminderDays: finalDays,
        groupName: finalGroup,
      });

      if (res.data?.success) {
        showGlobalToast(`Đã thêm ${selectedCustomer.name} vào lịch gửi công nợ!`, 'success');
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        showGlobalToast(res.data?.message || 'Không thể lưu cấu hình nhắc nợ.', 'error');
      }
    } catch (err) {
      console.error('Lỗi lưu cấu hình nhắc nợ:', err);
      showGlobalToast(err.response?.data?.message || 'Có lỗi xảy ra khi lưu cấu hình.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        {/* Header Modal */}
        <View style={styles.modalHeaderRow}>
          <View style={styles.headerLeftCol}>
            <Text style={styles.modalTitle}>THÊM KHÁCH NHẮC NỢ ĐỊNH KỲ</Text>
            <Text style={styles.modalSubTitle}>
              Tự động áp dụng ngày gửi công nợ riêng cho từng khách
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeHeaderBtn}
            onPress={() => setVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.closeHeaderBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Nội dung Form */}
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollBody}>
          {/* 1. Ô chọn khách hàng */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              1. Chọn khách hàng <Text style={styles.requiredStar}>*</Text>
            </Text>
            {loadingCustomers ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#0284C7" />
                <Text style={styles.loadingText}>Đang tải danh sách khách hàng...</Text>
              </View>
            ) : (
              <CustomSelect
                value={selectedCustomer}
                placeholder="Nhấp để tìm và chọn khách hàng..."
                options={availableCustomers}
                onSelect={(cust) => setSelectedCustomer(cust)}
                renderSelected={(cust) => cust.name}
                renderOption={(cust) => (
                  <View style={styles.optionRow}>
                    <Text style={styles.optionName}>{cust.name}</Text>
                    {cust.phone ? <Text style={styles.optionPhone}>📞 {cust.phone}</Text> : null}
                  </View>
                )}
                style={styles.selectCustomer}
              />
            )}
            {selectedCustomer && (
              <View style={styles.selectedBadge}>
                <Text style={styles.selectedBadgeText}>
                  Đã chọn: <Text style={styles.textBold}>{selectedCustomer.name}</Text>
                  {selectedCustomer.phone ? ` • 📞 ${selectedCustomer.phone}` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* 2. Áp dụng ngày nhắc nợ trong tháng */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              2. Áp dụng ngày gửi công nợ <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.chipsRow}>
              <TouchableOpacity
                style={[styles.chipBtn, dayOption === '1,15' && styles.chipBtnActive]}
                onPress={() => setDayOption('1,15')}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, dayOption === '1,15' && styles.chipTextActive]}>
                  📅 Cả ngày 1 & ngày 15
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chipBtn, dayOption === '1' && styles.chipBtnActive]}
                onPress={() => setDayOption('1')}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, dayOption === '1' && styles.chipTextActive]}>
                  📅 Chỉ ngày 1 (Tháng trước)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chipBtn, dayOption === '15' && styles.chipBtnActive]}
                onPress={() => setDayOption('15')}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, dayOption === '15' && styles.chipTextActive]}>
                  📅 Chỉ ngày 15 (Từ 1-15)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chipBtn, dayOption === 'custom' && styles.chipBtnActive]}
                onPress={() => setDayOption('custom')}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, dayOption === 'custom' && styles.chipTextActive]}>
                  ✏️ Ngày tùy chỉnh...
                </Text>
              </TouchableOpacity>
            </View>

            {dayOption === 'custom' && (
              <View style={styles.customDaysBox}>
                <Text style={styles.customDaysHint}>
                  Nhập các ngày trong tháng cần nhắc (ngăn cách bằng dấu phẩy, ví dụ: 5, 10, 20):
                </Text>
                <TextInput
                  style={styles.customDaysInput}
                  placeholder="Ví dụ: 1, 10, 15, 25"
                  value={customDays}
                  onChangeText={setCustomDays}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            )}
          </View>

          {/* 3. Phân nhóm nhà hàng */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>3. Chọn hoặc tạo nhóm chuỗi</Text>
            <View style={styles.groupChipsRow}>
              {groupSuggestions.map((g) => {
                const isSelected = groupName === g && !customGroupName;
                return (
                  <TouchableOpacity
                    key={g}
                    style={[styles.groupChipBtn, isSelected && styles.groupChipBtnActive]}
                    onPress={() => {
                      setGroupName(g);
                      setCustomGroupName('');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[styles.groupChipText, isSelected && styles.groupChipTextActive]}
                      numberOfLines={1}
                    >
                      {g}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.customGroupInput}
              placeholder="Hoặc gõ tên nhóm mới tại đây..."
              value={customGroupName}
              onChangeText={(text) => {
                setCustomGroupName(text);
                if (text) setGroupName('');
              }}
            />
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Footer Modal */}
        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>💾 LƯU VÀO LỊCH NHẮC NỢ</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    ...SHADOWS.card,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeftCol: {
    flex: 1,
    paddingRight: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  modalSubTitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  closeHeaderBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeHeaderBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748B',
  },
  scrollBody: {
    paddingTop: 12,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  requiredStar: {
    color: '#DC2626',
  },
  loadingBox: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  selectCustomer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  optionRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  optionName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  optionPhone: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  selectedBadge: {
    marginTop: 6,
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  selectedBadgeText: {
    fontSize: 11.5,
    color: '#0369A1',
  },
  textBold: {
    fontWeight: 'bold',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  chipBtnActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  customDaysBox: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customDaysHint: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 6,
  },
  customDaysInput: {
    height: 38,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  groupChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  groupChipBtn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  groupChipBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  groupChipText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  groupChipTextActive: {
    color: '#FFFFFF',
  },
  customGroupInput: {
    height: 38,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    fontSize: 12.5,
    color: '#0F172A',
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  submitBtn: {
    backgroundColor: '#0284C7',
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default AddPeriodicCustomerModal;
