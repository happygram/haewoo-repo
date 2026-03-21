import React, { useEffect, useMemo, useState } from "react";
import { getKioskRoomConfig } from "../api.js";

export default function KioskView() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const roomId = params.get("roomId") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCaption, setShowCaption] = useState(false);
  const [displaySize, setDisplaySize] = useState("INCH27");
  const [activeSlide, setActiveSlide] = useState(null);

  async function refresh() {
    if (roomId) {
      setError("");
      setLoading(true);
      try {
        const res = await getKioskRoomConfig({ roomId });
        setShowCaption(Boolean(res.ui?.showCaption));
        const ds = res.ui?.displaySize;
        setDisplaySize(ds === "INCH32" ? "INCH32" : "INCH27");
        setActiveSlide(res.activeSlide || null);
        setLoading(false);
        return;
      } catch (e) {
        setError(e.message || "가져오기 실패");
        setLoading(false);
        return;
      }
    }
    setError("roomId가 URL에 필요합니다.");
    setLoading(false);
  }

  // 초기 + 주기적 갱신(관리자가 사진/시간을 바꿔도 키오스크가 따라오게)
  useEffect(() => {
    refresh();
    const t = window.setInterval(() => refresh(), 10000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const kioskClass =
    displaySize === "INCH32" ? "kiosk kiosk--inch32" : "kiosk kiosk--inch27";

  return (
    <div className={kioskClass}>
      {error ? <div className="kiosk-error">{error}</div> : null}

      {activeSlide?.imageUrl ? (
        <div className="frame">
          <div className="kiosk-img-wrap">
            <img className="bg" src={activeSlide.imageUrl} alt="" />
          </div>
          {showCaption ? (
            <div className="caption">
              <div className="caption-inner">{activeSlide.caption || ""}</div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="placeholder">
          <div className="placeholder-text">{loading ? "로딩 중..." : "표시할 사진이 없습니다."}</div>
        </div>
      )}
    </div>
  );
}

