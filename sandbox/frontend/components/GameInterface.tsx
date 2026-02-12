import React, { useState, useMemo } from "react";
import messages from "../messages.json";
import DeskSection from "./DeskSection";
import WallSection from "./WallSection";

const isChinese = /^zh\b/i.test(navigator.language);

const GameInterface: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);

  const handleNext = () => {
    setMessageIndex((prev) => (prev + 1) % messages.length);
  };

  const currentMessage = useMemo(() => {
    const msg = messages[messageIndex];
    return {
      time: msg.time,
      date: msg.date,
      text: isChinese ? msg.text_zh : msg.text_en,
    };
  }, [messageIndex]);

  return (
    <div className="relative w-full h-full flex flex-col no-select">
      <img
        src="/background.png"
        alt="Room Background"
        className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none"
        style={{ imageRendering: "pixelated" }}
      />
      <WallSection message={currentMessage} isChinese={isChinese} />
      <DeskSection onNext={handleNext} />
    </div>
  );
};

export default GameInterface;
