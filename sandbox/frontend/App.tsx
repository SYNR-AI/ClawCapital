import React from "react";
import GameInterface from "./components/GameInterface";

const App: React.FC = () => {
  return (
    <div className="w-full h-screen flex items-center justify-center bg-[#1a1a1a] overflow-hidden">
      {/*
        Container ensures mobile-first portrait aspect ratio on desktop.
        On mobile, it takes full width/height.
        On desktop, it mimics a phone screen.
      */}
      <div className="relative w-full h-full sm:max-w-[400px] sm:max-h-[850px] sm:aspect-[9/19.5] sm:border-8 sm:border-neutral-800 sm:rounded-3xl overflow-hidden shadow-2xl bg-black">
        <GameInterface />
      </div>
    </div>
  );
};

export default App;
