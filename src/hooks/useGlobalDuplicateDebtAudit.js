// meat-management-fe/src/hooks/useGlobalDuplicateDebtAudit.js
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  auditGlobalTransactionsForDuplicates,
  buildGlobalAuditWarningMessage,
  computeDuplicatesSignature,
} from '../utils/debtExportAuditHelper';

/**
 * Custom Hook: Kiểm tra ngầm toàn cục trùng lặp đơn hàng trong ngày (Global Background Debt Audit)
 * - Tự động quét toàn bộ giao dịch phát sinh gần đây của các khách hàng.
 * - Phát hiện nếu trong cùng 1 ngày có từ 2 dòng thịt cùng tên và số kg lệch < 0.2kg.
 * - Bật Pop-up cảnh báo khi phát hiện trùng đơn mới hoặc sau khi người dùng vừa lưu nợ.
 * - Cung cấp danh sách trùng lặp để hiển thị thanh Banner cảnh báo ghim trên màn hình.
 * - Sử dụng Ref để lưu trữ tham chiếu, ngăn ngừa hoàn toàn vòng lặp vô hạn (Maximum update depth exceeded).
 */
export const useGlobalDuplicateDebtAudit = ({
  transactions = [],
  customers = [],
  popupModalRef = null,
  onInspectCustomer = null,
}) => {
  const [globalDuplicates, setGlobalDuplicates] = useState([]);

  // Dùng Ref để lưu trữ tham chiếu động, tránh trigger re-render vòng lặp
  const onInspectCustomerRef = useRef(onInspectCustomer);
  onInspectCustomerRef.current = onInspectCustomer;

  const popupModalRefRef = useRef(popupModalRef);
  popupModalRefRef.current = popupModalRef;

  const customersRef = useRef(customers);
  customersRef.current = customers;

  const globalDuplicatesRef = useRef([]);
  globalDuplicatesRef.current = globalDuplicates;

  const currentDuplicatesSigRef = useRef('');
  const lastAlertedSignatureRef = useRef('');
  const isAfterSubmitRef = useRef(false);

  // Mở popup cảnh báo chi tiết các khách hàng bị trùng
  const showDuplicateAlertModal = useCallback((customList = null) => {
    const targetList = customList || globalDuplicatesRef.current;
    if (!targetList || targetList.length === 0) return;

    const popupModal = popupModalRefRef.current?.current || popupModalRefRef.current;
    if (!popupModal) return;

    popupModal.show({
      type: 'confirm',
      title: '⚠️ CẢNH BÁO TRÙNG ĐƠN TRONG NGÀY',
      message: buildGlobalAuditWarningMessage(targetList),
      confirmText: 'Kiểm tra chi tiết',
      cancelText: 'Đã hiểu / Bỏ qua',
      onConfirm: () => {
        const firstDup = targetList[0];
        if (firstDup && onInspectCustomerRef.current) {
          onInspectCustomerRef.current(firstDup.customerId, firstDup.customer);
        }
      },
    });
  }, []);

  // Hàm thực hiện kiểm tra ngầm
  const executeAudit = useCallback(
    (txList, forceAlert = false) => {
      if (!txList || txList.length === 0) {
        if (currentDuplicatesSigRef.current !== '') {
          currentDuplicatesSigRef.current = '';
          setGlobalDuplicates([]);
        }
        return;
      }

      // Quét ngầm toàn bộ giao dịch trong vòng 7 ngày gần đây
      const duplicateResults = auditGlobalTransactionsForDuplicates({
        transactions: txList,
        customers: customersRef.current || [],
      });

      const newSig = computeDuplicatesSignature(duplicateResults);

      // CHỈ cập nhật state nếu chữ ký trùng lặp thay đổi (ngăn re-render loop)
      if (newSig !== currentDuplicatesSigRef.current) {
        currentDuplicatesSigRef.current = newSig;
        setGlobalDuplicates(duplicateResults);
      }

      if (duplicateResults.length > 0) {
        // Bật pop-up nếu:
        // 1. Người dùng vừa bấm Lưu công nợ (forceAlert / isAfterSubmit)
        // 2. Hoặc chữ ký mới khác chữ ký cũ (vừa phát hiện thêm đơn trùng mới chưa từng cảnh báo)
        if (forceAlert || newSig !== lastAlertedSignatureRef.current) {
          lastAlertedSignatureRef.current = newSig;
          showDuplicateAlertModal(duplicateResults);
        }
      } else {
        lastAlertedSignatureRef.current = '';
      }
    },
    [showDuplicateAlertModal]
  );

  // Lắng nghe thay đổi dữ liệu giao dịch từ API (sau khi refetch hoặc tải mới)
  useEffect(() => {
    if (transactions && transactions.length > 0) {
      const forceAlert = isAfterSubmitRef.current;
      isAfterSubmitRef.current = false;
      executeAudit(transactions, forceAlert);
    }
  }, [transactions, executeAudit]);

  // Hàm được gọi từ bên ngoài để đánh dấu vừa submit ghi nợ thành công
  const notifyDebtSubmitted = useCallback(() => {
    isAfterSubmitRef.current = true;
  }, []);

  return {
    globalDuplicates,
    hasDuplicates: globalDuplicates.length > 0,
    showDuplicateAlertModal,
    notifyDebtSubmitted,
    recheckDuplicates: () => executeAudit(transactions, true),
  };
};

export default useGlobalDuplicateDebtAudit;
