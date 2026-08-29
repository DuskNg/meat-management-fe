// meat-management-fe/src/components/MoneyInput.js
import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TextInput, Platform } from 'react-native';
import { COLORS } from '../theme';

/**
 * Component MoneyInput:
 * Tự động gắn đuôi ".000" mặc định cho các ô nhập tiền VNĐ.
 * Đuôi ".000" nằm trực tiếp trong chuỗi hiển thị của ô nhập -> 100% không bị hở khoảng trắng.
 * Con trỏ chuột nằm tự nhiên ở phần số người dùng nhập (trước .000).
 */
const MoneyInput = ({
  value,            // Số VNĐ (number: 130000) hoặc chuỗi nghìn/chuỗi VNĐ
  onChangeValue,    // Callback nhận giá trị VNĐ thực (number: 130000)
  onChangeText,     // Callback nhận chuỗi VNĐ đầy đủ (string: "130.000")
  placeholder = '0',
  style,
  inputStyle,
  suffixStyle,
  disabled = false,
  error = false,
  textAlign = 'left',
  ...props
}) => {
  // Chuyển đổi bất kỳ input value nào thành chuỗi số hàng nghìn được format (VD: 130000 -> "130")
  const parseToThousandsStr = (val) => {
    if (val === undefined || val === null || val === '') return '';
    const clean = String(val).replace(/[^0-9]/g, '');
    if (!clean) return '';
    const num = parseInt(clean, 10);
    if (isNaN(num) || num === 0) return '';
    const thousands = num >= 1000 ? Math.floor(num / 1000) : num;
    return new Intl.NumberFormat('vi-VN').format(thousands);
  };

  const [thousandsText, setThousandsText] = useState(() => parseToThousandsStr(value));
  const [selection, setSelection] = useState(undefined);

  useEffect(() => {
    setThousandsText(parseToThousandsStr(value));
  }, [value]);

  const handleChangeText = (text) => {
    const cleanDigits = text.replace(/[^0-9]/g, '');
    if (!cleanDigits) {
      setThousandsText('');
      setSelection(undefined);
      if (onChangeValue) onChangeValue(0);
      if (onChangeText) onChangeText('');
      return;
    }

    let numThousands = 0;
    // Nếu chuỗi kết thúc bằng 000 (do đuôi .000 có sẵn trong hiển thị)
    if (cleanDigits.length > 3 && cleanDigits.endsWith('000')) {
      numThousands = Math.floor(parseInt(cleanDigits, 10) / 1000);
    } else {
      numThousands = parseInt(cleanDigits, 10);
    }

    if (numThousands <= 0) {
      setThousandsText('');
      setSelection(undefined);
      if (onChangeValue) onChangeValue(0);
      if (onChangeText) onChangeText('');
      return;
    }

    const formattedThousands = new Intl.NumberFormat('vi-VN').format(numThousands);
    const numericVND = numThousands * 1000;
    const formattedVND = new Intl.NumberFormat('vi-VN').format(numericVND);

    setThousandsText(formattedThousands);
    // Đặt con trỏ chuột nằm ngay sau chữ số đã gõ (trước đuôi .000)
    const newPos = formattedThousands.length;
    setSelection({ start: newPos, end: newPos });

    if (onChangeValue) onChangeValue(numericVND);
    if (onChangeText) onChangeText(formattedVND);
  };

  const hasValue = thousandsText.length > 0;
  const displayValue = hasValue ? `${thousandsText}.000` : '';

  // Lấy thuộc tính kiểu dáng để tách riêng cho Container và TextInput
  const flatStyle = StyleSheet.flatten(style) || {};
  const flatInputStyle = StyleSheet.flatten(inputStyle) || {};

  const fontSize = flatInputStyle.fontSize || flatStyle.fontSize || 16;
  const fontWeight = flatInputStyle.fontWeight || flatStyle.fontWeight || '600';
  const textColor = flatInputStyle.color || flatStyle.color || COLORS.text || '#0F172A';

  return (
    <View
      style={[
        styles.container,
        {
          height: flatStyle.height || flatInputStyle.height || 44,
          backgroundColor: flatStyle.backgroundColor || flatInputStyle.backgroundColor || COLORS.inputBg || '#F8FAFC',
          borderRadius: flatStyle.borderRadius !== undefined ? flatStyle.borderRadius : (flatInputStyle.borderRadius !== undefined ? flatInputStyle.borderRadius : 10),
          borderWidth: flatStyle.borderWidth !== undefined ? flatStyle.borderWidth : (flatInputStyle.borderWidth !== undefined ? flatInputStyle.borderWidth : 1),
          borderColor: error
            ? (COLORS.danger || '#EF4444')
            : (flatStyle.borderColor || flatInputStyle.borderColor || COLORS.border || '#E2E8F0'),
          paddingHorizontal: flatStyle.paddingHorizontal !== undefined ? flatStyle.paddingHorizontal : (flatInputStyle.paddingHorizontal !== undefined ? flatInputStyle.paddingHorizontal : 10),
          justifyContent: textAlign === 'right' ? 'flex-end' : 'flex-start',
        },
        style,
      ]}
    >
      <TextInput
        style={[
          styles.input,
          {
            fontSize,
            fontWeight,
            color: textColor,
            textAlign: textAlign === 'right' ? 'right' : 'left',
            width: '100%',
          },
        ]}
        value={displayValue}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textLight || '#94A3B8'}
        keyboardType="number-pad"
        editable={!disabled}
        selection={selection}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
        selectTextOnFocus={true}
        {...props}
      />
    </View>
  );
};

export default MoneyInput;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    boxSizing: 'border-box',
  },
  input: {
    padding: 0,
    margin: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    outlineWidth: 0,
    outlineColor: 'transparent',
    outlineStyle: 'none',
    shadowOpacity: 0,
  },
});
