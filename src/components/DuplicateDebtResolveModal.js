// meat-management-fe/src/components/DuplicateDebtResolveModal.js
import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import SmoothModal from './SmoothModal';
import PopupModal from './PopupModal';
import { api } from '../api/client';
import { COLORS, SHADOWS } from '../theme';
import { showGlobalToast } from '../store/toastStore';
import {
  addConfirmedValidDuplicateKeys,
  buildDuplicateGroupKey,
  buildDuplicateKeysFromResults,
} from '../utils/debtExportAuditHelper';

/**
 * Helper: Định dạng tiền tệ VND chuẩn Việt Nam
 */
const formatCurrency = (val) => {
  const num = parseFloat(val) || 0;
  return num.toLocaleString('vi-VN') + ' đ';
};

/**
 * Helper: Trích xuất giờ:phút từ ISO date string
 */
const formatTimeOnly = (dateInput) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * Component Modal: Xem chi tiết & Xóa / Sửa trực tiếp các đơn nghi trùng lặp trong ngày
 * - Chuẩn Bottom-Sheet neo sát đáy màn hình theo Mobile-First.
 * - Hiển thị trực tiếp các đơn hàng bị nghi trùng lặp cùng giờ tạo, ghi chú, đơn giá và số kg.
 * - Cho phép người dùng bấm "Sửa đơn" (mở EditDebtModal) hoặc "Xóa đơn" (xóa trực tiếp khỏi DB) ngay trên modal.
 * - Cho phép bấm "Xác nhận đúng" (không phải trùng) cho từng món hoặc cho toàn bộ danh sách.
 */
const DuplicateDebtResolveModal = forwardRef(({ onEditTransaction, onRefresh }, ref) => {
  const [visible, setVisible] = useState(false);
  const [duplicateList, setDuplicateList] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const popupRef = useRef(null);

  // Phơi bày các hàm điều khiển ra bên ngoài
  useImperativeHandle(ref, () => ({
    open: (list = []) => {
      const validList = Array.isArray(list) ? list : [];
      setDuplicateList(validList);
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
  }));

  const handleClose = () => {
    setVisible(false);
  };

  // Xóa trực tiếp một đơn hàng (Transaction)
  const handleDeleteTransaction = (transaction, customerName) => {
    if (!transaction || !transaction.id) {
      showGlobalToast('Không tìm thấy thông tin đơn hàng để xóa.', 'error');
      return;
    }

    const txAmountStr = formatCurrency(transaction.totalAmount);
    const txTimeStr = formatTimeOnly(transaction.createdAt || transaction.date);
    const timeLabel = txTimeStr ? ` (lúc ${txTimeStr})` : '';

    popupRef.current?.show({
      type: 'confirm',
      title: '🗑️ XÁC NHẬN XÓA ĐƠN HÀNG',
      message: `Bạn có chắc chắn muốn xóa đơn bán hàng này${timeLabel} của khách **${customerName || 'khách hàng'}** không?\n\n• Tổng tiền đơn: **${txAmountStr}**\n• Ghi chú: ${transaction.note || 'Không có'}\n\n⚠️ Đơn hàng sẽ bị xóa hoàn toàn khỏi công nợ!`,
      confirmText: 'Xác nhận xóa',
      cancelText: 'Hủy bỏ',
      onConfirm: async () => {
        try {
          setIsDeleting(true);
          await api.delete(`/transactions/${transaction.id}`);
          showGlobalToast('Đã xóa đơn hàng thành công!', 'success');

          // Cập nhật lại danh sách trùng lặp nội bộ trên modal
          setDuplicateList((prevList) => {
            const updated = prevList
              .map((res) => {
                const newGroups = (res.groups || [])
                  .map((grp) => {
                    // Loại bỏ các item thuộc transaction vừa xóa
                    const newItems = (grp.items || []).filter(
                      (it) => it.transactionId !== transaction.id && it.transaction?.id !== transaction.id
                    );
                    return {
                      ...grp,
                      items: newItems,
                      quantities: newItems.map((it) => parseFloat(it.quantity)),
                    };
                  })
                  .filter((grp) => grp.items.length >= 2); // Chỉ giữ lại các nhóm vẫn còn từ 2 đơn trở lên

                return {
                  ...res,
                  groups: newGroups,
                };
              })
              .filter((res) => (res.groups || []).length > 0);

            // Nếu sau khi xóa mà không còn đơn trùng nào, tự động đóng modal
            if (updated.length === 0) {
              setTimeout(() => {
                setVisible(false);
              }, 400);
            }

            return updated;
          });

          // Làm mới dữ liệu ngoài màn hình chính
          if (typeof onRefresh === 'function') {
            onRefresh();
          }
        } catch (err) {
          console.error('[DUPLICATE_MODAL] Lỗi xóa transaction:', err);
          showGlobalToast(err.response?.data?.message || 'Không thể xóa đơn hàng. Vui lòng thử lại!', 'error');
        } finally {
          setIsDeleting(false);
        }
      },
    });
  };

  // Mở modal sửa đơn hàng
  const handleEditTransaction = (transaction) => {
    if (!transaction) return;
    setVisible(false);
    if (typeof onEditTransaction === 'function') {
      onEditTransaction(transaction);
    }
  };

  // Xác nhận một nhóm món thịt cụ thể là đúng (khách mua 2 lần thật)
  const handleConfirmSingleGroup = (customerRes, group) => {
    const key = buildDuplicateGroupKey({
      customerId: customerRes.customerId,
      dateKey: customerRes.dateKey,
      productName: group.productName,
      quantities: group.quantities,
    });

    const txIds = [...new Set((group.items || []).map((it) => it.transactionId).filter(Boolean))].sort();
    const keysToAdd = [key];
    if (txIds.length > 0) {
      keysToAdd.push(`txs_${txIds.join('_')}_${group.productName.trim().toLowerCase()}`);
    }

    addConfirmedValidDuplicateKeys(keysToAdd);
    showGlobalToast(`Đã xác nhận món "${group.productName}" là đơn đúng!`, 'success');

    // Loại bỏ nhóm này khỏi state
    setDuplicateList((prevList) => {
      const updated = prevList
        .map((res) => {
          if (res.customerId !== customerRes.customerId || res.dateKey !== customerRes.dateKey) {
            return res;
          }
          const newGroups = (res.groups || []).filter((g) => g !== group && g.productName !== group.productName);
          return {
            ...res,
            groups: newGroups,
          };
        })
        .filter((res) => (res.groups || []).length > 0);

      if (updated.length === 0) {
        setTimeout(() => {
          setVisible(false);
        }, 400);
      }

      return updated;
    });

    if (typeof onRefresh === 'function') {
      onRefresh();
    }
  };

  // Xác nhận tất cả các đơn trong modal là đúng
  const handleConfirmAll = () => {
    if (duplicateList.length === 0) return;

    const allKeys = buildDuplicateKeysFromResults(duplicateList);
    addConfirmedValidDuplicateKeys(allKeys);
    showGlobalToast('Đã xác nhận tất cả các đơn là hợp lệ. Hệ thống sẽ không cảnh báo lại nữa!', 'success');

    setDuplicateList([]);
    setVisible(false);

    if (typeof onRefresh === 'function') {
      onRefresh();
    }
  };

  return (
    <>
      <SmoothModal visible={visible} onClose={handleClose} zIndex={9999990}>
        <View style={styles.modalContainer}>
          {/* Header chuẩn Bottom-Sheet */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>⚠️ CẢNH BÁO</Text>
              </View>
              <Text style={styles.headerTitle}>TRÙNG ĐƠN TRONG NGÀY</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Dải thông báo hướng dẫn ngắn gọn */}
          <View style={styles.guideBox}>
            <Text style={styles.guideIcon}>💡</Text>
            <Text style={styles.guideText}>
              Phát hiện các đơn có cùng tên thịt & số kg bằng nhau. Bạn có thể{' '}
              <Text style={styles.guideBold}>xóa đơn thừa</Text>,{' '}
              <Text style={styles.guideBold}>sửa đơn</Text>, hoặc bấm{' '}
              <Text style={styles.guideBold}>xác nhận đúng</Text> nếu khách mua 2 lần thật.
            </Text>
          </View>

          {/* Danh sách các khách hàng và các đơn trùng chi tiết */}
          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {duplicateList.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🎉</Text>
                <Text style={styles.emptyText}>Tất cả các đơn hàng đã được kiểm tra và xử lý xong!</Text>
              </View>
            ) : (
              duplicateList.map((custRes, cIdx) => (
                <View key={`cust_${custRes.customerId}_${cIdx}`} style={styles.customerCard}>
                  {/* Tiêu đề thông tin khách hàng */}
                  <View style={styles.customerCardHeader}>
                    <View style={styles.customerInfoLeft}>
                      <Text style={styles.customerNameText}>
                        📌 {custRes.customerName || 'Khách hàng'}
                      </Text>
                      <View style={styles.dateTag}>
                        <Text style={styles.dateTagText}>Ngày {custRes.displayDate}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Danh sách các nhóm món thịt bị trùng */}
                  {(custRes.groups || []).map((grp, gIdx) => {
                    // Gom các items theo từng transaction để hiển thị rõ từng đơn
                    const itemsByTx = [];
                    const txSeen = new Map();

                    (grp.items || []).forEach((it) => {
                      const txId = it.transactionId || 'single';
                      if (!txSeen.has(txId)) {
                        const txObj = {
                          transactionId: txId,
                          transaction: it.transaction,
                          items: [it],
                        };
                        txSeen.set(txId, txObj);
                        itemsByTx.push(txObj);
                      } else {
                        txSeen.get(txId).items.push(it);
                      }
                    });

                    return (
                      <View key={`grp_${gIdx}`} style={styles.meatGroupCard}>
                        {/* Header nhóm thịt */}
                        <View style={styles.meatGroupHeader}>
                          <View style={styles.meatGroupTitleRow}>
                            <Text style={styles.meatGroupTitle}>🥩 {grp.productName}</Text>
                            <View style={styles.dupCountBadge}>
                              <Text style={styles.dupCountBadgeText}>
                                {grp.items.length} dòng ({grp.quantities.map((q) => `${q}kg`).join(' & ')})
                              </Text>
                            </View>
                          </View>

                          {/* Nút xác nhận riêng cho nhóm này */}
                          <TouchableOpacity
                            style={styles.confirmGroupBtn}
                            onPress={() => handleConfirmSingleGroup(custRes, grp)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.confirmGroupBtnText}>✅ Xác nhận đúng</Text>
                          </TouchableOpacity>
                        </View>

                        {/* Danh sách từng đơn hàng / transaction */}
                        <View style={styles.transactionsContainer}>
                          {itemsByTx.map((txData, tIdx) => {
                            const tx = txData.transaction;
                            const timeStr = tx ? formatTimeOnly(tx.createdAt || tx.date) : '';
                            const totalAmountStr = tx ? formatCurrency(tx.totalAmount) : '';
                            const isMultipleInSameTx = txData.items.length > 1;

                            return (
                              <View key={`tx_${txData.transactionId}_${tIdx}`} style={styles.transactionCard}>
                                {/* Tiêu đề đơn hàng */}
                                <View style={styles.transactionTopRow}>
                                  <View style={styles.txHeaderLeft}>
                                    <View style={styles.txIndexBadge}>
                                      <Text style={styles.txIndexText}>Đơn #{tIdx + 1}</Text>
                                    </View>
                                    {Boolean(timeStr) && (
                                      <Text style={styles.txTimeText}>⏰ {timeStr}</Text>
                                    )}
                                  </View>
                                  {Boolean(totalAmountStr) && (
                                    <Text style={styles.txTotalAmountText}>
                                      Tổng: {totalAmountStr}
                                    </Text>
                                  )}
                                </View>

                                {/* Ghi chú của đơn nếu có */}
                                {Boolean(tx?.note) && (
                                  <Text style={styles.txNoteText}>
                                    📝 Ghi chú: <Text style={styles.txNoteHighlight}>{tx.note}</Text>
                                  </Text>
                                )}

                                {/* Cảnh báo nếu 2 dòng thịt trùng nằm trong cùng 1 đơn */}
                                {isMultipleInSameTx && (
                                  <View style={styles.sameTxWarningBox}>
                                    <Text style={styles.sameTxWarningText}>
                                      ⚠️ Có {txData.items.length} dòng thịt này nằm trong cùng 1 hóa đơn! Bạn có thể bấm Sửa đơn để xóa bớt 1 dòng.
                                    </Text>
                                  </View>
                                )}

                                {/* Chi tiết dòng thịt bị trùng trong đơn */}
                                {txData.items.map((it, itIdx) => (
                                  <View key={`it_${itIdx}`} style={styles.itemDetailRow}>
                                    <Text style={styles.itemQuantityBadge}>{it.quantity} kg</Text>
                                    <Text style={styles.itemPriceText}>
                                      × {formatCurrency(it.price || 0)} ={' '}
                                      <Text style={styles.itemAmountBold}>
                                        {formatCurrency(it.amount || it.quantity * (it.price || 0))}
                                      </Text>
                                    </Text>
                                  </View>
                                ))}

                                {/* Thanh nút thao tác trực tiếp: SỬA ĐƠN & XÓA ĐƠN */}
                                <View style={styles.txActionButtonsRow}>
                                  <TouchableOpacity
                                    style={styles.editTxBtn}
                                    onPress={() => handleEditTransaction(tx)}
                                    activeOpacity={0.8}
                                  >
                                    <Text style={styles.editTxBtnText}>✏️ Sửa đơn</Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    style={styles.deleteTxBtn}
                                    onPress={() => handleDeleteTransaction(tx, custRes.customerName)}
                                    activeOpacity={0.8}
                                    disabled={isDeleting}
                                  >
                                    <Text style={styles.deleteTxBtnText}>🗑️ Xóa đơn này</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>

          {/* Footer chân modal: Luôn có nút hành động to rõ, dễ bấm 1 tay trên điện thoại */}
          <View style={styles.footer}>
            {duplicateList.length > 0 && (
              <TouchableOpacity
                style={styles.confirmAllBtn}
                onPress={handleConfirmAll}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmAllBtnText}>✅ BẰNG CÂN NHƯNG ĐÚNG (XÁC NHẬN TẤT CẢ)</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.closeFooterBtn} onPress={handleClose} activeOpacity={0.8}>
              <Text style={styles.closeFooterBtnText}>ĐÓNG LẠI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SmoothModal>

      {/* PopupModal xác nhận xóa đặt độc lập ở tầng cao nhất theo quy chuẩn bảo mật */}
      <PopupModal ref={popupRef} />
    </>
  );
});

const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    paddingHorizontal: 16,
    flexDirection: 'column',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 8,
  },
  headerBadgeText: {
    color: '#D97706',
    fontSize: 12,
    fontWeight: '800',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748B',
  },
  guideBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
  },
  guideIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  guideText: {
    flex: 1,
    fontSize: 12.5,
    color: '#0369A1',
    lineHeight: 18,
  },
  guideBold: {
    fontWeight: '700',
    color: '#0284C7',
  },
  scrollBody: {
    flexGrow: 1,
    maxHeight: 520,
  },
  scrollContent: {
    paddingVertical: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#15803D',
    textAlign: 'center',
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  customerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  customerInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  customerNameText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  dateTag: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dateTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  meatGroupCard: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  meatGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  meatGroupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  meatGroupTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#B45309',
  },
  dupCountBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  dupCountBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  confirmGroupBtn: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  confirmGroupBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  transactionsContainer: {
    gap: 8,
  },
  transactionCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  transactionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  txHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  txIndexBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  txIndexText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  txTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  txTotalAmountText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  txNoteText: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 6,
  },
  txNoteHighlight: {
    fontWeight: '700',
    color: '#1E293B',
  },
  sameTxWarningBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 6,
    marginBottom: 6,
  },
  sameTxWarningText: {
    fontSize: 11.5,
    color: '#B91C1C',
    lineHeight: 16,
  },
  itemDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  itemQuantityBadge: {
    backgroundColor: '#FEF3C7',
    color: '#B45309',
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8,
  },
  itemPriceText: {
    fontSize: 12.5,
    color: '#475569',
  },
  itemAmountBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  txActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  editTxBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editTxBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  deleteTxBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteTxBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  footer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  confirmAllBtn: {
    width: '100%',
    height: 46,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  confirmAllBtnText: {
    color: '#047857',
    fontSize: 14,
    fontWeight: '800',
  },
  closeFooterBtn: {
    width: '100%',
    height: 44,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default DuplicateDebtResolveModal;

