// meat-management-fe/src/components/shop/AddShopTableModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import {
   StyleSheet,
   Text,
   View,
   TextInput,
   TouchableOpacity,
   ActivityIndicator,
   ScrollView,
} from 'react-native';
import { api } from '../../api/client';
import { COLORS, FONTS } from '../../theme';
import SmoothModal from '../SmoothModal';

/**
 * Component AddShopTableModal quản lý việc tạo mới hoặc sửa thông tin bàn chơi tính giờ.
 * Sử dụng forwardRef để phơi bày hàm open() và close() cho component cha.
 */
const AddShopTableModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [table, setTable] = useState(null); // Đối tượng bàn đang sửa (null nếu là tạo mới)
  const [name, setName] = useState('');
  const [pricePerHour, setPricePerHour] = useState('50.000');
  const [commonPrice, setCommonPrice] = useState('50.000'); // Giá trị áp dụng chung cho cả lô bàn chơi
  const [numTables, setNumTables] = useState('0'); // Số lượng bàn chơi muốn tạo tự động (mặc định là 0)
  const [tableList, setTableList] = useState([]); // Danh sách các bàn đang nhập liệu (mặc định trống)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isSubmittingRef = useRef(false);

  // Phơi bày các phương thức ra bên ngoài qua ref
  useImperativeHandle(ref, () => ({
    open: (targetTable = null) => {
      setError('');
      setTable(targetTable);
      if (targetTable) {
        setName(targetTable.name);
        setPricePerHour(formatInputNumber(targetTable.pricePerHour.toString()));
      } else {
        setName('');
        setPricePerHour('50.000');
        setCommonPrice('50.000');
        setNumTables('0');
        setTableList([]); // Ban đầu danh sách trống, cần nhập số lượng và ấn Áp dụng
      }
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    }
  }));

  // Định dạng chuỗi số phân cách hàng nghìn (ví dụ: 50.000)
  const formatInputNumber = (val) => {
    if (!val) return '';
    const clean = val.toString().replace(/[^0-9]/g, '');
    if (!clean) return '';
    return new Intl.NumberFormat('vi-VN').format(parseInt(clean, 10));
  };

  // Chuyển chuỗi định dạng về số nguyên để lưu trữ db
  const parsePrice = (val) => {
    if (!val) return 0;
    const clean = val.toString().replace(/\./g, '');
    return parseInt(clean, 10) || 0;
  };

  // Áp dụng tạo danh sách bàn tự động theo số lượng và giá chung
  const handleApplyBatch = () => {
    const num = parseInt(numTables, 10);
    if (isNaN(num) || num <= 0) {
      setError('Số lượng bàn phải là số lớn hơn 0.');
      return;
    }
    if (num > 50) {
      setError('Hệ thống hỗ trợ tạo tối đa 50 bàn cùng lúc.');
      return;
    }
    setError('');
    
    const formattedPrice = formatInputNumber(commonPrice);
    setTableList(
      Array.from({ length: num }, (_, i) => ({
        name: `Bàn ${i + 1}`,
        pricePerHour: formattedPrice,
      }))
    );
  };

  // Cập nhật giá chung và đồng bộ xuống các bàn hiện có
  const handleCommonPriceChange = (val) => {
    const formatted = formatInputNumber(val);
    setCommonPrice(formatted);
    setTableList(prev => prev.map(item => ({ ...item, pricePerHour: formatted })));
    setError('');
  };

  // Bổ sung thêm dòng nhập liệu bàn mới
  const addTableRow = () => {
    setTableList(prev => [...prev, { name: '', pricePerHour: commonPrice }]);
  };

  // Loại bỏ dòng khỏi danh sách thêm hàng loạt
  const removeTableRow = (index) => {
    setTableList(prev => prev.filter((_, i) => i !== index));
  };

  // Cập nhật tên của một dòng bàn nhất định
  const updateTableName = (index, val) => {
    setTableList(prev => {
      const copy = [...prev];
      copy[index].name = val;
      return copy;
    });
    setError('');
  };

  // Cập nhật giá bán theo giờ của một dòng bàn nhất định
  const updateTablePrice = (index, val) => {
    const formatted = formatInputNumber(val);
    setTableList(prev => {
      const copy = [...prev];
      copy[index].pricePerHour = formatted;
      return copy;
    });
    setError('');
  };

  // Gửi thông tin thêm mới hoặc cập nhật lên server
  const handleSubmit = async () => {
    if (loading || isSubmittingRef.current) return;

    setError('');

    if (table) {
      // Chế độ cập nhật thông tin bàn hiện tại
      if (!name || name.trim() === '') {
        setError('Tên bàn/phòng không được để trống.');
        return;
      }

      const price = parsePrice(pricePerHour);
      if (price < 0) {
        setError('Giá tiền mỗi giờ phải lớn hơn hoặc bằng 0.');
        return;
      }

      setLoading(true);
      isSubmittingRef.current = true;
      try {
        const response = await api.put(`/shop/tables/${table.id}`, {
          name: name.trim(),
          pricePerHour: price,
        });

        if (response.data.success) {
          setVisible(false);
          if (onRefresh) onRefresh();
        } else {
          setError(response.data.message || 'Lỗi lưu thông tin bàn.');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
      } finally {
        setLoading(false);
        isSubmittingRef.current = false;
      }
    } else {
      // Chế độ thêm hàng loạt bàn mới
      if (tableList.length === 0) {
        setError('Vui lòng thêm ít nhất một bàn/phòng.');
        return;
      }

      for (let i = 0; i < tableList.length; i++) {
        const item = tableList[i];
        if (!item.name || item.name.trim() === '') {
          setError(`Tên bàn ở dòng ${i + 1} không được để trống.`);
          return;
        }
        const price = parsePrice(item.pricePerHour);
        if (price < 0) {
          setError(`Giá tiền ở dòng ${i + 1} không hợp lệ.`);
          return;
        }
      }

      setLoading(true);
      isSubmittingRef.current = true;
      try {
        const response = await api.post('/shop/tables', {
          tables: tableList.map(t => ({
            name: t.name.trim(),
            pricePerHour: parsePrice(t.pricePerHour),
          })),
        });

        if (response.data.success) {
          setVisible(false);
          if (onRefresh) onRefresh();
        } else {
          setError(response.data.message || 'Lỗi lưu danh sách bàn.');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Lỗi kết nối mạng, vui lòng thử lại.');
      } finally {
        setLoading(false);
        isSubmittingRef.current = false;
      }
    }
  };

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>
          {table ? '✏️ SỬA THÔNG TIN BÀN' : '🏪 THÊM BÀN CHƠI MỚI'}
        </Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          {table ? (
            <View>
              <Text style={styles.label}>Tên bàn/phòng (Ví dụ: Bàn 1, VIP 2):</Text>
              <TextInput
                style={styles.input}
                placeholder="Nhập tên bàn hoặc số phòng..."
                placeholderTextColor={COLORS.textLight}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setError('');
                }}
              />

              <Text style={styles.label}>Giá tiền mỗi giờ (VND/giờ):</Text>
              <TextInput
                style={styles.input}
                placeholder="Ví dụ: 50.000"
                placeholderTextColor={COLORS.textLight}
                keyboardType="numeric"
                value={pricePerHour}
                onChangeText={(text) => {
                  setPricePerHour(formatInputNumber(text));
                  setError('');
                }}
              />
            </View>
          ) : (
            <View>
              {/* Hộp cấu hình tạo hàng loạt */}
              <View style={styles.batchConfigRow}>
                <View style={{ flex: 1.2, marginRight: 8 }}>
                  <Text style={styles.label}>Số lượng bàn:</Text>
                  <TextInput
                    style={[styles.input, { marginBottom: 0 }]}
                    placeholder="Ví dụ: 0"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="numeric"
                    value={numTables}
                    onChangeText={(text) => {
                      setNumTables(text.replace(/[^0-9]/g, ''));
                      setError('');
                    }}
                  />
                </View>
                <View style={{ flex: 1.8, marginRight: 8 }}>
                  <Text style={styles.label}>Giá chung (VND/giờ):</Text>
                  <TextInput
                    style={[styles.input, { marginBottom: 0 }]}
                    placeholder="Ví dụ: 50.000"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="numeric"
                    value={commonPrice}
                    onChangeText={handleCommonPriceChange}
                  />
                </View>
                <TouchableOpacity
                  style={styles.applyButton}
                  onPress={handleApplyBatch}
                  activeOpacity={0.7}
                >
                  <Text style={styles.applyButtonText}>Áp dụng</Text>
                </TouchableOpacity>
              </View>

              {/* Tiêu đề danh sách bàn đã map */}
              <View style={styles.listHeaderRow}>
                <Text style={[styles.label, { marginBottom: 0 }]}>Danh sách bàn tạo mới ({tableList.length}):</Text>
              </View>

              {/* Render danh sách chi tiết các bàn */}
              <View style={styles.rowsContainer}>
                {tableList.map((item, index) => (
                  <View key={index} style={styles.tableRow}>
                    <View style={{ flex: 2, marginRight: 8 }}>
                      <Text style={styles.rowLabel}>Tên bàn/phòng:</Text>
                      <TextInput
                        style={[styles.input, { marginBottom: 0 }]}
                        placeholder="Ví dụ: Bàn 1..."
                        placeholderTextColor={COLORS.textLight}
                        value={item.name}
                        onChangeText={(text) => updateTableName(index, text)}
                      />
                    </View>
                    <View style={{ flex: 2, marginRight: 8 }}>
                      <Text style={styles.rowLabel}>Giá riêng/giờ (VND):</Text>
                      <TextInput
                        style={[styles.input, { marginBottom: 0 }]}
                        placeholder="Ví dụ: 50000"
                        placeholderTextColor={COLORS.textLight}
                        keyboardType="numeric"
                        value={item.pricePerHour}
                        onChangeText={(text) => updateTablePrice(index, text)}
                      />
                    </View>
                    {tableList.length > 1 && (
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => removeTableRow(index)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.removeButtonText}>🗑️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Cụm nút hành động bên dưới */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>XÁC NHẬN</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => setVisible(false)}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>HỦY BỎ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: FONTS.weightBold,
    color: '#0F766E', // Xanh teal
    textAlign: 'center',
    marginBottom: 15,
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 15,
  },
  formScroll: {
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: FONTS.weightBold,
    color: COLORS.text,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  batchConfigRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  applyButton: {
    backgroundColor: '#0F766E',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  addButton: {
    backgroundColor: '#0F766E',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  rowsContainer: {
    marginTop: 4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  rowLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  removeButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    width: 40,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 16,
    color: '#EF4444',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  button: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: '#0F766E',
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

export default AddShopTableModal;
