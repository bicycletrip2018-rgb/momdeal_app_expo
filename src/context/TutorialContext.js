import React, { createContext, useContext, useState } from 'react';

const TutorialContext = createContext({ tutorialActive: false, setTutorialActive: () => {} });

export function TutorialProvider({ children }) {
  const [tutorialActive, setTutorialActive] = useState(false);
  return (
    <TutorialContext.Provider value={{ tutorialActive, setTutorialActive }}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  return useContext(TutorialContext);
}
