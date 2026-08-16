// meat-management-fe/src/components/shop/ShopSessionModal.js
import React, { useState, forwardRef, useImperativeHandle, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { api } from '../../api/client';
import { COLORS, FONTS, SHADOWS } from '../../theme';
import SmoothModal from '../SmoothModal';
import AddShopSessionItemModal from './AddShopSessionItemModal';
import { useResourceLock } from '../../hooks/useResourceLock';

/**
 * Component ShopSessionModal quản lý phiên chơi:
 * - Theo dõi thời gian thực của phiên đang chơi (cập nhật mỗi giây để trực quan)
 * - Quản lý các món phụ thu lấy trực tiếp từ Quản lý Kho (tự động trừ kho)
 * - Kết thúc chơi tính tiền giờ
 * - Xác nhận thanh toán hóa đơn phiên chơi
 */
const ShopSessionModal = forwardRef(({ onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [table, setTable] = useState(null);
  const [session, setSession] = useState(null);

  // Tự động khóa bàn cho người dùng khác thấy khi mở modal phiên chơi
  useResourceLock('SHOP_TABLE', table?.id, visible);

  // States phụ thu thủ công (nếu có thêm phụ thu ngoài)
  const [extraAmount, setExtraAmount] = useState('0');
  const [extraNote, setExtraNote] = useState('');
  const [showManualExtra, setShowManualExtra] = useState(false);

  // States tính toán động
  const [playTimeText, setPlayTimeText] = useState('0 phút 0 giây');
  const [playAmount, setPlayAmount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [itemLoadingId, setItemLoadingId] = useState(null);
  const [error, setError] = useState('');

  const timerRef = useRef(null);
  const addItemModalRef = useRef(null);

  // Lưu số lượng thay đổi của các item khi nhấn + hoặc -
  const [localQuantities, setLocalQuantities] = useState({});
  // Lưu các item ID bị đánh dấu xóa tạm thời dưới client
  const [deletedItemIds, setDeletedItemIds] = useState(new Set());

  // Tự động dọn dẹp các thay đổi local khi ẩn modal
  useEffect(() => {
    if (!visible) {
      setLocalQuantities({});
      setDeletedItemIds(new Set());
    }
  }, [visible]);

  // Kiểm tra xem người dùng đã thực hiện bất kỳ thay đổi nào chưa lưu hay chưa
  const hasChanges = useMemo(() => {
    if (!session) return false;
    const itemsList = session.items || [];
    
    // Nếu có món nào bị xóa tạm thời
    if (deletedItemIds.size > 0) return true;

    // Nếu có món nào bị đổi số lượng
    for (const item of itemsList) {
      const origQty = parseFloat(item.quantity || 0);
      const currentQty = localQuantities[item.id] !== undefined ? localQuantities[item.id] : origQty;
      if (currentQty !== origQty) return true;
    }

    return false;
  }, [session, localQuantities, deletedItemIds]);

  // Tính tổng tiền nước/món theo database
  const dbItemsTotal = useMemo(() => {
    if (!session) return 0;
    const itemsList = session.items || [];
    return itemsList.reduce((sum, item) => sum + Math.round(parseFloat(item.quantity || 0) * parseFloat(item.price || 0)), 0);
  }, [session]);

  // Tính tổng tiền nước/món tạm thời theo localQuantities và deletedItemIds
  const tempItemsTotal = useMemo(() => {
    if (!session) return 0;
    const itemsList = session.items || [];
    return itemsList.reduce((sum, item) => {
      if (deletedItemIds.has(item.id)) return sum; // Bỏ qua món bị xóa tạm thời
      const qty = localQuantities[item.id] !== undefined ? localQuantities[item.id] : parseFloat(item.quantity || 0);
      return sum + Math.round(qty * parseFloat(item.price || 0));
    }, 0);
  }, [session, localQuantities, deletedItemIds]);

  // Phụ thu hiển thị (bao gồm phần chênh lệch chưa lưu)
  const displayExtraAmount = useMemo(() => {
    if (!session) return 0;
    const baseExtra = session.extraAmount || 0;
    const diff = tempItemsTotal - dbItemsTotal;
    return baseExtra + diff;
  }, [session, tempItemsTotal, dbItemsTotal]);

  // Tổng tiền hiển thị
  const displayTotalAmount = useMemo(() => {
    return playAmount + displayExtraAmount;
  }, [playAmount, displayExtraAmount]);

  // Lấy số lượng hiển thị thực tế của sản phẩm
  const getItemQty = (item) => {
    if (localQuantities[item.id] !== undefined) {
      return localQuantities[item.id];
    }
    return parseFloat(item.quantity || 0);
  };

  // Lấy thành tiền hiển thị thực tế của sản phẩm
  const getItemAmount = (item) => {
    const qty = getItemQty(item);
    return qty * parseFloat(item.price || 0);
  };

  // Lấy tồn kho hiển thị thực tế của sản phẩm (tính cả phần thay đổi tạm thời chưa lưu)
  const getItemStock = (item) => {
    const origQty = parseFloat(item.quantity || 0);
    const dbStock = parseFloat(item.product?.quantity || 0);
    if (deletedItemIds.has(item.id)) {
      return dbStock + origQty; // Nếu xóa món, hoàn trả toàn bộ số lượng ban đầu về kho
    }
    const currentQty = getItemQty(item);
    const delta = currentQty - origQty;
    return Math.max(0, dbStock - delta);
  };

  // Phơi bày các phương thức ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: (targetTable, targetSession) => {
      setError('');
      setTable(targetTable);
      setSession(targetSession);
      setExtraAmount(targetSession.extraAmount ? targetSession.extraAmount.toString() : '0');
      setExtraNote(targetSession.extraNote || '');
      setShowManualExtra(!!targetSession.extraNote);
      setLocalQuantities({});
      setDeletedItemIds(new Set());
      setVisible(true);
    },
    close: () => {
      setLocalQuantities({});
      setDeletedItemIds(new Set());
      setVisible(false);
    },
  }));

  // Hàm định dạng tiền tệ VND
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(val || 0)
      .replace('₫', 'đ');
  };

  // Cập nhật bộ đếm thời gian
  useEffect(() => {
    if (!visible || !session) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const updateTicker = () => {
      const start = new Date(session.startTime);
      const end = session.endTime ? new Date(session.endTime) : new Date();
      const diffMs = Math.max(0, end - start);

      const hours = diffMs / (1000 * 60 * 60);
      const calculatedPlayAmount = Math.round(hours * table.pricePerHour);

      const totalMinutes = Math.floor(diffMs / (1000 * 60));
      const hr = Math.floor(totalMinutes / 60);
      const mn = totalMinutes % 60;
      const sec = Math.floor((diffMs / 1000) % 60);

      let timeStr = '';
      if (hr > 0) {
        timeStr = `${hr} giờ ${mn} phút ${sec} giây`;
      } else {
        timeStr = `${mn} phút ${sec} giây`;
      }

      setPlayTimeText(timeStr);
      setPlayAmount(calculatedPlayAmount);
    };

    updateTicker();
    timerRef.current = setInterval(updateTicker, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, session, table]);

  // Điều chỉnh số lượng món kho (Tăng/Giảm) lưu tạm thời ở client
  const handleAdjustQty = (item, type) => {
    if (!session || itemLoadingId) return;

    const currentQty = localQuantities[item.id] !== undefined 
      ? localQuantities[item.id] 
      : parseFloat(item.quantity || 0);

    const nextQty = type === 'increase' ? currentQty + 1 : currentQty - 1;

    if (nextQty <= 0) {
      handleDeleteItem(item);
      return;
    }

    // Kiểm tra giới hạn kho (Số lượng tối đa = Số lượng đã lưu + Số lượng còn lại trong kho)
    const maxQty = parseFloat(item.quantity) + parseFloat(item.product?.quantity || 0);

    if (nextQty > maxQty) {
      Alert.alert(
        'Không đủ hàng',
        `Kho chỉ còn lại tối đa ${parseFloat(item.product?.quantity || 0)} ${item.product?.unit || 'đơn vị'} sản phẩm này.`
      );
      return;
    }

    // Cập nhật số lượng tạm thời lên UI
    setLocalQuantities(prev => ({
      ...prev,
      [item.id]: nextQty
    }));
  };

  // Xác nhận và lưu toàn bộ thay đổi (gửi API hàng loạt)
  const handleSaveChanges = async () => {
    if (!session || !hasChanges) return;
    setLoading(true);
    setError('');
    try {
      let lastSession = session;

      // 1. Thực hiện xóa các món bị hủy
      for (const itemId of deletedItemIds) {
        const res = await api.delete(`/shop/sessions/${session.id}/items/${itemId}`);
        if (res.data && res.data.success) {
          lastSession = res.data.data;
        }
      }

      // 2. Thực hiện cập nhật số lượng các món thay đổi
      for (const item of (session.items || [])) {
        if (deletedItemIds.has(item.id)) continue;
        const origQty = parseFloat(item.quantity || 0);
        const targetQty = localQuantities[item.id] !== undefined ? localQuantities[item.id] : origQty;
        if (targetQty !== origQty) {
          const res = await api.put(`/shop/sessions/${session.id}/items/${item.id}`, {
            quantity: targetQty,
          });
          if (res.data && res.data.success) {
            lastSession = res.data.data;
          }
        }
      }

      // Đồng bộ dữ liệu phiên mới lên UI
      setSession(lastSession);
      setLocalQuantities({});
      setDeletedItemIds(new Set());
      if (onRefresh) onRefresh();

      Alert.alert('Thành công', 'Đã lưu mọi thay đổi thành công.');
    } catch (err) {
      console.error('Lỗi khi lưu thay đổi:', err);
      setError(err.response?.data?.message || 'Có lỗi xảy ra khi lưu thay đổi.');
    } finally {
      setLoading(false);
    }
  };

  // Đánh dấu xóa tạm thời món ăn ở giao diện
  const handleDeleteItem = (item) => {
    if (!session) return;

    Alert.alert(
      'Hủy món',
      `Bạn có chắc chắn muốn hủy "${item.product?.name || 'món ăn'}"? Món này sẽ được đánh dấu để xóa khỏi phòng/bàn.`,
      [
        { text: 'Không', style: 'cancel' },
        {
          text: 'Xóa tạm',
          style: 'destructive',
          onPress: () => {
            setDeletedItemIds(prev => {
              const next = new Set(prev);
              next.add(item.id);
              return next;
            });
            // Xóa khỏi thay đổi số lượng nếu có
            setLocalQuantities(prev => {
              const next = { ...prev };
              delete next[item.id];
              return next;
            });
          },
        },
      ]
    );
  };

  // Cập nhật phụ thu thủ công lên server
  const handleUpdateManualExtra = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const parsedExtra = parseInt(extraAmount, 10) || 0;
      const response = await api.put(`/shop/sessions/${session.id}/extra`, {
        extraAmount: parsedExtra,
        extraNote: extraNote.trim() || null,
      });

      if (response.data.success) {
        setSession(response.data.data);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi cập nhật khoản phụ thu.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng khi cập nhật phụ thu.');
    } finally {
      setLoading(false);
    }
  };

  // Kết thúc phiên chơi (Dừng đồng hồ tính giờ)
  const handleEndSession = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.put(`/shop/sessions/${session.id}/end`);
      if (response.data.success) {
        setSession(response.data.data);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi khi kết thúc phiên.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng khi kết thúc phiên.');
    } finally {
      setLoading(false);
    }
  };

  // Thanh toán và đóng phiên chơi (Bàn chuyển về Trống)
  const handlePaySession = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.post(`/shop/sessions/${session.id}/pay`);
      if (response.data.success) {
        setVisible(false);
        if (onRefresh) onRefresh();
      } else {
        setError(response.data.message || 'Lỗi xử lý thanh toán.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối mạng khi thanh toán.');
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !table || !session) return null;

  const isSessionEnded = !!session.endTime;
  const items = session.items || [];

  return (
    <SmoothModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>🏪 CHI TIẾT PHIÊN CHƠI - {table.name}</Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          {/* Thông tin thời gian và số tiền giờ tạm tính */}
          <View style={styles.infoBox}>
            <Text style={styles.infoRow}>
              <Text style={styles.infoLabel}>Giờ vào:</Text>{' '}
              <Text style={styles.infoValue}>
                {new Date(session.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Text>

            {isSessionEnded && (
              <Text style={styles.infoRow}>
                <Text style={styles.infoLabel}>Giờ ra:</Text>{' '}
                <Text style={styles.infoValue}>
                  {new Date(session.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </Text>
            )}

            <Text style={styles.infoRow}>
              <Text style={styles.infoLabel}>Thời gian đã chơi:</Text>{' '}
              <Text style={[styles.infoValue, { color: isSessionEnded ? COLORS.text : '#EF4444' }]}>
                {playTimeText}
              </Text>
            </Text>

            <Text style={styles.infoRow}>
              <Text style={styles.infoLabel}>Đơn giá:</Text>{' '}
              <Text style={styles.infoValue}>{formatCurrency(table.pricePerHour)}/giờ</Text>
            </Text>

            <View style={styles.divider} />

            <Text style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tiền giờ chơi:</Text>{' '}
              <Text style={[styles.infoValue, { fontWeight: 'bold' }]}>{formatCurrency(playAmount)}</Text>
            </Text>
          </View>

          {/* KHUNG NƯỚC UỐNG & MÓN GỌI THÊM (TỰ ĐỘNG TRỪ KHO) */}
          <View style={styles.inventorySection}>
            <Text style={styles.sectionHeader}>🥤 Nước uống & Đồ ăn gọi thêm:</Text>

            {items.length === 0 ? (
              <View style={styles.emptyItemsBox}>
                <Text style={styles.emptyItemsText}>Chưa có món hoặc nước uống nào được gọi thêm.</Text>
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={() => addItemModalRef.current?.open(session.id, table.name)}
                >
                  <Text style={styles.emptyAddBtnText}>+ Gọi thêm nước uống / đồ ăn</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.itemsList}>
                {items.map((it) => {
                  if (deletedItemIds.has(it.id)) return null;

                  return (
                    <View key={it.id} style={styles.itemRow}>
                      {/* 1. Tên món & đơn giá bên trái kèm số lượng còn lại ở kho */}
                      <View style={styles.itemInfoCol}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {it.product?.name || 'Sản phẩm'}
                        </Text>
                        <Text style={styles.itemMeta}>
                          Kho còn: {getItemStock(it)} ({it.product?.unit || 'cái'})
                        </Text>
                      </View>

                      {/* 2. Giá / Thành tiền ở giữa */}
                      <View style={styles.itemAmountCol}>
                        <Text style={styles.itemAmountText}>{formatCurrency(getItemAmount(it))}</Text>
                      </View>

                      {/* 3. Bộ điều khiển số lượng */}
                      <View style={styles.qtyControls}>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => handleAdjustQty(it, 'decrease')}
                          disabled={itemLoadingId === it.id}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.qtyBtnText}>-</Text>
                        </TouchableOpacity>

                        <View style={styles.qtyValueBox}>
                          <Text style={styles.qtyValueText}>
                            {getItemQty(it)}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => handleAdjustQty(it, 'increase')}
                          disabled={itemLoadingId === it.id}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.qtyBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>

                      {/* 4. Nút xóa ở cuối cùng bên phải */}
                      <TouchableOpacity
                        onPress={() => handleDeleteItem(it)}
                        style={styles.deleteItemBtn}
                        disabled={itemLoadingId === it.id}
                        activeOpacity={0.7}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={styles.deleteItemIcon}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}

                <TouchableOpacity
                  style={[styles.emptyAddBtn, { marginTop: 6 }]}
                  onPress={() => addItemModalRef.current?.open(session.id, table.name)}
                >
                  <Text style={styles.emptyAddBtnText}>+ Gọi thêm nước uống / đồ ăn</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Tùy chọn mở rộng: Phụ thu khác ngoài kho nếu có */}
          <TouchableOpacity
            style={styles.toggleManualBtn}
            onPress={() => setShowManualExtra(!showManualExtra)}
          >
            <Text style={styles.toggleManualText}>
              {showManualExtra ? '▲ Ẩn phụ thu khác (thủ công)' : '▼ Nhập phụ thu khác (thủ công)'}
            </Text>
          </TouchableOpacity>

          {showManualExtra && (
            <View style={styles.extraForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Số tiền phụ thu thêm (VND):</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ví dụ: 20000"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="numeric"
                  value={extraAmount}
                  onChangeText={(text) => setExtraAmount(text.replace(/[^0-9]/g, ''))}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Ghi chú phụ thu:</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ví dụ: Phụ thu tiền phòng, nước ngọt ngoài..."
                  placeholderTextColor={COLORS.textLight}
                  value={extraNote}
                  onChangeText={setExtraNote}
                />
              </View>

              <TouchableOpacity
                style={styles.updateExtraBtn}
                onPress={handleUpdateManualExtra}
                disabled={loading}
              >
                <Text style={styles.updateExtraBtnText}>Lưu phụ thu thủ công</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Tổng tiền thanh toán cố định ở dưới: text bên trái, số tiền bên phải */}
        <View style={styles.totalBox}>
          <View style={styles.totalLeftCol}>
            <Text style={styles.totalLabel}>TỔNG THANH TOÁN:</Text>
            <Text style={styles.totalBreakdownLabel} numberOfLines={1}>
              Giờ: {formatCurrency(playAmount)} + Món: {formatCurrency(displayExtraAmount)}
            </Text>
          </View>
          <Text style={styles.totalValue}>{formatCurrency(displayTotalAmount)}</Text>
        </View>

        {/* Cụm nút bấm hành động */}
        <View style={styles.actionContainer}>
          {!isSessionEnded ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={handleEndSession}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit>
                  ⏹️ KẾT THÚC
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btn, styles.btnSuccess]}
              onPress={handlePaySession}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit>
                  💰 THANH TOÁN
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Nút Xác nhận lưu thay đổi số lượng/hủy món */}
          <TouchableOpacity
            style={[
              styles.btn,
              styles.btnConfirm,
              !hasChanges && styles.btnConfirmDisabled,
            ]}
            onPress={handleSaveChanges}
            disabled={!hasChanges || loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text
                style={[
                  styles.btnConfirmText,
                  !hasChanges && styles.btnConfirmTextDisabled,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                💾 XÁC NHẬN
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnCancel]}
            onPress={() => setVisible(false)}
            disabled={loading}
          >
            <Text style={styles.btnCancelText}>ĐÓNG</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal chọn món kho */}
      <AddShopSessionItemModal
        ref={addItemModalRef}
        onAdded={(updatedSession) => {
          setSession(updatedSession);
          if (onRefresh) onRefresh();
        }}
      />
    </SmoothModal>
  );
});

const styles = StyleSheet.create({
  modalView: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: FONTS.weightBold,
    color: '#0F766E',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorText: {
    color: COLORS.dangerDark,
    backgroundColor: COLORS.dangerLight,
    padding: 8,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  scrollContainer: {
    maxHeight: 380,
    marginBottom: 8,
  },
  infoBox: {
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    fontSize: 13,
  },
  infoLabel: {
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    color: COLORS.text,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#CCFBF1',
    marginVertical: 4,
  },
  inventorySection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 10,
  },
  btnAddItem: {
    backgroundColor: '#0F766E',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  btnAddItemText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyItemsBox: {
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  emptyItemsText: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 6,
  },
  emptyAddBtn: {
    backgroundColor: '#E0F2FE',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  emptyAddBtnText: {
    color: '#0284C7',
    fontSize: 12,
    fontWeight: 'bold',
  },
  itemsList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  itemInfoCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  itemName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  itemMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexShrink: 0,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
  },
  qtyBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  qtyValueBox: {
    minWidth: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValueText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  itemAmountCol: {
    width: 82,
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemAmountText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F766E',
    textAlign: 'right',
  },
  deleteItemBtn: {
    padding: 4,
    marginLeft: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteItemIcon: {
    fontSize: 14,
  },
  toggleManualBtn: {
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  toggleManualText: {
    fontSize: 12,
    color: '#64748B',
    textDecorationLine: 'underline',
  },
  extraForm: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  inputGroup: {
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  input: {
    backgroundColor: COLORS.card,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  updateExtraBtn: {
    backgroundColor: '#14B8A6',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  updateExtraBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 1.2,
    borderColor: '#99F6E4',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  totalLeftCol: {
    flex: 1,
    paddingRight: 10,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F766E',
    marginBottom: 2,
  },
  totalBreakdownLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1.2,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  btnDanger: {
    backgroundColor: '#EF4444',
  },
  btnSuccess: {
    backgroundColor: '#0F766E',
  },
  btnCancel: {
    flex: 0.8,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnCancelText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  btnConfirm: {
    backgroundColor: '#7C3AED',
  },
  btnConfirmDisabled: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  btnConfirmText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  btnConfirmTextDisabled: {
    color: '#94A3B8',
  },
});

export default ShopSessionModal;
