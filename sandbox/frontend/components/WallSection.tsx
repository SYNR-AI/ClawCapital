import React from "react";
import Clock from "./Clock";

interface WallSectionProps {
  message?: { time: string; date: string; text: string };
  isChinese?: boolean;
}

const WallSection: React.FC<WallSectionProps> = ({ message, isChinese }) => {
  const showBeam = !!message;

  return (
    <div className="relative h-[65%] w-full z-10 flex items-center justify-center pt-8">
      {/* Frame / TV */}
      <div className="relative w-[75%] aspect-[16/9] flex items-center justify-center overflow-hidden"></div>

      {/* Lobster projected message text */}
      {message && (
        <div
          className="absolute z-10 flex justify-center pointer-events-none px-[15%]"
          style={{
            top: "27%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "85%",
          }}
        >
          <span
            className={
              isChinese
                ? "text-[14px] sm:text-[18px] leading-relaxed select-none text-left"
                : "font-press-start text-[8px] sm:text-[11px] leading-relaxed tracking-wide select-none text-left"
            }
            style={{
              ...(isChinese && { fontFamily: "'DotGothic16', monospace" }),
              color: "#444",
              textShadow: "0 1px 2px rgba(0,0,0,0.15)",
              whiteSpace: "pre-line",
            }}
          >
            {message.text}
          </span>
        </div>
      )}

      {/* Light beam cone: narrow at lobster head, wide at frame */}
      <div
        className="absolute z-20 pointer-events-none"
        style={{
          opacity: showBeam ? 1 : 0,
          transition: "opacity 0.5s ease-in-out",
          right: "10%",
          bottom: "-2%",
          width: "80%",
          height: "60%",
          clipPath: "polygon(88% 100%, 5% 0%, 60% 0%)",
          background:
            "linear-gradient(to top left, rgba(255,200,80,0.4) 0%, rgba(255,220,130,0.12) 40%, rgba(255,230,150,0.03) 80%)",
          filter: "blur(3px)",
        }}
      ></div>

      {/* Glow at lobster origin (its head) */}
      <div
        className="absolute z-20 pointer-events-none"
        style={{
          opacity: showBeam ? 0.8 : 0,
          transition: "opacity 0.5s ease-in-out",
          right: "15%",
          bottom: "-6%",
          width: "10%",
          height: "6%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(255,210,100,0.7), transparent 70%)",
          filter: "blur(5px)",
        }}
      ></div>

      {/* Clock */}
      <div className="absolute left-[7%] bottom-[-6%] w-[35%] h-[15%] flex items-center justify-center transform rotate-1 opacity-90">
        <Clock overrideTime={message?.time} overrideDate={message?.date} />
      </div>
      {/* Lobster */}
      <div className="absolute right-[5%] bottom-[-15%] w-[30%] aspect-square z-30">
        <div className="absolute bottom-[8%] left-[8%] w-[80%] h-[25%] bg-black/30 rounded-[50%] blur-sm transform scale-y-50"></div>
        <img
          src="/lobster.png"
          alt="The Lobster"
          className="w-full h-full object-contain drop-shadow-md pixelated select-none pointer-events-none"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
    </div>
  );
};

export default WallSection;
