import React, { useState, useEffect, useRef } from "react";

const INITIAL_VALUE = 100_000_000 + 500_000 * 253; // $226.5M

interface SettlementProps {
  portfolio: {
    cash: number;
    holdings: { symbol: string; qty: number; avgPrice: number }[];
    trades: { side: string; symbol: string; qty: number; price: number; date: string }[];
  };
  settlementPrice: number;
  isChinese: boolean;
  onPlayAgain: () => void;
}

type Phase = "shake" | "counting" | "reveal";

const SettlementOverlay: React.FC<SettlementProps> = ({
  portfolio,
  settlementPrice,
  isChinese,
  onPlayAgain,
}) => {
  const [phase, setPhase] = useState<Phase>("shake");
  const [displayPnl, setDisplayPnl] = useState(0);
  const animRef = useRef(0);

  const holdingsValue = portfolio.holdings.reduce((sum, h) => sum + h.qty * settlementPrice, 0);
  const totalValue = portfolio.cash + holdingsValue;
  const finalPnl = totalValue - INITIAL_VALUE;
  const pnlPct = (finalPnl / INITIAL_VALUE) * 100;
  const pnlPositive = finalPnl >= 0;
  const pnlColor = pnlPositive ? "#4ade80" : "#f87171";

  // Vibrate on mount
  useEffect(() => {
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100, 50, 200, 100, 300, 50, 100]);
    }
  }, []);

  // Phase: shake → counting after 2s
  useEffect(() => {
    const timer = setTimeout(() => setPhase("counting"), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Counting animation (2s ease-out)
  useEffect(() => {
    if (phase !== "counting") {
      return;
    }

    const duration = 2000;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayPnl(finalPnl * eased);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayPnl(finalPnl);
        setPhase("reveal");
        if (navigator.vibrate) {
          navigator.vibrate([200]);
        }
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase, finalPnl]);

  const fontFamily = isChinese ? "system-ui, -apple-system, sans-serif" : undefined;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        backgroundColor: "rgba(0,0,0,0.92)",
        animation: phase === "shake" ? "settlementShake 0.08s infinite" : undefined,
      }}
    >
      {/* Flash overlay at transition */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: "white",
          opacity: 0,
          animation: phase === "counting" ? "settlementFlash 0.6s ease-out" : undefined,
        }}
      />

      {/* Title */}
      <div
        style={{
          opacity: phase === "shake" ? 0 : 1,
          transform: phase === "shake" ? "scale(0.8)" : "scale(1)",
          transition: "all 0.5s ease-out",
        }}
      >
        <h1
          className={isChinese ? "text-[24px] font-bold" : "font-press-start text-[18px]"}
          style={{
            color: "#b8cc33",
            textShadow: "0 0 10px rgba(184,204,51,0.5)",
            textAlign: "center",
          }}
        >
          {isChinese ? "最终结算" : "SETTLEMENT"}
        </h1>
      </div>

      {/* Settlement date & price */}
      <div
        className={isChinese ? "mb-8 mt-2" : "mb-8 mt-2 font-press-start"}
        style={{
          opacity: phase === "shake" ? 0 : 1,
          transition: "opacity 0.5s ease-out 0.2s",
          color: "#888",
          fontSize: isChinese ? "13px" : "9px",
          fontFamily,
          textAlign: "center",
        }}
      >
        {isChinese ? "结算价" : "Settlement"}: GOOG ${settlementPrice.toFixed(2)}
      </div>

      {/* P&L — big number */}
      <div
        className="text-center mb-4"
        style={{
          opacity: phase === "shake" ? 0 : 1,
          transform:
            phase === "reveal" ? "scale(1)" : phase === "counting" ? "scale(0.95)" : "scale(0.7)",
          transition: "all 0.5s ease-out",
        }}
      >
        <div
          style={{
            fontSize: "52px",
            fontWeight: 900,
            color: pnlColor,
            textShadow:
              phase === "reveal" ? `0 0 20px ${pnlColor}, 0 0 50px ${pnlColor}50` : "none",
            transition: "text-shadow 0.5s",
            fontFamily: "system-ui, -apple-system, sans-serif",
            lineHeight: 1.2,
          }}
        >
          {displayPnl >= 0 ? "+" : ""}${(displayPnl / 1e6).toFixed(2)}M
        </div>
        <div
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: pnlColor,
            opacity: phase === "reveal" ? 1 : 0,
            transform: phase === "reveal" ? "translateY(0)" : "translateY(10px)",
            transition: "all 0.4s ease-out 0.2s",
          }}
        >
          {pnlPositive ? "+" : ""}
          {pnlPct.toFixed(2)}%
        </div>
      </div>

      {/* Breakdown */}
      <div
        style={{
          opacity: phase === "reveal" ? 1 : 0,
          transform: phase === "reveal" ? "translateY(0)" : "translateY(20px)",
          transition: "all 0.5s ease-out 0.3s",
          color: "#aaa",
          fontSize: isChinese ? "13px" : "9px",
          fontFamily,
          textAlign: "center",
          lineHeight: 2,
        }}
      >
        <div>
          {isChinese ? "现金" : "Cash"}: ${(portfolio.cash / 1e6).toFixed(2)}M
        </div>
        {portfolio.holdings.map((h, i) => (
          <div key={i}>
            {h.symbol}: {(h.qty / 1000).toFixed(2)}K @ ${settlementPrice.toFixed(1)} = $
            {((h.qty * settlementPrice) / 1e6).toFixed(2)}M
          </div>
        ))}
        <div
          style={{
            borderTop: "1px solid #444",
            marginTop: "4px",
            paddingTop: "4px",
            color: "#ccc",
            fontWeight: 600,
          }}
        >
          {isChinese ? "总资产" : "Total"}: ${(totalValue / 1e6).toFixed(2)}M
        </div>
      </div>

      {/* Trades count */}
      <div
        className={isChinese ? "" : "font-press-start"}
        style={{
          opacity: phase === "reveal" ? 1 : 0,
          transition: "opacity 0.5s ease-out 0.6s",
          color: "#666",
          fontSize: isChinese ? "12px" : "7px",
          marginTop: "16px",
          fontFamily,
        }}
      >
        {isChinese
          ? `共执行 ${portfolio.trades.length} 笔交易`
          : `${portfolio.trades.length} trade${portfolio.trades.length !== 1 ? "s" : ""} executed`}
      </div>

      {/* Play Again */}
      <button
        onClick={onPlayAgain}
        className={isChinese ? "" : "font-press-start"}
        style={{
          opacity: phase === "reveal" ? 1 : 0,
          transition: "opacity 0.5s ease-out 0.8s",
          marginTop: "28px",
          padding: "10px 28px",
          border: "2px solid #b8cc33",
          borderRadius: "8px",
          backgroundColor: "transparent",
          color: "#b8cc33",
          fontSize: isChinese ? "15px" : "11px",
          fontFamily,
          cursor: phase === "reveal" ? "pointer" : "default",
          pointerEvents: phase === "reveal" ? "auto" : "none",
        }}
      >
        {isChinese ? "再来一局" : "PLAY AGAIN"}
      </button>

      <style>{`
        @keyframes settlementShake {
          0%   { transform: translate(0, 0) rotate(0deg); }
          10%  { transform: translate(-6px, 3px) rotate(-0.8deg); }
          20%  { transform: translate(5px, -4px) rotate(0.6deg); }
          30%  { transform: translate(-3px, 5px) rotate(-0.4deg); }
          40%  { transform: translate(6px, -2px) rotate(0.8deg); }
          50%  { transform: translate(-4px, -3px) rotate(-0.6deg); }
          60%  { transform: translate(3px, 4px) rotate(0.3deg); }
          70%  { transform: translate(-5px, -1px) rotate(-0.5deg); }
          80%  { transform: translate(4px, 3px) rotate(0.7deg); }
          90%  { transform: translate(-2px, -4px) rotate(-0.3deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        @keyframes settlementFlash {
          0% { opacity: 0.7; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default SettlementOverlay;
