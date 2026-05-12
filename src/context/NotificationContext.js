import React, { createContext, useContext, useState } from 'react';
import * as Notifications from 'expo-notifications';

const INITIAL_UNREAD = 2;

const NotificationContext = createContext(null);

async function checkOsPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  return status !== 'denied';
}

export function NotificationProvider({ children }) {
  const [unreadCount,    setUnreadCount]    = useState(INITIAL_UNREAD);
  const [priceAlerts,    setPriceAlertsRaw] = useState(true);
  const [activityAlerts, setActivityAlerts] = useState(false);

  function clearBadge() { setUnreadCount(0); }

  async function setPriceAlerts(val) {
    if (!val) { setPriceAlertsRaw(false); return true; }
    const granted = await checkOsPermission();
    if (!granted) return false;
    setPriceAlertsRaw(true);
    return true;
  }

  async function toggleActivityAlerts(val) {
    if (!val) { setActivityAlerts(false); return true; }
    const granted = await checkOsPermission();
    if (!granted) return false;
    setActivityAlerts(true);
    return true;
  }

  return (
    <NotificationContext.Provider value={{
      unreadCount, clearBadge,
      priceAlerts,    setPriceAlerts,
      activityAlerts, setActivityAlerts: toggleActivityAlerts,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}
