// meat-management-fe/src/components/DailyDebtTile.js
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { COLORS, SHADOWS } from '../theme';

// Lấy thứ trong tuần viết tắt tiếng Việt
const getWeekday = (dateStr) => {
  return ['C.Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][new Date(dateStr).getDay()];
};

// Định dạng ngày ngắn (Ví dụ: 2026-06-23 -> 23/06)
const formatShortDate = (dateStr) => {
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
};

// Tiền rút gọn hiển thị trên các ô ngày (Ví dụ: 150.000 -> 150k, 1.200.000 -> 1.2tr)
const formatAmountShort = (amount) => {
  if (amount >= 1_000_000) {
    const v = (amount / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${v}tr`;
  }
  return `${Math.round(amount / 1_000)}k`;
};

const DailyDebtTile = ({ group, tileSize, onPress }) => {
  const netAmount = group.totalDebt - group.totalPayment;

  let dayBgColor, dayBdColor, dayTxtColor, displayAmt;
  if (netAmount > 0) {
    // Phát sinh nợ ròng trong ngày
    dayBgColor = '#FFF1F1';
    dayBdColor = '#FECACA';
    dayTxtColor = COLORS.danger;
    displayAmt = `+${formatAmountShort(netAmount)}`;
  } else if (netAmount < 0) {
    // Phát sinh thu tiền ròng trong ngày (khách trả bớt nợ)
    dayBgColor = '#F0FDF4';
    dayBdColor = '#86EFAC';
    dayTxtColor = COLORS.primary;
    displayAmt = `-${formatAmountShort(Math.abs(netAmount))}`;
  } else {
    // Hòa hoặc không tăng nợ (ví dụ mua 500k trả đủ 500k trong ngày)
    dayBgColor = '#F0FDF4';
    dayBdColor = '#86EFAC';
    dayTxtColor = COLORS.primary;
    displayAmt = '0đ';
  }

  return (
    <TouchableOpacity
      style={[
        styles.tile,
        {
          width: tileSize,
          height: tileSize,
          backgroundColor: dayBgColor,
          borderColor: dayBdColor,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.tileWeekday, { color: dayTxtColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {getWeekday(group.date)}
      </Text>
      <Text style={styles.tileDate} numberOfLines={1} adjustsFontSizeToFit>
        {formatShortDate(group.date)}
      </Text>
      <Text style={[styles.tileAmount, { color: dayTxtColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {displayAmt}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  tile: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 4,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...SHADOWS.card,
  },
  tileWeekday: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  tileDate: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text,
  },
  tileAmount: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default DailyDebtTile;
