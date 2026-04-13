import React, { createContext, useState } from 'react';

export const DeepLinkContext = createContext(null);

export const DeepLinkProvider = ({ children }) => {
  const [deepLinkIntent, setDeepLinkIntent] = useState(null);

  return (
    <DeepLinkContext.Provider value={{ deepLinkIntent, setDeepLinkIntent }}>
      {children}
    </DeepLinkContext.Provider>
  );
};
