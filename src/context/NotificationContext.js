import React, { createContext, useContext, useState } from 'react';

// Initial count matches MOCK_NOTIFICATIONS unread items (mn1 + mn3)
const INITIAL_UNREAD = 2;

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(INITIAL_UNREAD);

  function clearBadge() {
    setUnreadCount(0);
  }

  return (
    <NotificationContext.Provider value={{ unreadCount, clearBadge }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}
