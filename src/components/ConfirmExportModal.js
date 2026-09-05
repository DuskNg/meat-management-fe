// meat-management-fe/src/components/ConfirmExportModal.js
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { COLORS, FONTS, SHADOWS } from '../theme';
import SmoothModal from './SmoothModal';

const ConfirmExportModal = forwardRef(({}, ref) => {
  const [visible, setVisible] = useState(false);
  const [days, setDays] = useState([]);
  const [month, setMonth] = useState('');
  const [confirmCallback, setConfirmCallback] = useState(null);
  const [cancelCallback, setCancelCallback] = useState(null);

  // Cung cấp các hành động ra bên ngoài thông qua useImperativeHandler và forwardRef
  useImperativeHandle(ref, () => ({
    open: (daysList, monthStr, onConfirm, onCancel) => {
      setDays(daysList);
      setMonth(monthStr);
      setConfirmCallback(() => onConfirm);
      setCancelCallback(() => onCancel);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
      if (cancelCallback) cancelCallback();
    },
    submit: () => {
      setVisible(false);
      if (confirmCallback) confirmCallback();
    }
  }));

  const handleCancel = () => {
    setVisible(false);
    if (cancelCallback) cancelCallback();
  };

  const handleConfirm = () => {
    setVisible(false);
    if (confirmCallback) confirmCallback();
  };

  return (
    <SmoothModal visible={visible} onClose={handleCancel}>
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>⚠️ CẢNH BÁO CHƯA CÓ ĐƠN NỢ</Text>

        <Text style={styles.description}>
          Phát hiện có <Text style={styles.highlightText}>{days.length}</Text> ngày chưa phát sinh đơn nợ trong <Text style={styles.boldText}>Tháng {month}</Text>. Bạn có muốn tiếp tục xuất ảnh?
        </Text>

        {/* Danh sách các ngày trống */}
        <View style={styles.listContainer}>
          <Text style={styles.listTitle}>Danh sách ngày trống đơn nợ:</Text>
          <ScrollView 
            style={styles.scrollView} 
            contentContainerStyle={styles.gridContainer}
            showsVerticalScrollIndicator={true}
          >
            {days.map((day, idx) => (
              <View key={idx} style={styles.dayTag}>
                <Text style={styles.dayTagText}>Ngày {day}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={handleCancel}
          >
            <Text style={styles.cancelButtonText}>HỦY XUẤT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={handleConfirm}
          >
            <Text style={styles.submitButtonText}>TIẾP TỤC XUẤT</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SmoothModal>
  );
});

export default ConfirmExportModal;

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
    width: '100%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: FONTS.weightBold,
    color: COLORS.dangerDark,
    textAlign: 'center',
    marginBottom: 15,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  highlightText: {
    fontWeight: 'bold',
    color: COLORS.dangerDark,
  },
  boldText: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  listContainer: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  scrollView: {
    maxHeight: 180,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayTag: {
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dayTagText: {
    color: COLORS.dangerDark,
    fontSize: 12,
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
