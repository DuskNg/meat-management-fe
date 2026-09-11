// meat-management-fe/src/hooks/useCustomerGroups.js
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const STORAGE_PREFIX = 'saved_debt_customer_groups_';

/**
 * Custom Hook quản lý danh sách các nhóm khách hàng phục vụ xuất công nợ hàng loạt
 * - Tự động tải các nhóm khách hàng đã lưu từ localStorage
 * - Tự động liên kết lấy các nhóm chuỗi từ Cổng tra cứu Zalo (Portal Links) nếu có
 * - Cung cấp các thao tác: Lưu nhóm mới, Cập nhật nhóm, Xóa nhóm
 */
export const useCustomerGroups = (userId) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  const storageKey = `${STORAGE_PREFIX}${userId || 'default'}`;

  // Tải danh sách nhóm từ storage và portal links
  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      let savedList = [];
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          try {
            savedList = JSON.parse(raw);
          } catch (e) {
            savedList = [];
          }
        }
      }

      // Tải thêm các nhóm từ Portal Links nếu có
      let portalGroups = [];
      try {
        const portalRes = await api.get('/portal/manage/links');
        const links = portalRes.data?.data || [];
        portalGroups = links
          .filter(l => l.customers && l.customers.length > 0)
          .map(l => ({
            id: `portal_${l.id}`,
            name: `${l.name} (Zalo Portal)`,
            customerIds: l.customers.map(c => c?.id || c?.customerId || c?.customer?.id).filter(Boolean),
            source: 'portal',
            count: l.customers.length,
          }));
      } catch (portalErr) {
        // Bỏ qua nếu lỗi mạng hoặc không có quyền portal
      }

      // Kết hợp nhóm người dùng tự lưu và nhóm từ portal
      const allGroups = [
        ...savedList.map(g => ({ ...g, source: 'saved', count: (g.customerIds || []).length })),
        ...portalGroups,
      ];

      // Loại trùng: nếu 2 nhóm có cùng tập thành viên thì chỉ giữ 1 (ưu tiên nhóm tự tạo)
      const deduplicated = [];
      const seenSignatures = new Set();

      for (const g of allGroups) {
        // Tạo chữ ký dựa trên danh sách thành viên (sort để không phụ thuộc thứ tự)
        const sig = [...(g.customerIds || [])].sort().join(',');
        if (sig && seenSignatures.has(sig)) {
          // Đã tồn tại nhóm cùng thành viên → bỏ qua
          continue;
        }
        if (sig) seenSignatures.add(sig);
        deduplicated.push(g);
      }

      setGroups(deduplicated);
    } catch (err) {
      console.error('Lỗi khi tải danh sách nhóm khách hàng:', err);
    } finally {
      setLoading(false);
    }
  }, [storageKey]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Lưu nhóm mới hoặc cập nhật nhóm đã có
  const saveGroup = useCallback(async (name, customerIds) => {
    if (!name || !name.trim()) return null;
    const cleanName = name.trim();
    const cleanIds = Array.from(new Set(customerIds || []));

    let savedList = [];
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        try {
          savedList = JSON.parse(raw);
        } catch (e) {
          savedList = [];
        }
      }
    }

    const existingIdx = savedList.findIndex(g => g.name.toLowerCase() === cleanName.toLowerCase());
    let updatedList;
    let targetGroup;

    if (existingIdx >= 0) {
      // Cập nhật nhóm đã tồn tại
      savedList[existingIdx].customerIds = cleanIds;
      savedList[existingIdx].updatedAt = new Date().toISOString();
      targetGroup = savedList[existingIdx];
      updatedList = [...savedList];
    } else {
      // Tạo nhóm mới
      targetGroup = {
        id: `grp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: cleanName,
        customerIds: cleanIds,
        createdAt: new Date().toISOString(),
      };
      updatedList = [targetGroup, ...savedList];
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(storageKey, JSON.stringify(updatedList));
    }

    await loadGroups();
    return targetGroup;
  }, [storageKey, loadGroups]);

  // Xóa một nhóm đã lưu
  const deleteGroup = useCallback(async (groupId) => {
    let savedList = [];
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        try {
          savedList = JSON.parse(raw);
        } catch (e) {
          savedList = [];
        }
      }
    }

    const filtered = savedList.filter(g => g.id !== groupId);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(storageKey, JSON.stringify(filtered));
    }

    await loadGroups();
  }, [storageKey, loadGroups]);

  return {
    groups,
    loading,
    saveGroup,
    deleteGroup,
    refreshGroups: loadGroups,
  };
};
