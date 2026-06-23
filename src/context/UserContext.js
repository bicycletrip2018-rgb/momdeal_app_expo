import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UserContext = createContext(null);

const WOW_KEY = '@isWowMember';

export function UserProvider({ children }) {
  const [isWowMember, setIsWowMemberState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(WOW_KEY).then((val) => {
      if (val !== null) setIsWowMemberState(val === 'true');
    }).catch(() => {});
  }, []);

  const setIsWowMember = useCallback(async (val) => {
    setIsWowMemberState(val);
    try { await AsyncStorage.setItem(WOW_KEY, String(val)); } catch {}
  }, []);

  return (
    <UserContext.Provider value={{ isWowMember, setIsWowMember }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside UserProvider');
  return ctx;
}
